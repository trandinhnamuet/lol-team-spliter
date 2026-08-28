import { NextResponse } from "next/server";
import { balanceTeams } from "@/lib/balance";
import { eloForRank } from "@/lib/elo";
import { getAccountByRiotId, getRankByPuuid, parseRiotId, RiotApiError } from "@/lib/riot";
import { getConfig, getEvent } from "@/lib/store";
import type { ResolvedPlayer } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

interface SplitRequest {
  riotIds?: string[];
  eventId?: string;
  /** Số người mỗi team, mặc định 5. */
  teamSize?: number;
}

/**
 * Nhận danh sách Riot ID (hoặc eventId của link đăng ký), tra rank từng người
 * qua Riot API, gán elo theo bảng cấu hình rồi chia team cân bằng.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as SplitRequest;
  const teamSize = Math.floor(Number(body.teamSize));
  if (body.teamSize !== undefined && (!Number.isFinite(teamSize) || teamSize < 1 || teamSize > 20)) {
    return NextResponse.json({ error: "Số người mỗi team phải từ 1 đến 20" }, { status: 400 });
  }
  const cfg = await getConfig();
  if (!cfg.riotApiKey) {
    return NextResponse.json({ error: "Chưa cấu hình Riot API key" }, { status: 503 });
  }

  // Gom input: từ list dán tay hoặc từ sự kiện đăng ký
  let inputs: { label: string; riotId: string; puuid?: string }[] = [];
  if (body.eventId) {
    const event = await getEvent(body.eventId);
    if (!event) {
      return NextResponse.json({ error: "Không tìm thấy sự kiện" }, { status: 404 });
    }
    inputs = event.players.map((p) => ({
      label: p.displayName ? `${p.displayName} (${p.riotId})` : p.riotId,
      riotId: p.riotId,
      puuid: p.puuid,
    }));
  } else if (Array.isArray(body.riotIds)) {
    inputs = body.riotIds
      .map((s) => s.trim())
      .filter(Boolean)
      .map((riotId) => ({ label: riotId, riotId }));
  }

  if (inputs.length < 2) {
    return NextResponse.json({ error: "Cần ít nhất 2 người chơi" }, { status: 400 });
  }
  if (inputs.length > 100) {
    return NextResponse.json({ error: "Tối đa 100 người chơi mỗi lần" }, { status: 400 });
  }

  const resolved: ResolvedPlayer[] = [];
  for (const input of inputs) {
    try {
      let puuid = input.puuid;
      let gameName: string | undefined;
      let tagLine: string | undefined;

      if (!puuid) {
        const parsed = parseRiotId(input.riotId);
        if (!parsed) {
          resolved.push({ input: input.label, ok: false, error: "Sai định dạng Tên#TAG" });
          continue;
        }
        const account = await getAccountByRiotId(
          cfg.riotApiKey,
          cfg.platform,
          parsed.gameName,
          parsed.tagLine
        );
        if (!account) {
          resolved.push({ input: input.label, ok: false, error: "Không tìm thấy tài khoản" });
          continue;
        }
        puuid = account.puuid;
        gameName = account.gameName;
        tagLine = account.tagLine;
      }

      const rank = await getRankByPuuid(cfg.riotApiKey, cfg.platform, puuid);
      resolved.push({
        input: input.label,
        ok: true,
        gameName,
        tagLine,
        puuid,
        rank,
        elo: eloForRank(rank, cfg.eloMap),
      });
    } catch (e) {
      if (e instanceof RiotApiError && (e.status === 401 || e.status === 403)) {
        return NextResponse.json(
          { error: "Riot API key hết hạn hoặc không hợp lệ. Vào Admin để nhập key mới." },
          { status: 503 }
        );
      }
      const msg = e instanceof RiotApiError ? e.message : "Lỗi khi gọi Riot API";
      resolved.push({ input: input.label, ok: false, error: msg });
    }
  }

  const okPlayers = resolved.filter((p) => p.ok);
  const failed = resolved.filter((p) => !p.ok);

  if (okPlayers.length < 2) {
    return NextResponse.json(
      { error: "Không đủ người chơi hợp lệ để chia team", players: resolved },
      { status: 400 }
    );
  }

  const result = balanceTeams(okPlayers, body.teamSize !== undefined ? teamSize : undefined);
  return NextResponse.json({ players: resolved, failed, result });
}

import { NextResponse } from "next/server";
import { balanceTeams } from "@/lib/balance";
import { eloForRank } from "@/lib/elo";
import { isKnownRegion } from "@/lib/region";
import {
  getAccountByRiotId,
  getDdragonVersion,
  getRankByPuuid,
  getSummonerByPuuid,
  normalizeRiotId,
  parseRiotId,
  profileIconUrl,
  RiotApiError,
} from "@/lib/riot";
import { getConfig, getEvent } from "@/lib/store";
import type { ResolvedPlayer } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

interface SplitRequest {
  riotIds?: string[];
  eventId?: string;
  /** Số người mỗi team, mặc định 5. */
  teamSize?: number;
  /** Khu vực/server dùng để tra rank — do client chọn, mặc định theo cấu hình server. */
  platform?: string;
}

/**
 * Nhận danh sách Riot ID (hoặc eventId của link đăng ký), tra rank từng người
 * qua Riot API, gán elo theo bảng cấu hình rồi chia team cân bằng.
 *
 * Trả về stream NDJSON để client hiện tiến độ:
 *   {"type":"start","total":n}
 *   {"type":"progress","done":i,"total":n}   — sau mỗi người tra xong
 *   {"type":"result","players":…,"failed":…,"result":…}
 *   {"type":"error","error":…,"players":…?}  — lỗi giữa chừng rồi kết thúc
 * Lỗi validate trước khi bắt đầu vẫn trả JSON thường kèm HTTP status.
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
  if (body.platform !== undefined && !isKnownRegion(String(body.platform))) {
    return NextResponse.json({ error: "Khu vực không hợp lệ" }, { status: 400 });
  }
  const platform = body.platform?.toLowerCase() || cfg.platform;

  // Gom input: từ list dán tay hoặc từ sự kiện đăng ký
  let inputs: {
    label: string;
    riotId: string;
    puuid?: string;
    gameName?: string;
    tagLine?: string;
  }[] = [];
  if (body.eventId) {
    const event = await getEvent(body.eventId);
    if (!event) {
      return NextResponse.json({ error: "Không tìm thấy sự kiện" }, { status: 404 });
    }
    inputs = event.players.map((p) => ({
      label: p.displayName ? `${p.displayName} (${p.riotId})` : p.riotId,
      riotId: p.riotId,
      puuid: p.puuid,
      gameName: p.gameName,
      tagLine: p.tagLine,
    }));
  } else if (Array.isArray(body.riotIds)) {
    inputs = body.riotIds
      .map((s) => normalizeRiotId(String(s)))
      .filter(Boolean)
      .map((riotId) => ({ label: riotId, riotId }));
  }

  if (inputs.length < 2) {
    return NextResponse.json({ error: "Cần ít nhất 2 người chơi" }, { status: 400 });
  }
  if (inputs.length > 100) {
    return NextResponse.json({ error: "Tối đa 100 người chơi mỗi lần" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        send({ type: "start", total: inputs.length });

        const ddVersion = await getDdragonVersion();
        const resolved: ResolvedPlayer[] = [];
        let done = 0;
        for (const input of inputs) {
          try {
            let puuid = input.puuid;
            let gameName: string | undefined = input.gameName;
            let tagLine: string | undefined = input.tagLine;

            if (!puuid) {
              const parsed = parseRiotId(input.riotId);
              if (!parsed) {
                resolved.push({ input: input.label, ok: false, error: "Sai định dạng Tên#TAG" });
                send({ type: "progress", done: ++done, total: inputs.length });
                continue;
              }
              const account = await getAccountByRiotId(
                cfg.riotApiKey,
                platform,
                parsed.gameName,
                parsed.tagLine
              );
              if (!account) {
                resolved.push({ input: input.label, ok: false, error: "Không tìm thấy tài khoản" });
                send({ type: "progress", done: ++done, total: inputs.length });
                continue;
              }
              puuid = account.puuid;
              gameName = account.gameName;
              tagLine = account.tagLine;
            }

            const rank = await getRankByPuuid(cfg.riotApiKey, platform, puuid);

            // Icon + cấp độ tài khoản: lỗi ở đây không làm hỏng người chơi, chỉ thiếu avatar
            let avatarUrl: string | undefined;
            let summonerLevel: number | undefined;
            try {
              const summoner = await getSummonerByPuuid(cfg.riotApiKey, platform, puuid);
              if (summoner) {
                avatarUrl = profileIconUrl(ddVersion, summoner.profileIconId);
                summonerLevel = summoner.summonerLevel;
              }
            } catch {
              /* bỏ qua — hiển thị không có avatar */
            }

            resolved.push({
              input: input.label,
              ok: true,
              gameName,
              tagLine,
              puuid,
              rank,
              elo: eloForRank(rank, cfg.eloMap),
              avatarUrl,
              summonerLevel,
            });
          } catch (e) {
            if (e instanceof RiotApiError && (e.status === 401 || e.status === 403)) {
              send({
                type: "error",
                error: "Riot API key hết hạn hoặc không hợp lệ. Vào Admin để nhập key mới.",
              });
              controller.close();
              return;
            }
            const msg = e instanceof RiotApiError ? e.message : "Lỗi khi gọi Riot API";
            resolved.push({ input: input.label, ok: false, error: msg });
          }
          send({ type: "progress", done: ++done, total: inputs.length });
        }

        const okPlayers = resolved.filter((p) => p.ok);
        const failed = resolved.filter((p) => !p.ok);

        if (okPlayers.length < 2) {
          send({
            type: "error",
            error: "Không đủ người chơi hợp lệ để chia team",
            players: resolved,
          });
          controller.close();
          return;
        }

        const result = balanceTeams(okPlayers, body.teamSize !== undefined ? teamSize : undefined);
        send({ type: "result", players: resolved, failed, result: { ...result, platform } });
        controller.close();
      } catch {
        try {
          send({ type: "error", error: "Lỗi không xác định trên server" });
          controller.close();
        } catch {
          /* stream đã đóng */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      // tắt buffering của nginx để progress đến client ngay lập tức
      "X-Accel-Buffering": "no",
    },
  });
}

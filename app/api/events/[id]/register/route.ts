import { NextResponse } from "next/server";
import { getAccountByRiotId, parseRiotId, RiotApiError } from "@/lib/riot";
import { getConfig, getEvent, updateEvent } from "@/lib/store";
import type { EventPlayer } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Game thủ đăng ký vào sự kiện: server xác thực lại Riot ID rồi lưu kèm PUUID. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const event = await getEvent(id);
  if (!event) {
    return NextResponse.json({ error: "Không tìm thấy sự kiện" }, { status: 404 });
  }
  if (!event.open) {
    return NextResponse.json({ error: "Sự kiện đã đóng đăng ký" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    riotId?: string;
    displayName?: string;
  };
  const parsed = parseRiotId(body.riotId ?? "");
  if (!parsed) {
    return NextResponse.json(
      { error: "Sai định dạng. Nhập dạng: TênInGame#TAG" },
      { status: 400 }
    );
  }

  const cfg = await getConfig();
  if (!cfg.riotApiKey) {
    return NextResponse.json({ error: "Server chưa cấu hình Riot API key" }, { status: 503 });
  }

  try {
    const account = await getAccountByRiotId(
      cfg.riotApiKey,
      cfg.platform,
      parsed.gameName,
      parsed.tagLine
    );
    if (!account) {
      return NextResponse.json({ error: "Không tìm thấy tài khoản này" }, { status: 400 });
    }

    const player: EventPlayer = {
      displayName: (body.displayName ?? "").trim().slice(0, 50),
      riotId: `${account.gameName}#${account.tagLine}`,
      gameName: account.gameName,
      tagLine: account.tagLine,
      puuid: account.puuid,
      registeredAt: new Date().toISOString(),
    };

    const result = await updateEvent(id, (e) => {
      if (e.players.some((p) => p.puuid === player.puuid)) {
        return "Tài khoản này đã đăng ký rồi";
      }
      return { ...e, players: [...e.players, player] };
    });
    if (typeof result === "string") {
      return NextResponse.json({ error: result }, { status: 409 });
    }
    return NextResponse.json({ ok: true, player });
  } catch (e) {
    const msg = e instanceof RiotApiError ? e.message : "Lỗi khi gọi Riot API";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

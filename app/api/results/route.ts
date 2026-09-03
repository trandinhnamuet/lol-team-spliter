import { NextResponse } from "next/server";
import { listResults, saveResult } from "@/lib/store";
import type { ResolvedPlayer, TeamResult } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Danh sách tóm tắt các kết quả đã lưu, mới nhất trước — dùng cho trang /results. */
export async function GET() {
  const results = await listResults();
  return NextResponse.json({
    results: results.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      teamCount: r.result.teams.length,
      teamSize: r.result.teamSize,
      playerCount:
        r.result.teams.reduce((s, t) => s + t.players.length + (t.reserve ? 1 : 0), 0) +
        r.result.bench.length,
      spread: r.result.spread,
    })),
  });
}

/** Lưu kết quả chia team để xem lại qua link /result/[id]. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    result?: TeamResult;
    failed?: ResolvedPlayer[];
  };
  const r = body.result;
  if (!r || !Array.isArray(r.teams) || r.teams.length === 0 || !Array.isArray(r.bench)) {
    return NextResponse.json({ error: "Thiếu kết quả chia team hợp lệ" }, { status: 400 });
  }
  // chặn payload bất thường
  const totalPlayers =
    r.teams.reduce((s, t) => s + (t.players?.length ?? 0), 0) + r.bench.length;
  if (totalPlayers < 2 || totalPlayers > 200) {
    return NextResponse.json({ error: "Kết quả không hợp lệ" }, { status: 400 });
  }
  const saved = await saveResult(r, Array.isArray(body.failed) ? body.failed.slice(0, 100) : []);
  return NextResponse.json({ id: saved.id, createdAt: saved.createdAt });
}

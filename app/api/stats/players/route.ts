import { NextResponse } from "next/server";
import { isKnownRegion } from "@/lib/region";
import { isDbConfigured } from "@/lib/stats/db";
import { listPlayers } from "@/lib/stats/queries";
import { getConfig } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Danh sách ingame đã phát hiện: ?platform=vn2&q=ten&page=1&pageSize=50 */
export async function GET(req: Request) {
  if (!isDbConfigured()) return NextResponse.json({ error: "Chưa cấu hình PostgreSQL" }, { status: 503 });
  const sp = new URL(req.url).searchParams;
  const cfg = await getConfig();
  const platform = (sp.get("platform") ?? cfg.platform).toLowerCase();
  if (!isKnownRegion(platform)) return NextResponse.json({ error: "Khu vực không hợp lệ" }, { status: 400 });
  const page = Math.max(1, Math.floor(Number(sp.get("page") ?? 1)) || 1);
  const pageSize = Math.min(200, Math.max(10, Math.floor(Number(sp.get("pageSize") ?? 50)) || 50));
  try {
    return NextResponse.json(await listPlayers({ platform, q: sp.get("q") ?? "", page, pageSize }));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Lỗi database" }, { status: 500 });
  }
}

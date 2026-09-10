import { NextResponse } from "next/server";
import { isKnownRegion } from "@/lib/region";
import { isDbConfigured } from "@/lib/stats/db";
import { getChampionStats } from "@/lib/stats/queries";
import { getConfig } from "@/lib/store";

export const dynamic = "force-dynamic";

const TIERS = new Set([
  "IRON",
  "BRONZE",
  "SILVER",
  "GOLD",
  "PLATINUM",
  "EMERALD",
  "DIAMOND",
  "MASTER",
  "GRANDMASTER",
  "CHALLENGER",
]);

/**
 * Thống kê tướng theo bộ lọc:
 *   ?platform=vn2&tiers=SILVER,GOLD&queues=420&minGames=5
 * tiers rỗng/thiếu = mọi bậc; queues rỗng = mọi queue đã thu thập.
 */
export async function GET(req: Request) {
  if (!isDbConfigured()) return NextResponse.json({ error: "Chưa cấu hình PostgreSQL" }, { status: 503 });
  const sp = new URL(req.url).searchParams;
  const cfg = await getConfig();
  const platform = (sp.get("platform") ?? cfg.platform).toLowerCase();
  if (!isKnownRegion(platform)) return NextResponse.json({ error: "Khu vực không hợp lệ" }, { status: 400 });

  const tiers = (sp.get("tiers") ?? "")
    .split(",")
    .map((t) => t.trim().toUpperCase())
    .filter((t) => TIERS.has(t));
  const queueIds = (sp.get("queues") ?? "")
    .split(",")
    .map((q) => Number(q))
    .filter((q) => q === 420 || q === 440);
  const minGames = Math.min(1000, Math.max(1, Math.floor(Number(sp.get("minGames") ?? 5)) || 1));

  try {
    const data = await getChampionStats({
      platform,
      tiers: tiers.length ? tiers : null,
      queueIds: queueIds.length ? queueIds : null,
      minGames,
    });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Lỗi database" }, { status: 500 });
  }
}

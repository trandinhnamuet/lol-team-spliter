import { NextResponse } from "next/server";
import { isKnownRegion } from "@/lib/region";
import { RiotApiError } from "@/lib/riot";
import { snapshotKeys } from "@/lib/riot-limiter";
import { allRiotKeys, getConfig } from "@/lib/store";
import { CrawlError, ensureWatchdog, getLatestJob, pauseJob, resumeJob, startJob } from "@/lib/stats/crawler";
import { isDbConfigured } from "@/lib/stats/db";
import { getSummary } from "@/lib/stats/queries";
import type { CrawlStatusResponse } from "@/lib/stats/types";

export const dynamic = "force-dynamic";

// Chốt an toàn bên cạnh instrumentation.ts: bật watchdog ngay khi module route này được nạp
// (ví dụ lần poll GET đầu tiên từ trang /stats) — vô hại nếu đã bật (ensureWatchdog idempotent).
if (isDbConfigured()) ensureWatchdog();

const ALLOWED_QUEUES = [420, 440];

async function buildStatus(platform: string): Promise<CrawlStatusResponse> {
  const cfg = await getConfig();
  const keys = snapshotKeys(allRiotKeys(cfg), cfg.riotApiKey);
  if (!isDbConfigured()) {
    return { dbConfigured: false, job: null, runnerActive: false, summary: null, keys };
  }
  try {
    const [job, summary] = await Promise.all([getLatestJob(platform), getSummary(platform)]);
    // getLatestJob đã chuyển job "running" mất nhịp tim → paused, nên còn "running" là đang chạy thật
    return { dbConfigured: true, job, runnerActive: job?.status === "running", summary, keys };
  } catch (e) {
    return {
      dbConfigured: true,
      dbError: e instanceof Error ? e.message : "Lỗi kết nối database",
      job: null,
      runnerActive: false,
      summary: null,
      keys,
    };
  }
}

function resolvePlatform(raw: string | null | undefined, fallback: string): string | null {
  if (!raw) return fallback;
  const p = raw.toLowerCase();
  return isKnownRegion(p) ? p : null;
}

/** Trạng thái crawler + tổng quan dữ liệu của platform (?platform=vn2). */
export async function GET(req: Request) {
  const cfg = await getConfig();
  const platform = resolvePlatform(new URL(req.url).searchParams.get("platform"), cfg.platform);
  if (!platform) return NextResponse.json({ error: "Khu vực không hợp lệ" }, { status: 400 });
  return NextResponse.json(await buildStatus(platform));
}

interface CrawlBody {
  action?: "start" | "pause" | "resume";
  platform?: string;
  riotId?: string;
  queueIds?: number[];
  matchesPerPlayer?: number;
  maxPlayers?: number;
  maxDepth?: number;
  /** Chế độ 24/7: không dừng, ép maxPlayers/maxDepth = 0 (không giới hạn) bất kể 2 tham số trên. */
  autoRestart?: boolean;
}

/** Điều khiển crawler: start (cần riotId + tuỳ chọn), pause, resume. Trả trạng thái mới. */
export async function POST(req: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "Chưa cấu hình PostgreSQL (DB_HOST/DB_USERNAME/DB_NAME)" }, { status: 503 });
  }
  const body = (await req.json().catch(() => ({}))) as CrawlBody;
  const cfg = await getConfig();
  const platform = resolvePlatform(body.platform, cfg.platform);
  if (!platform) return NextResponse.json({ error: "Khu vực không hợp lệ" }, { status: 400 });

  try {
    if (body.action === "pause") {
      await pauseJob(platform);
    } else if (body.action === "resume") {
      await resumeJob(platform);
    } else if (body.action === "start") {
      const riotId = String(body.riotId ?? "").trim();
      if (!riotId) return NextResponse.json({ error: "Thiếu Riot ID gốc (Tên#TAG)" }, { status: 400 });
      const queueIds = Array.isArray(body.queueIds)
        ? body.queueIds.map(Number).filter((q) => ALLOWED_QUEUES.includes(q))
        : [420];
      if (queueIds.length === 0) return NextResponse.json({ error: "Chọn ít nhất một chế độ xếp hạng" }, { status: 400 });
      const autoRestart = Boolean(body.autoRestart);
      const matchesPerPlayer = clampInt(body.matchesPerPlayer, 1, 100, 20);
      // Chế độ 24/7 ép luôn 0 (không giới hạn) ở lib/stats/crawler.ts#startJob, giá trị ở đây
      // chỉ dùng khi KHÔNG bật autoRestart nên vẫn giữ min 1 cho form thường.
      const maxPlayers = clampInt(body.maxPlayers, 1, 1_000_000, 200);
      const maxDepth = clampInt(body.maxDepth, 0, 50, 3);
      if (matchesPerPlayer === null || maxPlayers === null || maxDepth === null) {
        return NextResponse.json({ error: "Tham số không hợp lệ" }, { status: 400 });
      }
      await startJob({ platform, riotId, queueIds, matchesPerPlayer, maxPlayers, maxDepth, autoRestart });
    } else {
      return NextResponse.json({ error: "action phải là start | pause | resume" }, { status: 400 });
    }
  } catch (e) {
    if (e instanceof CrawlError) return NextResponse.json({ error: e.message }, { status: 400 });
    if (e instanceof RiotApiError) return NextResponse.json({ error: e.message }, { status: 502 });
    const msg = e instanceof Error ? e.message : "Lỗi không xác định";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
  return NextResponse.json(await buildStatus(platform));
}

/** Số nguyên trong [min,max]; undefined → mặc định; sai kiểu → null. */
function clampInt(v: unknown, min: number, max: number, dflt: number): number | null {
  if (v === undefined || v === null || v === "") return dflt;
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

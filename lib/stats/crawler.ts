import {
  getAccountByRiotId,
  getMatchDetail,
  getRankByPuuid,
  getRankedMatchIds,
  parseRiotId,
  RiotApiError,
  type MatchDetail,
} from "@/lib/riot";
import { getLimiter, KeyPool } from "@/lib/riot-limiter";
import { allRiotKeys, getConfig } from "@/lib/store";
import { query, withTransaction } from "./db";
import type { CrawlJob, CrawlJobStatus, CrawlOptions } from "./types";

/**
 * Crawler đệ quy: từ một Riot ID gốc → tra rank + lịch sử xếp hạng → phát hiện 9 người khác
 * mỗi trận → đưa vào frontier (BFS theo độ sâu) → lặp. Chạy nền trong tiến trình server,
 * trạng thái nằm trong Postgres (schema lol) nên tạm dừng / tiếp tục / khởi động lại đều được.
 *
 * Nguyên tắc tiết kiệm request Riot API:
 *  - Mỗi người chỉ tốn 2 request cố định (rank + danh sách match id); trận đã có trong DB
 *    KHÔNG tải lại (dedupe theo match_id trước khi gọi API).
 *  - Không tra rank cả 10 người mỗi trận. Rank của trận (est_tier) = trung vị rank những
 *    người trong trận đã biết rank — ban đầu là người đang crawl, càng crawl sâu càng chính xác
 *    (matchmaking xếp hạng ghép người cùng mức nên sai số thường ≤ 1 bậc).
 *  - Nhiều key: KeyPool chọn key sẵn sàng sớm nhất cho từng request — không bao giờ vượt rate
 *    limit vì mọi request đều đi qua limiter (xem riot-limiter.ts), chỉ bị CHỜ chứ không bị 429.
 *
 * Chế độ 24/7 (`autoRestart`): maxPlayers/maxDepth bị ép về 0 (không giới hạn). Khi hết người
 * "pending" mới để mở rộng, thay vì dừng (done), job đưa người đã crawl LÂU NHẤT quay lại hàng
 * đợi để tải trận mới của họ — mọi người trong mạng lưới lần lượt được làm mới, vòng lặp không
 * bao giờ kết thúc, tốc độ hoàn toàn do rate limit của (các) key quyết định. Job cũng tự
 * "Tiếp tục" (xem `watchdogTick`) sau khi server restart hoặc sau khi hết key rồi được thêm key
 * mới — không cần bấm tay, TRỪ khi key Riot (loại dev) hết hạn và cần dán key mới.
 */

const TIER_ORDER = [
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
];
/** Rank cũ hơn mức này thì tra lại khi crawl lại người đó. */
const RANK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Dừng job nếu lỗi liên tiếp (DB/mạng) quá nhiều. */
const MAX_CONSECUTIVE_ERRORS = 8;
/**
 * Nhịp tim: vòng lặp đang chạy ghi `updated_at = now()` mỗi 30s (kể cả khi đang chờ rate limit).
 * Job "running" mà quá HEARTBEAT_STALE_S không có nhịp tim → tiến trình đã chết (server restart/crash)
 * → được coi là paused và watchdog sẽ tự tiếp tục. Trạng thái sống/chết dựa trên DB thay vì biến
 * trong bộ nhớ vì handler API và vòng lặp có thể nằm ở module context khác nhau (HMR/dev) — dùng
 * biến bộ nhớ từng khiến job đang chạy bị coi nhầm là "server khởi động lại" và bị dừng oan.
 */
const HEARTBEAT_MS = 30_000;
const HEARTBEAT_STALE_S = 120;

export class CrawlError extends Error {}

interface Runner {
  jobId: number;
  stopRequested: boolean;
  promise: Promise<void>;
}

declare global {
  var __lolCrawlRunner: Runner | null | undefined;
}

const runner = () => globalThis.__lolCrawlRunner ?? null;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface JobRow {
  id: number;
  platform: string;
  root_riot_id: string;
  root_puuid: string | null;
  status: CrawlJobStatus;
  queue_ids: number[];
  matches_per_player: number;
  max_players: number;
  max_depth: number;
  auto_restart: boolean;
  players_crawled: number;
  players_ranked: number;
  matches_added: number;
  matches_skipped: number;
  requests_made: number;
  note: string | null;
  last_error: string | null;
  started_at: Date;
  updated_at: Date;
  finished_at: Date | null;
  /** Giây kể từ nhịp tim cuối (tính phía DB để tránh lệch giờ) — chỉ có khi SELECT bằng JOB_SELECT. */
  idle_seconds?: number;
}

/** SELECT chuẩn cho crawl_jobs: kèm idle_seconds để xét nhịp tim. */
const JOB_SELECT = "SELECT *, EXTRACT(EPOCH FROM (now() - updated_at))::float AS idle_seconds FROM lol.crawl_jobs";

function mapJob(r: JobRow): CrawlJob {
  return {
    id: r.id,
    platform: r.platform,
    rootRiotId: r.root_riot_id,
    rootPuuid: r.root_puuid,
    status: r.status,
    queueIds: r.queue_ids,
    matchesPerPlayer: r.matches_per_player,
    maxPlayers: r.max_players,
    maxDepth: r.max_depth,
    autoRestart: r.auto_restart,
    playersCrawled: r.players_crawled,
    playersRanked: r.players_ranked,
    matchesAdded: r.matches_added,
    matchesSkipped: r.matches_skipped,
    requestsMade: r.requests_made,
    note: r.note,
    lastError: r.last_error,
    startedAt: r.started_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
    finishedAt: r.finished_at ? r.finished_at.toISOString() : null,
  };
}

async function loadJob(id: number): Promise<CrawlJob | null> {
  const rows = await query<JobRow>(`${JOB_SELECT} WHERE id = $1`, [id]);
  return rows[0] ? mapJob(rows[0]) : null;
}

/**
 * Job mới nhất của platform. Job "running" mà nhịp tim đã tắt quá HEARTBEAT_STALE_S (tiến trình
 * cũ đã chết) → ghi paused; nếu là job 24/7 thì watchdog sẽ tự tiếp tục, còn không thì chờ bấm tay.
 * Job "running" có nhịp tim mới → coi là đang chạy, kể cả khi context này không thấy runner.
 */
export async function getLatestJob(platform: string): Promise<CrawlJob | null> {
  const rows = await query<JobRow>(`${JOB_SELECT} WHERE platform = $1 ORDER BY id DESC LIMIT 1`, [platform]);
  if (!rows[0]) return null;
  const job = mapJob(rows[0]);
  const idle = rows[0].idle_seconds ?? 0;
  if (job.status === "running" && runner()?.jobId !== job.id && idle > HEARTBEAT_STALE_S) {
    const note = job.autoRestart
      ? "Tiến trình cũ đã dừng (server khởi động lại?) — sẽ tự tiếp tục trong ít phút"
      : "Server đã khởi động lại — bấm Tiếp tục để chạy tiếp";
    await query("UPDATE lol.crawl_jobs SET status = 'paused', note = $2, updated_at = now() WHERE id = $1", [
      job.id,
      note,
    ]);
    job.status = "paused";
    job.note = note;
  }
  return job;
}

/** Job đang thật sự chạy ở BẤT KỲ context/tiến trình nào (status running + nhịp tim còn mới), nếu có. */
async function liveRunningJob(): Promise<CrawlJob | null> {
  const rows = await query<JobRow>(
    `${JOB_SELECT} WHERE status = 'running' AND updated_at > now() - make_interval(secs => $1) ORDER BY id DESC LIMIT 1`,
    [HEARTBEAT_STALE_S]
  );
  return rows[0] ? mapJob(rows[0]) : null;
}

/** Có job đang chạy không — theo runner trong bộ nhớ HOẶC nhịp tim trong DB. */
export async function isAnyJobRunning(): Promise<boolean> {
  if (runner()) return true;
  return (await liveRunningJob()) !== null;
}

type JobPatch = Partial<{
  status: CrawlJobStatus;
  note: string | null;
  last_error: string | null;
  finished_at: "now" | null;
}>;

async function setJob(id: number, patch: JobPatch) {
  const sets: string[] = ["updated_at = now()"];
  const params: unknown[] = [id];
  for (const [k, v] of Object.entries(patch)) {
    if (k === "finished_at") {
      sets.push(v === "now" ? "finished_at = now()" : "finished_at = NULL");
      continue;
    }
    params.push(v);
    sets.push(`${k} = $${params.length}`);
  }
  await query(`UPDATE lol.crawl_jobs SET ${sets.join(", ")} WHERE id = $1`, params);
}

type Counters = Partial<
  Record<"players_crawled" | "players_ranked" | "matches_added" | "matches_skipped" | "requests_made", number>
>;

async function bumpJob(id: number, counters: Counters, note?: string) {
  const sets: string[] = ["updated_at = now()"];
  const params: unknown[] = [id];
  for (const [k, v] of Object.entries(counters)) {
    if (!v) continue;
    params.push(v);
    sets.push(`${k} = ${k} + $${params.length}`);
  }
  if (note !== undefined) {
    params.push(note);
    sets.push(`note = $${params.length}`);
  }
  if (sets.length === 1) return;
  await query(`UPDATE lol.crawl_jobs SET ${sets.join(", ")} WHERE id = $1`, params);
}

/* ------------------------------------------------------------------ */
/*  Điều khiển                                                          */
/* ------------------------------------------------------------------ */

export async function startJob(opts: CrawlOptions): Promise<CrawlJob> {
  if (await isAnyJobRunning())
    throw new CrawlError("Đang có tiến trình thu thập chạy — tạm dừng nó trước khi bắt đầu mới");
  const cfg = await getConfig();
  const keys = allRiotKeys(cfg);
  if (keys.length === 0) throw new CrawlError("Chưa có Riot API key");
  const parsed = parseRiotId(opts.riotId);
  if (!parsed) throw new CrawlError("Sai định dạng Tên#TAG");

  const pool = new KeyPool(keys);
  if (pool.usable().length === 0) throw new CrawlError("Không còn Riot API key hợp lệ");
  // PUUID người gốc phải thuộc hệ mã hoá của kho → cần key identity. Kho đã có người: thăm dò key
  // chưa rõ phạm vi bằng một PUUID trong kho. Kho trống: key chính chính là "tài khoản gốc" của kho.
  const probe = await query<{ puuid: string; platform: string }>(
    "SELECT puuid, platform FROM lol.players WHERE rank_fetched_at IS NOT NULL ORDER BY updated_at DESC LIMIT 1"
  );
  if (probe[0]) {
    await ensureKeyScopes(pool, probe[0].platform, probe[0].puuid, (m) => console.log(`[crawler] ${m}`));
  } else {
    getLimiter(cfg.riotApiKey).markIdentity();
  }
  const key = pool.pick("riot/account/v1/accounts/by-riot-id", true);
  if (!key)
    throw new CrawlError(
      "Không có key nào cùng tài khoản Riot Developer với kho dữ liệu (Riot mã hoá PUUID theo tài khoản) — dùng key của tài khoản đã thu thập trước đây"
    );
  const account = await getAccountByRiotId(key, opts.platform, parsed.gameName, parsed.tagLine);
  if (!account) throw new CrawlError("Không tìm thấy tài khoản này trên Riot");

  // Chế độ 24/7 ngụ ý không giới hạn người/độ sâu — bỏ qua mọi giá trị khác được truyền vào
  // để tránh trạng thái nửa vời (vd. autoRestart nhưng maxDepth giới hạn khiến recycle bế tắc).
  const maxPlayers = opts.autoRestart ? 0 : opts.maxPlayers;
  const maxDepth = opts.autoRestart ? 0 : opts.maxDepth;

  const rows = await query<JobRow>(
    `INSERT INTO lol.crawl_jobs
       (platform, root_riot_id, root_puuid, queue_ids, matches_per_player, max_players, max_depth, auto_restart, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Đang khởi động…')
     RETURNING *`,
    [
      opts.platform,
      `${account.gameName}#${account.tagLine}`,
      account.puuid,
      opts.queueIds,
      opts.matchesPerPlayer,
      maxPlayers,
      maxDepth,
      opts.autoRestart,
    ]
  );
  // Người gốc luôn được crawl lại (lấy trận mới kể từ lần trước); độ sâu 0.
  await query(
    `INSERT INTO lol.players (puuid, platform, game_name, tag_line, depth, job_id)
     VALUES ($1, $2, $3, $4, 0, $5)
     ON CONFLICT (puuid) DO UPDATE SET
       game_name = EXCLUDED.game_name,
       tag_line = EXCLUDED.tag_line,
       depth = 0,
       crawl_status = 'pending',
       updated_at = now()`,
    [account.puuid, opts.platform, account.gameName, account.tagLine, rows[0].id]
  );
  spawn(rows[0].id);
  return mapJob(rows[0]);
}

/**
 * Tạm dừng. Nếu thấy runner trong bộ nhớ → báo dừng và chờ nó thoát. Nếu không (vòng lặp nằm ở
 * context khác) → ghi paused vào DB; vòng lặp kiểm tra status mỗi vòng và sẽ tự thoát sau khi
 * xong người đang xử lý.
 */
export async function pauseJob(platform: string): Promise<void> {
  const r = runner();
  if (r) {
    r.stopRequested = true;
    await r.promise;
    return;
  }
  // 'stopped' (không phải 'paused') để watchdog KHÔNG tự tiếp tục job 24/7 mà người dùng cố ý dừng.
  // Áp cho cả job đang 'paused' (đang chờ watchdog) — người dùng bấm Dừng nghĩa là muốn nó nằm im.
  await query(
    `UPDATE lol.crawl_jobs SET status = 'stopped', note = 'Đã dừng theo yêu cầu', updated_at = now()
     WHERE id = (SELECT id FROM lol.crawl_jobs WHERE platform = $1 ORDER BY id DESC LIMIT 1)
       AND status IN ('running', 'paused')`,
    [platform]
  );
}

export async function resumeJob(platform: string): Promise<CrawlJob> {
  if (await isAnyJobRunning()) throw new CrawlError("Đang có tiến trình thu thập chạy");
  const job = await getLatestJob(platform);
  if (!job || (job.status !== "paused" && job.status !== "stopped" && job.status !== "error"))
    throw new CrawlError("Không có tiến trình nào để tiếp tục");
  await setJob(job.id, { status: "running", last_error: null, note: "Đang tiếp tục…", finished_at: null });
  spawn(job.id);
  return { ...job, status: "running", lastError: null };
}

function spawn(jobId: number) {
  const r: Runner = { jobId, stopRequested: false, promise: Promise.resolve() };
  globalThis.__lolCrawlRunner = r;
  // Nhịp tim: giữ updated_at mới kể cả khi đang chờ rate limit lâu (không có ghi DB nào khác)
  const heartbeat = setInterval(() => {
    void query("UPDATE lol.crawl_jobs SET updated_at = now() WHERE id = $1 AND status = 'running'", [jobId]).catch(
      () => undefined
    );
  }, HEARTBEAT_MS);
  r.promise = runLoop(r).finally(() => {
    clearInterval(heartbeat);
    if (globalThis.__lolCrawlRunner === r) globalThis.__lolCrawlRunner = null;
  });
}

/* ------------------------------------------------------------------ */
/*  Watchdog 24/7: tự "Tiếp tục" các job autoRestart bị dừng            */
/* ------------------------------------------------------------------ */

declare global {
  var __lolCrawlWatchdog: ReturnType<typeof setInterval> | undefined;
}

const WATCHDOG_INTERVAL_MS = 60 * 1000;

/**
 * Chạy mỗi phút: nếu không có job nào đang chạy (bộ nhớ + nhịp tim DB), tìm job autoRestart mới
 * nhất của mỗi platform đang paused/error — hoặc "running" nhưng nhịp tim đã tắt (tiến trình cũ
 * chết) — rồi tự resume. Bao phủ 3 tình huống không cần người dùng bấm tay: server vừa khởi động
 * lại, lỗi liên tiếp thoáng qua, và (quan trọng nhất) vừa được thêm/đổi Riot API key mới sau khi
 * mọi key cũ hết hạn.
 */
async function watchdogTick() {
  if (runner()) return;
  try {
    if (await liveRunningJob()) return; // đang chạy ở context/tiến trình khác
    const rows = await query<{ platform: string }>(
      `SELECT DISTINCT platform FROM lol.crawl_jobs
       WHERE auto_restart = true
         AND (status IN ('paused', 'error')
              OR (status = 'running' AND updated_at < now() - make_interval(secs => $1)))`,
      [HEARTBEAT_STALE_S]
    );
    for (const { platform } of rows) {
      if (runner()) return; // job khác vừa được resume song song (ví dụ người dùng bấm tay)
      const job = await getLatestJob(platform); // tự chuyển running-nhưng-chết → paused
      if (!job || !job.autoRestart || (job.status !== "paused" && job.status !== "error")) continue;
      try {
        await resumeJob(platform);
        console.log(`[crawler-watchdog] tự tiếp tục job #${job.id} (${platform})`);
        return; // chỉ 1 job chạy tại một thời điểm
      } catch {
        /* có thể vẫn chưa đủ key hợp lệ — thử platform khác / lần sau */
      }
    }
  } catch (e) {
    console.warn("[crawler-watchdog] lỗi khi kiểm tra:", e instanceof Error ? e.message : e);
  }
}

/** Bật watchdog một lần cho tiến trình (gọi từ instrumentation.ts khi server khởi động). */
export function ensureWatchdog(): void {
  if (globalThis.__lolCrawlWatchdog) return;
  globalThis.__lolCrawlWatchdog = setInterval(() => void watchdogTick(), WATCHDOG_INTERVAL_MS);
  void watchdogTick(); // chạy ngay một nhịp để hồi phục job sau khi restart, không đợi 5 phút
}

/* ------------------------------------------------------------------ */
/*  Vòng lặp chính                                                      */
/* ------------------------------------------------------------------ */

interface FrontierPlayer {
  puuid: string;
  game_name: string | null;
  tag_line: string | null;
  depth: number;
  tier: string | null;
  rank_fetched_at: Date | null;
}

async function pickNext(job: CrawlJob): Promise<FrontierPlayer | null> {
  // maxDepth <= 0 = không giới hạn độ sâu
  const rows = await query<FrontierPlayer>(
    `SELECT puuid, game_name, tag_line, depth, tier, rank_fetched_at
     FROM lol.players
     WHERE platform = $1 AND crawl_status = 'pending' AND ($2::int <= 0 OR depth <= $2)
     ORDER BY depth, created_at
     LIMIT 1`,
    [job.platform, job.maxDepth]
  );
  return rows[0] ?? null;
}

/**
 * Chế độ 24/7: khi hết người "pending" mới, đưa người đã crawl LÂU NHẤT (crawled_at cũ nhất)
 * quay lại 'pending' để tải trận mới của họ — làm mới dữ liệu vô tận thay vì dừng job.
 * Trả về nhãn người vừa được làm mới, hoặc null nếu kho platform này chưa có ai đã crawl.
 */
async function recycleOldestCrawled(platform: string): Promise<string | null> {
  const rows = await query<{ puuid: string; game_name: string | null; tag_line: string | null }>(
    `UPDATE lol.players SET crawl_status = 'pending', updated_at = now()
     WHERE puuid = (
       SELECT puuid FROM lol.players
       WHERE platform = $1 AND crawl_status = 'crawled'
       ORDER BY crawled_at ASC NULLS FIRST
       LIMIT 1
     )
     RETURNING puuid, game_name, tag_line`,
    [platform]
  );
  const p = rows[0];
  if (!p) return null;
  return p.game_name ? `${p.game_name}#${p.tag_line ?? ""}` : p.puuid.slice(0, 12) + "…";
}

async function runLoop(r: Runner) {
  const jobId = r.jobId;
  const log = (msg: string) => console.log(`[crawler#${jobId}] ${msg}`);
  let consecutiveErrors = 0;
  try {
    for (;;) {
      if (r.stopRequested) {
        // 'stopped' = người dùng cố ý dừng → watchdog không tự tiếp tục (khác 'paused' do sự cố)
        await setJob(jobId, { status: "stopped", note: "Đã dừng theo yêu cầu" });
        log("dừng theo yêu cầu");
        return;
      }
      const job = await loadJob(jobId);
      if (!job || job.status !== "running") {
        log(`thoát vì trạng thái trong DB là '${job?.status ?? "không tồn tại"}' (tạm dừng từ context khác?)`);
        return;
      }

      const cfg = await getConfig();
      const pool = new KeyPool(allRiotKeys(cfg)); // tạo lại mỗi vòng để nhận key mới thêm
      if (pool.usable().length === 0) {
        await setJob(jobId, {
          status: "paused",
          note: "Không còn Riot API key hợp lệ — thêm/đổi key rồi bấm Tiếp tục",
          last_error: "Mọi key đều bị Riot từ chối (401/403)",
        });
        log("hết key hợp lệ → paused");
        return;
      }

      if (job.maxPlayers > 0 && job.playersCrawled >= job.maxPlayers) {
        await setJob(jobId, {
          status: "done",
          note: `Đạt giới hạn ${job.maxPlayers} người chơi`,
          finished_at: "now",
        });
        log("đạt giới hạn người chơi → done");
        return;
      }
      let next = await pickNext(job);
      if (!next && job.autoRestart) {
        const label = await recycleOldestCrawled(job.platform);
        if (label) {
          await bumpJob(jobId, {}, `Hết người mới — làm mới dữ liệu của ${label}…`);
          next = await pickNext(job);
        }
      }
      if (!next) {
        await setJob(jobId, {
          status: "done",
          note: "Hết người chơi trong phạm vi độ sâu để mở rộng",
          finished_at: "now",
        });
        log("frontier rỗng → done");
        return;
      }

      try {
        await ensureKeyScopes(pool, job.platform, next.puuid, log);
        if (pool.pick(METHOD_LEAGUE, true) === null) {
          // Mọi key còn dùng được đều thuộc tài khoản Riot Developer khác với key đã xây kho →
          // không giải mã được PUUID nào trong DB. Không thể tiếp tục cho tới khi có key đúng tài khoản.
          await setJob(jobId, {
            status: "paused",
            note: "Không có key nào cùng tài khoản Riot Developer với kho dữ liệu — thêm lại key của tài khoản đã dùng để thu thập",
            last_error:
              "Riot mã hoá PUUID theo từng tài khoản developer; key hiện có trả 400 'Exception decrypting' cho PUUID trong kho",
          });
          log("không còn key định danh (identity) → paused");
          return;
        }
        await crawlPlayer(job, next, pool, r, log);
        consecutiveErrors = 0;
      } catch (e) {
        if (e instanceof RiotApiError) {
          if (e.code === "decrypt") {
            // Key vừa dùng đã bị đánh dấu matches-only; vòng sau sẽ chọn key khác hoặc pause nếu hết
            await setJob(jobId, { last_error: "Một key không giải mã được PUUID — chuyển nó sang chỉ tải trận" });
            continue;
          }
          if (e.status === 429) {
            // Limiter đã chặn key đó theo Retry-After; nghỉ ngắn rồi để pool chọn key khác
            await setJob(jobId, { note: "Riot báo 429 dù đã chờ — nghỉ 20s…", last_error: e.message });
            await sleep(20_000);
            continue;
          }
          if (e.status === 401 || e.status === 403) {
            // Key vừa dùng đã bị limiter đánh dấu; vòng sau pool sẽ bỏ nó (hoặc pause nếu hết key)
            await setJob(jobId, { last_error: "Một key bị Riot từ chối (401/403) — đã loại khỏi vòng xoay" });
            continue;
          }
        }
        const msg = e instanceof Error ? e.message : String(e);
        consecutiveErrors++;
        log(`lỗi khi crawl ${next.game_name}#${next.tag_line}: ${msg}`);
        await query(
          "UPDATE lol.players SET crawl_status = 'error', last_error = $2, updated_at = now() WHERE puuid = $1",
          [next.puuid, msg.slice(0, 500)]
        ).catch(() => undefined);
        await setJob(jobId, { last_error: msg.slice(0, 500) }).catch(() => undefined);
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          await setJob(jobId, { status: "error", note: "Dừng vì lỗi liên tiếp", finished_at: "now" });
          return;
        }
        await sleep(2000);
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log(`dừng do lỗi: ${msg}`);
    await setJob(jobId, { status: "error", note: "Dừng do lỗi", last_error: msg.slice(0, 500), finished_at: "now" }).catch(
      () => undefined
    );
  }
}

/* ------------------------------------------------------------------ */
/*  Crawl một người chơi                                                */
/* ------------------------------------------------------------------ */

const METHOD_LEAGUE = "lol/league/v4/entries/by-puuid";
const METHOD_IDS = "lol/match/v5/matches/by-puuid";
const METHOD_MATCH = "lol/match/v5/matches";

function pickKeyOrThrow(pool: KeyPool, method: string, needIdentity: boolean): string {
  const key = pool.pick(method, needIdentity);
  if (!key) {
    if (needIdentity) throw new RiotApiError(400, "Không còn key cùng tài khoản với kho để tra PUUID", "decrypt");
    throw new RiotApiError(403, "Không còn Riot API key hợp lệ");
  }
  return key;
}

/**
 * Thăm dò phạm vi các key chưa biết (1 request league-v4 mỗi key, một lần cho cả đời tiến trình):
 * request theo PUUID thành công → key cùng tài khoản với kho (identity); Riot trả 400
 * "Exception decrypting" → key thuộc tài khoản khác, chỉ dùng tải chi tiết trận (matches-only).
 * Phải biết phạm vi TRƯỚC khi tải trận bằng key đó, vì PUUID trong response của key khác tài khoản
 * không được phép lọt vào bảng players.
 */
async function ensureKeyScopes(pool: KeyPool, platform: string, probePuuid: string, log: (m: string) => void) {
  for (const limiter of pool.unknownScope()) {
    try {
      await getRankByPuuid(limiter.key, platform, probePuuid); // riotFetch tự đánh dấu identity
    } catch (e) {
      if (e instanceof RiotApiError && (e.status === 401 || e.status === 403 || e.status === 429)) throw e;
      /* decrypt → đã được đánh dấu matches-only trong riotFetch; lỗi khác → để lần sau thử lại */
    }
    log(`key ...${limiter.key.slice(-4)}: phạm vi = ${limiter.scope ?? "chưa rõ"}`);
  }
}

async function crawlPlayer(
  job: CrawlJob,
  p: FrontierPlayer,
  pool: KeyPool,
  r: Runner,
  log: (msg: string) => void
) {
  const label = p.game_name ? `${p.game_name}#${p.tag_line ?? ""}` : p.puuid.slice(0, 12) + "…";
  const counters: Counters = {};

  // 1. Rank (bỏ qua nếu đã tra gần đây — tiết kiệm 1 request). Endpoint theo PUUID → cần key identity.
  let seedTier: string | null = p.tier;
  const rankStale = !p.rank_fetched_at || Date.now() - p.rank_fetched_at.getTime() > RANK_TTL_MS;
  if (rankStale) {
    await bumpJob(job.id, {}, `Tra rank ${label} (độ sâu ${p.depth})…`);
    const key = pickKeyOrThrow(pool, METHOD_LEAGUE, true);
    counters.requests_made = (counters.requests_made ?? 0) + 1;
    let rankTier: string | null = null;
    try {
      const rank = await getRankByPuuid(key, job.platform, p.puuid);
      rankTier = rank.tier;
      seedTier = rank.tier;
      await query(
        `UPDATE lol.players
         SET tier = $2, division = $3, lp = $4, rank_queue = $5, rank_fetched_at = now(), updated_at = now()
         WHERE puuid = $1`,
        [p.puuid, rank.tier, rank.division, rank.lp, rank.queue]
      );
      counters.players_ranked = 1;
    } catch (e) {
      // decrypt (key sai tài khoản) / key chết / 429: ném lên để runLoop đổi key hoặc pause — KHÔNG
      // đánh dấu đã tra, nếu không người này bị coi là "đã xong" mà không có dữ liệu.
      if (e instanceof RiotApiError && (e.code === "decrypt" || e.status === 401 || e.status === 403 || e.status === 429))
        throw e;
      // lỗi lẻ: ghi nhận đã cố tra để không lặp vô hạn, vẫn crawl trận
      await query("UPDATE lol.players SET rank_fetched_at = now(), updated_at = now() WHERE puuid = $1", [p.puuid]);
    }
    // Rank mới biết → cập nhật est_tier những trận đã lưu mà người này góp mặt
    if (rankTier && rankTier !== "UNRANKED") await recomputeMatchTiers(p.puuid);
  }

  if (r.stopRequested) {
    await bumpJob(job.id, counters);
    return; // người này vẫn 'pending' → lần tiếp tục sẽ làm lại (tốn thêm 1 request ids)
  }

  // 2. Danh sách match id (1 request)
  await bumpJob(job.id, counters, `Lấy lịch sử xếp hạng của ${label}…`);
  Object.keys(counters).forEach((k) => delete counters[k as keyof Counters]);
  const idsKey = pickKeyOrThrow(pool, METHOD_IDS, true);
  counters.requests_made = 1;
  const ids = await getRankedMatchIds(idsKey, job.platform, p.puuid, {
    queueIds: job.queueIds,
    count: job.matchesPerPlayer,
  });

  // 3. Bỏ trận đã có trong DB — không tốn request
  const existing =
    ids.length > 0
      ? await query<{ match_id: string }>("SELECT match_id FROM lol.matches WHERE match_id = ANY($1::text[])", [ids])
      : [];
  const existingSet = new Set(existing.map((x) => x.match_id));
  const newIds = ids.filter((id) => !existingSet.has(id));
  counters.matches_skipped = existingSet.size;
  await bumpJob(job.id, counters, `${label}: ${newIds.length}/${ids.length} trận mới cần tải…`);
  Object.keys(counters).forEach((k) => delete counters[k as keyof Counters]);

  // 4. Tải trận mới (1 request / trận). Match id không mã hoá → MỌI key đều tải được, kể cả key
  //    khác tài khoản (matches-only) — đây là phần chiếm đa số request nên nhân tốc độ theo số key.
  let added = 0;
  for (let i = 0; i < newIds.length; i++) {
    if (r.stopRequested) break;
    const key = pickKeyOrThrow(pool, METHOD_MATCH, false);
    const identityFetch = getLimiter(key).scope === "identity";
    const detail = await getMatchDetail(key, job.platform, newIds[i]);
    const c: Counters = { requests_made: 1 };
    if (detail && job.queueIds.includes(detail.queueId) && detail.participants.length > 0) {
      const inserted = await insertMatch(job, p, detail, identityFetch, seedTier);
      if (inserted) {
        added++;
        c.matches_added = 1;
      }
    }
    await bumpJob(job.id, c, `${label}: tải trận ${i + 1}/${newIds.length}…`);
  }

  if (r.stopRequested) return;
  await query("UPDATE lol.players SET crawl_status = 'crawled', crawled_at = now(), updated_at = now() WHERE puuid = $1", [
    p.puuid,
  ]);
  await bumpJob(job.id, { players_crawled: 1 }, `Xong ${label}: +${added} trận (bỏ ${existingSet.size} trận đã có)`);
  log(`${label} (depth ${p.depth}): +${added} trận, bỏ ${existingSet.size} đã có, ${ids.length} id`);
}

/* ------------------------------------------------------------------ */
/*  Ghi trận + ước lượng bậc rank của trận                              */
/* ------------------------------------------------------------------ */

function medianTier(tiers: string[]): string | null {
  const idx = tiers.map((t) => TIER_ORDER.indexOf(t)).filter((i) => i >= 0).sort((a, b) => a - b);
  if (idx.length === 0) return null;
  return TIER_ORDER[idx[Math.floor(idx.length / 2)]];
}

function patchOf(gameVersion: string | null): string | null {
  if (!gameVersion) return null;
  const m = /^(\d+)\.(\d+)/.exec(gameVersion);
  return m ? `${m[1]}.${m[2]}` : null;
}

/**
 * Ghi trận + 10 người chơi; đưa người mới vào frontier. Trả false nếu trận đã tồn tại.
 * `identityFetch` = false khi trận được tải bằng key khác tài khoản: PUUID trong response là bản
 * mã của tài khoản đó → chỉ ghi participants (tướng/thắng-thua/KDA đủ cho thống kê), KHÔNG upsert
 * vào players; bậc trận lấy theo rank người được crawl (seed) vì PUUID của seed không xuất hiện
 * trong response dưới dạng giải mã được.
 */
async function insertMatch(
  job: CrawlJob,
  seed: FrontierPlayer,
  m: MatchDetail,
  identityFetch: boolean,
  seedTier: string | null
): Promise<boolean> {
  const puuids = m.participants.map((x) => x.puuid);
  const known = identityFetch
    ? await query<{ tier: string }>(
        "SELECT tier FROM lol.players WHERE puuid = ANY($1::text[]) AND tier IS NOT NULL AND tier <> 'UNRANKED'",
        [puuids]
      )
    : [];
  const knownTiers = known.map((k) => k.tier);
  if (!identityFetch && seedTier && seedTier !== "UNRANKED") knownTiers.push(seedTier);
  const estTier = medianTier(knownTiers);

  return withTransaction(async (client) => {
    const ins = await client.query(
      `INSERT INTO lol.matches
         (match_id, platform, queue_id, game_version, patch, game_creation, game_duration, est_tier, known_ranks)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (match_id) DO NOTHING`,
      [
        m.matchId,
        job.platform,
        m.queueId,
        m.gameVersion,
        patchOf(m.gameVersion),
        m.gameCreation,
        m.gameDuration,
        estTier,
        knownTiers.length,
      ]
    );
    if (ins.rowCount === 0) return false;

    await client.query(
      `INSERT INTO lol.match_participants
         (match_id, puuid, champion_id, champion_name, team_id, team_position, win, kills, deaths, assists)
       SELECT $1, * FROM unnest(
         $2::text[], $3::int[], $4::text[], $5::int[], $6::text[], $7::boolean[], $8::int[], $9::int[], $10::int[]
       )
       ON CONFLICT DO NOTHING`,
      [
        m.matchId,
        puuids,
        m.participants.map((x) => x.championId),
        m.participants.map((x) => x.championName),
        m.participants.map((x) => x.teamId),
        m.participants.map((x) => x.teamPosition),
        m.participants.map((x) => x.win),
        m.participants.map((x) => x.kills),
        m.participants.map((x) => x.deaths),
        m.participants.map((x) => x.assists),
      ]
    );

    // Trận tải bằng key khác tài khoản: PUUID không thuộc hệ mã hoá của kho → không đưa vào players
    if (!identityFetch) return true;

    // Người mới → frontier ở độ sâu +1; người đã có chỉ cập nhật tên (đổi tên Riot ID)
    await client.query(
      `INSERT INTO lol.players (puuid, platform, game_name, tag_line, depth, discovered_from, job_id)
       SELECT u.puuid, $2, u.game_name, u.tag_line, $3, $4, $5
       FROM unnest($1::text[], $6::text[], $7::text[]) AS u(puuid, game_name, tag_line)
       ON CONFLICT (puuid) DO UPDATE SET
         game_name = COALESCE(EXCLUDED.game_name, lol.players.game_name),
         tag_line = COALESCE(EXCLUDED.tag_line, lol.players.tag_line),
         updated_at = now()`,
      [
        puuids,
        job.platform,
        seed.depth + 1,
        seed.puuid,
        job.id,
        m.participants.map((x) => x.riotIdGameName),
        m.participants.map((x) => x.riotIdTagline),
      ]
    );
    return true;
  });
}

/** Khi một người vừa biết rank: tính lại est_tier cho các trận đã lưu mà họ tham gia. */
async function recomputeMatchTiers(puuid: string) {
  const rows = await query<{ match_id: string; tier: string }>(
    `SELECT mp.match_id, p.tier
     FROM lol.match_participants mp
     JOIN lol.match_participants other ON other.match_id = mp.match_id
     JOIN lol.players p ON p.puuid = other.puuid
     WHERE mp.puuid = $1 AND p.tier IS NOT NULL AND p.tier <> 'UNRANKED'`,
    [puuid]
  );
  if (rows.length === 0) return;
  const byMatch = new Map<string, string[]>();
  for (const r of rows) {
    const list = byMatch.get(r.match_id) ?? [];
    list.push(r.tier);
    byMatch.set(r.match_id, list);
  }
  const ids: string[] = [];
  const tiers: (string | null)[] = [];
  const counts: number[] = [];
  for (const [id, list] of byMatch) {
    ids.push(id);
    tiers.push(medianTier(list));
    counts.push(list.length);
  }
  await query(
    `UPDATE lol.matches m SET est_tier = u.est_tier, known_ranks = u.known_ranks
     FROM unnest($1::text[], $2::text[], $3::int[]) AS u(match_id, est_tier, known_ranks)
     WHERE m.match_id = u.match_id`,
    [ids, tiers, counts]
  );
}

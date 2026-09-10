import {
  getAccountByRiotId,
  getMatchDetail,
  getRankByPuuid,
  getRankedMatchIds,
  parseRiotId,
  RiotApiError,
  type MatchDetail,
} from "@/lib/riot";
import { KeyPool } from "@/lib/riot-limiter";
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
 *  - Nhiều key: KeyPool chọn key sẵn sàng sớm nhất cho từng request.
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
}

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
  const rows = await query<JobRow>("SELECT * FROM lol.crawl_jobs WHERE id = $1", [id]);
  return rows[0] ? mapJob(rows[0]) : null;
}

/** Job mới nhất của platform. Nếu DB ghi "running" mà tiến trình này không chạy (server restart) → chuyển paused. */
export async function getLatestJob(platform: string): Promise<CrawlJob | null> {
  const rows = await query<JobRow>(
    "SELECT * FROM lol.crawl_jobs WHERE platform = $1 ORDER BY id DESC LIMIT 1",
    [platform]
  );
  if (!rows[0]) return null;
  const job = mapJob(rows[0]);
  if (job.status === "running" && runner()?.jobId !== job.id) {
    const note = "Server đã khởi động lại — bấm Tiếp tục để chạy tiếp";
    await query("UPDATE lol.crawl_jobs SET status = 'paused', note = $2, updated_at = now() WHERE id = $1", [
      job.id,
      note,
    ]);
    job.status = "paused";
    job.note = note;
  }
  return job;
}

export function isRunnerActive(jobId?: number): boolean {
  const r = runner();
  return Boolean(r && (jobId === undefined || r.jobId === jobId));
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
  if (runner()) throw new CrawlError("Đang có tiến trình thu thập chạy — tạm dừng nó trước khi bắt đầu mới");
  const cfg = await getConfig();
  const keys = allRiotKeys(cfg);
  if (keys.length === 0) throw new CrawlError("Chưa có Riot API key");
  const parsed = parseRiotId(opts.riotId);
  if (!parsed) throw new CrawlError("Sai định dạng Tên#TAG");

  const pool = new KeyPool(keys);
  const key = pool.pick("riot/account/v1/accounts/by-riot-id");
  if (!key) throw new CrawlError("Không còn Riot API key hợp lệ");
  const account = await getAccountByRiotId(key, opts.platform, parsed.gameName, parsed.tagLine);
  if (!account) throw new CrawlError("Không tìm thấy tài khoản này trên Riot");

  const rows = await query<JobRow>(
    `INSERT INTO lol.crawl_jobs
       (platform, root_riot_id, root_puuid, queue_ids, matches_per_player, max_players, max_depth, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'Đang khởi động…')
     RETURNING *`,
    [
      opts.platform,
      `${account.gameName}#${account.tagLine}`,
      account.puuid,
      opts.queueIds,
      opts.matchesPerPlayer,
      opts.maxPlayers,
      opts.maxDepth,
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

export async function pauseJob(): Promise<void> {
  const r = runner();
  if (!r) return;
  r.stopRequested = true;
  await r.promise;
}

export async function resumeJob(platform: string): Promise<CrawlJob> {
  if (runner()) throw new CrawlError("Đang có tiến trình thu thập chạy");
  const job = await getLatestJob(platform);
  if (!job || (job.status !== "paused" && job.status !== "error"))
    throw new CrawlError("Không có tiến trình nào để tiếp tục");
  await setJob(job.id, { status: "running", last_error: null, note: "Đang tiếp tục…", finished_at: null });
  spawn(job.id);
  return { ...job, status: "running", lastError: null };
}

function spawn(jobId: number) {
  const r: Runner = { jobId, stopRequested: false, promise: Promise.resolve() };
  globalThis.__lolCrawlRunner = r;
  r.promise = runLoop(r).finally(() => {
    if (globalThis.__lolCrawlRunner === r) globalThis.__lolCrawlRunner = null;
  });
}

/* ------------------------------------------------------------------ */
/*  Vòng lặp chính                                                      */
/* ------------------------------------------------------------------ */

interface FrontierPlayer {
  puuid: string;
  game_name: string | null;
  tag_line: string | null;
  depth: number;
  rank_fetched_at: Date | null;
}

async function pickNext(job: CrawlJob): Promise<FrontierPlayer | null> {
  const rows = await query<FrontierPlayer>(
    `SELECT puuid, game_name, tag_line, depth, rank_fetched_at
     FROM lol.players
     WHERE platform = $1 AND crawl_status = 'pending' AND depth <= $2
     ORDER BY depth, created_at
     LIMIT 1`,
    [job.platform, job.maxDepth]
  );
  return rows[0] ?? null;
}

async function runLoop(r: Runner) {
  const jobId = r.jobId;
  const log = (msg: string) => console.log(`[crawler#${jobId}] ${msg}`);
  let consecutiveErrors = 0;
  try {
    for (;;) {
      if (r.stopRequested) {
        await setJob(jobId, { status: "paused", note: "Đã tạm dừng" });
        log("tạm dừng theo yêu cầu");
        return;
      }
      const job = await loadJob(jobId);
      if (!job || job.status !== "running") return;

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

      if (job.playersCrawled >= job.maxPlayers) {
        await setJob(jobId, {
          status: "done",
          note: `Đạt giới hạn ${job.maxPlayers} người chơi`,
          finished_at: "now",
        });
        log("đạt giới hạn người chơi → done");
        return;
      }
      const next = await pickNext(job);
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
        await crawlPlayer(job, next, pool, r, log);
        consecutiveErrors = 0;
      } catch (e) {
        if (e instanceof RiotApiError) {
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

function pickKeyOrThrow(pool: KeyPool, method: string): string {
  const key = pool.pick(method);
  if (!key) throw new RiotApiError(403, "Không còn Riot API key hợp lệ");
  return key;
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

  // 1. Rank (bỏ qua nếu đã tra gần đây — tiết kiệm 1 request)
  const rankStale = !p.rank_fetched_at || Date.now() - p.rank_fetched_at.getTime() > RANK_TTL_MS;
  if (rankStale) {
    await bumpJob(job.id, {}, `Tra rank ${label} (độ sâu ${p.depth})…`);
    const key = pickKeyOrThrow(pool, METHOD_LEAGUE);
    counters.requests_made = (counters.requests_made ?? 0) + 1;
    let rankTier: string | null = null;
    try {
      const rank = await getRankByPuuid(key, job.platform, p.puuid);
      rankTier = rank.tier;
      await query(
        `UPDATE lol.players
         SET tier = $2, division = $3, lp = $4, rank_queue = $5, rank_fetched_at = now(), updated_at = now()
         WHERE puuid = $1`,
        [p.puuid, rank.tier, rank.division, rank.lp, rank.queue]
      );
      counters.players_ranked = 1;
    } catch (e) {
      if (e instanceof RiotApiError && (e.status === 401 || e.status === 403 || e.status === 429)) throw e;
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
  const idsKey = pickKeyOrThrow(pool, METHOD_IDS);
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

  // 4. Tải trận mới (1 request / trận)
  let added = 0;
  for (let i = 0; i < newIds.length; i++) {
    if (r.stopRequested) break;
    const key = pickKeyOrThrow(pool, METHOD_MATCH);
    const detail = await getMatchDetail(key, job.platform, newIds[i]);
    const c: Counters = { requests_made: 1 };
    if (detail && job.queueIds.includes(detail.queueId) && detail.participants.length > 0) {
      const inserted = await insertMatch(job, p, detail);
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

/** Ghi trận + 10 người chơi; đưa người mới vào frontier. Trả false nếu trận đã tồn tại. */
async function insertMatch(job: CrawlJob, seed: FrontierPlayer, m: MatchDetail): Promise<boolean> {
  const puuids = m.participants.map((x) => x.puuid);
  const known = await query<{ tier: string }>(
    "SELECT tier FROM lol.players WHERE puuid = ANY($1::text[]) AND tier IS NOT NULL AND tier <> 'UNRANKED'",
    [puuids]
  );
  const estTier = medianTier(known.map((k) => k.tier));

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
        known.length,
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

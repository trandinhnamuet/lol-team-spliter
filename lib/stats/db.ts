import { Pool, type PoolClient, type QueryResultRow } from "pg";

/**
 * Kết nối PostgreSQL cho module thống kê. Mọi bảng nằm trong schema `lol` (tách khỏi
 * phần còn lại của database) và được tạo tự động (idempotent) ở lần truy vấn đầu tiên.
 * Pool + trạng thái migrate cache trên globalThis để sống qua HMR của `next dev`.
 */

declare global {
  var __lolStatsPool: Pool | undefined;
  var __lolStatsSchemaReady: Promise<void> | undefined;
}

export function isDbConfigured(): boolean {
  return Boolean(process.env.DB_HOST && process.env.DB_USERNAME && process.env.DB_NAME);
}

function createPool(): Pool {
  return new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    // Supabase pooler yêu cầu SSL; cert chain của pooler không verify được bằng CA hệ thống
    ssl: process.env.DB_SSL === "false" ? undefined : { rejectUnauthorized: false },
    max: 4, // VPS nhỏ + pooler transaction mode — không cần nhiều kết nối
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
  });
}

export function getPool(): Pool {
  if (!globalThis.__lolStatsPool) {
    globalThis.__lolStatsPool = createPool();
    globalThis.__lolStatsPool.on("error", (e) => console.error("[stats-db] pool error:", e.message));
  }
  return globalThis.__lolStatsPool;
}

const SCHEMA_SQL = `
CREATE SCHEMA IF NOT EXISTS lol;

CREATE TABLE IF NOT EXISTS lol.players (
  puuid            text PRIMARY KEY,
  platform         text NOT NULL,
  game_name        text,
  tag_line         text,
  tier             text,            -- NULL = chua tra rank; 'UNRANKED' = da tra, chua co rank
  division         text,
  lp               integer,
  rank_queue       text,
  rank_fetched_at  timestamptz,     -- da co tra rank (ke ca loi) — tranh tra lai vo han
  depth            integer NOT NULL DEFAULT 0,
  discovered_from  text,
  job_id           integer,
  crawl_status     text NOT NULL DEFAULT 'pending', -- pending | crawled | error
  crawled_at       timestamptz,
  last_error       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS players_frontier_idx ON lol.players (platform, crawl_status, depth, created_at);
CREATE INDEX IF NOT EXISTS players_tier_idx ON lol.players (platform, tier);

CREATE TABLE IF NOT EXISTS lol.matches (
  match_id       text PRIMARY KEY,
  platform       text NOT NULL,
  queue_id       integer NOT NULL,
  game_version   text,
  patch          text,               -- '16.17' — rut tu game_version
  game_creation  bigint,
  game_duration  integer,
  est_tier       text,               -- bac rank uoc luong cua tran (trung vi rank cac nguoi choi da biet)
  known_ranks    integer NOT NULL DEFAULT 0, -- so nguoi choi trong tran da biet rank (do tin cay)
  fetched_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS matches_platform_queue_idx ON lol.matches (platform, queue_id);
CREATE INDEX IF NOT EXISTS matches_platform_tier_idx ON lol.matches (platform, est_tier);

CREATE TABLE IF NOT EXISTS lol.match_participants (
  match_id       text NOT NULL REFERENCES lol.matches (match_id) ON DELETE CASCADE,
  puuid          text NOT NULL,
  champion_id    integer NOT NULL,
  champion_name  text NOT NULL,
  team_id        integer NOT NULL,
  team_position  text,
  win            boolean NOT NULL,
  kills          integer NOT NULL DEFAULT 0,
  deaths         integer NOT NULL DEFAULT 0,
  assists        integer NOT NULL DEFAULT 0,
  PRIMARY KEY (match_id, puuid)
);
CREATE INDEX IF NOT EXISTS mp_puuid_idx ON lol.match_participants (puuid);
CREATE INDEX IF NOT EXISTS mp_champion_idx ON lol.match_participants (champion_id);

CREATE TABLE IF NOT EXISTS lol.crawl_jobs (
  id                  serial PRIMARY KEY,
  platform            text NOT NULL,
  root_riot_id        text NOT NULL,
  root_puuid          text,
  status              text NOT NULL DEFAULT 'running', -- running | paused | done | error
  queue_ids           integer[] NOT NULL DEFAULT '{420}',
  matches_per_player  integer NOT NULL DEFAULT 20,
  max_players         integer NOT NULL DEFAULT 200,     -- <= 0 = khong gioi han
  max_depth           integer NOT NULL DEFAULT 3,        -- <= 0 = khong gioi han
  auto_restart        boolean NOT NULL DEFAULT false,    -- che do 24/7: khong dung, tu lam moi khi het frontier, tu resume
  players_crawled     integer NOT NULL DEFAULT 0,
  players_ranked      integer NOT NULL DEFAULT 0,
  matches_added       integer NOT NULL DEFAULT 0,
  matches_skipped     integer NOT NULL DEFAULT 0, -- tran da co trong DB, khong tai lai
  requests_made       integer NOT NULL DEFAULT 0,
  note                text,
  last_error          text,
  started_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  finished_at         timestamptz
);
-- Nâng cấp bảng đã tồn tại từ trước khi có auto_restart (idempotent, không mất dữ liệu) —
-- PHẢI chạy trước mọi CREATE INDEX bên dưới tham chiếu cột này, vì CREATE TABLE IF NOT EXISTS
-- ở trên là no-op khi bảng đã tồn tại (không tự thêm cột mới).
ALTER TABLE lol.crawl_jobs ADD COLUMN IF NOT EXISTS auto_restart boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS crawl_jobs_platform_idx ON lol.crawl_jobs (platform, id DESC);
CREATE INDEX IF NOT EXISTS crawl_jobs_auto_restart_idx ON lol.crawl_jobs (auto_restart, status);
`;

/** Tạo schema `lol` + bảng nếu chưa có. Chạy một lần mỗi tiến trình; lỗi thì cho phép thử lại. */
export function ensureSchema(): Promise<void> {
  if (!globalThis.__lolStatsSchemaReady) {
    globalThis.__lolStatsSchemaReady = getPool()
      .query(SCHEMA_SQL)
      .then(() => undefined)
      .catch((e) => {
        globalThis.__lolStatsSchemaReady = undefined;
        throw e;
      });
  }
  return globalThis.__lolStatsSchemaReady;
}

/** Truy vấn tiện dụng: đảm bảo schema rồi trả về rows. */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  await ensureSchema();
  const res = await getPool().query<T>(text, params);
  return res.rows;
}

/** Chạy nhiều lệnh trong một transaction. */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

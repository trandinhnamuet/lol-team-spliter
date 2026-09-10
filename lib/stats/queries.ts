import { getChampionIndex } from "@/lib/champions";
import { query } from "./db";
import type { ChampionStat, ChampionStatsResponse, PlayersResponse, StatsSummary } from "./types";

export async function getSummary(platform: string): Promise<StatsSummary> {
  const [base] = await query<{
    players: number;
    players_ranked: number;
    players_pending: number;
    players_crawled: number;
    matches: number;
  }>(
    `SELECT
       (SELECT count(*) FROM lol.players WHERE platform = $1)::int AS players,
       (SELECT count(*) FROM lol.players WHERE platform = $1 AND rank_fetched_at IS NOT NULL)::int AS players_ranked,
       (SELECT count(*) FROM lol.players WHERE platform = $1 AND crawl_status = 'pending')::int AS players_pending,
       (SELECT count(*) FROM lol.players WHERE platform = $1 AND crawl_status = 'crawled')::int AS players_crawled,
       (SELECT count(*) FROM lol.matches WHERE platform = $1)::int AS matches`,
    [platform]
  );
  const tiers = await query<{ tier: string; c: number }>(
    "SELECT coalesce(est_tier, 'UNKNOWN') AS tier, count(*)::int AS c FROM lol.matches WHERE platform = $1 GROUP BY 1",
    [platform]
  );
  const queues = await query<{ queue_id: number; c: number }>(
    "SELECT queue_id, count(*)::int AS c FROM lol.matches WHERE platform = $1 GROUP BY 1",
    [platform]
  );
  return {
    players: base.players,
    playersRanked: base.players_ranked,
    playersPending: base.players_pending,
    playersCrawled: base.players_crawled,
    matches: base.matches,
    tierCounts: Object.fromEntries(tiers.map((t) => [t.tier, t.c])),
    queueCounts: Object.fromEntries(queues.map((q) => [String(q.queue_id), q.c])),
  };
}

export interface ChampionFilter {
  platform: string;
  /** null = mọi bậc (kể cả trận chưa xác định bậc). */
  tiers: string[] | null;
  /** null = mọi queue đã thu thập. */
  queueIds: number[] | null;
  minGames: number;
}

/**
 * Tỉ lệ thắng / pick từng tướng trong các trận khớp bộ lọc. Bậc rank lấy theo est_tier của TRẬN
 * (trung vị rank những người trong trận đã biết) — mọi lượt chơi trong trận đó đều tính vào bậc ấy.
 */
export async function getChampionStats(f: ChampionFilter): Promise<ChampionStatsResponse> {
  const params = [f.platform, f.queueIds, f.tiers, Math.max(1, f.minGames)];
  const matchCte = `
    WITH m AS (
      SELECT match_id FROM lol.matches
      WHERE platform = $1
        AND ($2::int[] IS NULL OR queue_id = ANY($2::int[]))
        AND ($3::text[] IS NULL OR est_tier = ANY($3::text[]))
    )`;
  const rows = await query<{
    champion_id: number;
    champion_name: string;
    games: number;
    wins: number;
    avg_kills: number;
    avg_deaths: number;
    avg_assists: number;
    top_position: string | null;
  }>(
    `${matchCte}
     SELECT mp.champion_id,
            max(mp.champion_name) AS champion_name,
            count(*)::int AS games,
            count(*) FILTER (WHERE mp.win)::int AS wins,
            avg(mp.kills)::float AS avg_kills,
            avg(mp.deaths)::float AS avg_deaths,
            avg(mp.assists)::float AS avg_assists,
            mode() WITHIN GROUP (ORDER BY mp.team_position) AS top_position
     FROM lol.match_participants mp
     JOIN m ON m.match_id = mp.match_id
     GROUP BY mp.champion_id
     HAVING count(*) >= $4
     ORDER BY games DESC`,
    params
  );
  const [totals] = await query<{ total_matches: number; total_games: number }>(
    `${matchCte}
     SELECT (SELECT count(*) FROM m)::int AS total_matches,
            (SELECT count(*) FROM lol.match_participants mp JOIN m ON m.match_id = mp.match_id)::int AS total_games`,
    params.slice(0, 3)
  );

  const totalMatches = totals?.total_matches ?? 0;
  const { version, byKey } = await getChampionIndex();
  const champions: Record<string, { id: string; name: string }> = {};
  const stats: ChampionStat[] = rows.map((r) => {
    const meta = byKey.get(r.champion_id);
    if (meta) champions[String(r.champion_id)] = { id: meta.id, name: meta.name };
    const kda = r.avg_deaths > 0 ? (r.avg_kills + r.avg_assists) / r.avg_deaths : r.avg_kills + r.avg_assists;
    return {
      championId: r.champion_id,
      championName: r.champion_name,
      games: r.games,
      wins: r.wins,
      winRate: r.games > 0 ? r.wins / r.games : 0,
      pickRate: totalMatches > 0 ? r.games / totalMatches : 0,
      avgKills: r.avg_kills,
      avgDeaths: r.avg_deaths,
      avgAssists: r.avg_assists,
      kda,
      topPosition: r.top_position === "" ? null : r.top_position,
    };
  });
  return {
    rows: stats,
    totalMatches,
    totalGames: totals?.total_games ?? 0,
    ddragonVersion: version,
    champions,
  };
}

export async function listPlayers(opts: {
  platform: string;
  q: string;
  page: number;
  pageSize: number;
}): Promise<PlayersResponse> {
  const q = opts.q.trim() ? `%${opts.q.trim()}%` : null;
  const offset = (opts.page - 1) * opts.pageSize;
  const rows = await query<{
    puuid: string;
    game_name: string | null;
    tag_line: string | null;
    tier: string | null;
    division: string | null;
    lp: number | null;
    depth: number;
    crawl_status: string;
    created_at: Date;
    match_count: number;
  }>(
    `SELECT p.puuid, p.game_name, p.tag_line, p.tier, p.division, p.lp, p.depth, p.crawl_status, p.created_at,
            (SELECT count(*) FROM lol.match_participants mp WHERE mp.puuid = p.puuid)::int AS match_count
     FROM lol.players p
     WHERE p.platform = $1
       AND ($2::text IS NULL OR (coalesce(p.game_name, '') || '#' || coalesce(p.tag_line, '')) ILIKE $2)
     ORDER BY p.depth, p.created_at
     LIMIT $3 OFFSET $4`,
    [opts.platform, q, opts.pageSize, offset]
  );
  const [{ total }] = await query<{ total: number }>(
    `SELECT count(*)::int AS total FROM lol.players p
     WHERE p.platform = $1
       AND ($2::text IS NULL OR (coalesce(p.game_name, '') || '#' || coalesce(p.tag_line, '')) ILIKE $2)`,
    [opts.platform, q]
  );
  return {
    rows: rows.map((r) => ({
      puuid: r.puuid,
      gameName: r.game_name,
      tagLine: r.tag_line,
      tier: r.tier,
      division: r.division,
      lp: r.lp,
      depth: r.depth,
      crawlStatus: r.crawl_status,
      matchCount: r.match_count,
      createdAt: r.created_at.toISOString(),
    })),
    total,
    page: opts.page,
    pageSize: opts.pageSize,
  };
}

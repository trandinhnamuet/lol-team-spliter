import { eloForRank } from "./elo";
import { getMatchLite, getRankByPuuid, getRecentMatchIds, RiotApiError } from "./riot";
import type { EloMap } from "./types";

/** Các queue 5v5 dùng để ước lượng MMR: normal draft/blind, ranked đơn/linh hoạt, ARAM, quickplay. */
const ALLOWED_QUEUES = new Set([400, 420, 430, 440, 450, 490]);

// Giới hạn ngân sách request cho mỗi người được ước lượng (dev key: 100 req/2 phút).
const MAX_MATCHES = 3; // số trận dùng làm mẫu
const MAX_LOOKUPS = 12; // số lần tra rank người cùng trận
const MIN_SAMPLES = 4; // tối thiểu bấy nhiêu người có rank mới tin kết quả

export interface MmrEstimate {
  elo: number;
  samples: number;
}

/**
 * Ước lượng MMR của người chưa rank từ lịch sử đấu (match-v5):
 * lấy vài trận 5v5 gần nhất, tra rank của những người cùng trận rồi lấy trung vị elo —
 * matchmaking của Riot xếp họ vào lobby nào thì trình họ quanh mức đó.
 *
 * `leagueCache` chia sẻ giữa các lần gọi trong cùng một request chia team:
 * key = puuid, value = elo (đã quy đổi) hoặc null nếu người đó chưa rank/tra lỗi.
 * Trả null nếu không đủ mẫu (giữ nguyên elo mặc định của UNRANKED).
 * Ném RiotApiError 401/403 nếu key chết để caller dừng toàn bộ.
 */
export async function estimateEloFromMatches(opts: {
  apiKey: string;
  platform: string;
  puuid: string;
  eloMap: EloMap;
  leagueCache: Map<string, number | null>;
}): Promise<MmrEstimate | null> {
  const { apiKey, platform, puuid, eloMap, leagueCache } = opts;

  let matchIds: string[];
  try {
    matchIds = await getRecentMatchIds(apiKey, platform, puuid);
  } catch (e) {
    if (e instanceof RiotApiError && (e.status === 401 || e.status === 403)) throw e;
    return null;
  }
  if (matchIds.length === 0) return null;

  const elos: number[] = [];
  let matchesUsed = 0;
  let lookups = 0;

  for (const matchId of matchIds) {
    if (matchesUsed >= MAX_MATCHES || lookups >= MAX_LOOKUPS) break;

    let match;
    try {
      match = await getMatchLite(apiKey, platform, matchId);
    } catch (e) {
      if (e instanceof RiotApiError && (e.status === 401 || e.status === 403)) throw e;
      continue;
    }
    if (!match || !ALLOWED_QUEUES.has(match.queueId)) continue;
    matchesUsed++;

    for (const other of match.participantPuuids) {
      if (other === puuid) continue;
      if (lookups >= MAX_LOOKUPS) break;

      if (leagueCache.has(other)) {
        const cached = leagueCache.get(other);
        if (cached != null) elos.push(cached);
        continue;
      }

      lookups++;
      try {
        const rank = await getRankByPuuid(apiKey, platform, other);
        const elo = rank.tier === "UNRANKED" ? null : eloForRank(rank, eloMap);
        leagueCache.set(other, elo);
        if (elo != null) elos.push(elo);
      } catch (e) {
        if (e instanceof RiotApiError && (e.status === 401 || e.status === 403)) throw e;
        leagueCache.set(other, null);
      }
    }
  }

  if (elos.length < MIN_SAMPLES) return null;

  const sorted = [...elos].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return { elo: Math.round(median), samples: elos.length };
}

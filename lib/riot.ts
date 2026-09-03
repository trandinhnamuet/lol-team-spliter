import type { KeyStatus, RankInfo } from "./types";

/** Map platform routing -> regional routing (dùng cho account-v1). */
const PLATFORM_TO_CLUSTER: Record<string, string> = {
  vn2: "asia",
  kr: "asia",
  jp1: "asia",
  ph2: "asia",
  sg2: "asia",
  th2: "asia",
  tw2: "asia",
  oc1: "asia",
  na1: "americas",
  br1: "americas",
  la1: "americas",
  la2: "americas",
  euw1: "europe",
  eun1: "europe",
  tr1: "europe",
  ru: "europe",
  me1: "europe",
};

export function clusterFor(platform: string): string {
  return PLATFORM_TO_CLUSTER[platform.toLowerCase()] ?? "asia";
}

/** Map platform -> regional routing của match-v5: KHÁC account-v1 —
 *  các server Đông Nam Á (vn2, sg2...) dùng cluster "sea" thay vì "asia".
 *  Gọi nhầm "asia" sẽ nhận HTTP 200 + mảng rỗng chứ không báo lỗi. */
const PLATFORM_TO_MATCH_CLUSTER: Record<string, string> = {
  vn2: "sea",
  sg2: "sea",
  ph2: "sea",
  th2: "sea",
  tw2: "sea",
  oc1: "sea",
  kr: "asia",
  jp1: "asia",
};

export function matchClusterFor(platform: string): string {
  return PLATFORM_TO_MATCH_CLUSTER[platform.toLowerCase()] ?? clusterFor(platform);
}

export class RiotApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

async function riotFetch(url: string, apiKey: string, retries = 2): Promise<Response> {
  const res = await fetch(url, {
    headers: { "X-Riot-Token": apiKey },
    cache: "no-store",
  });
  if (res.status === 429 && retries > 0) {
    const wait = Number(res.headers.get("Retry-After") ?? "2");
    await new Promise((r) => setTimeout(r, Math.min(wait, 10) * 1000));
    return riotFetch(url, apiKey, retries - 1);
  }
  return res;
}

export interface RiotAccount {
  puuid: string;
  gameName: string;
  tagLine: string;
}

/** Tra cứu tài khoản theo Riot ID (Tên#TAG). Trả null nếu không tồn tại. */
export async function getAccountByRiotId(
  apiKey: string,
  platform: string,
  gameName: string,
  tagLine: string
): Promise<RiotAccount | null> {
  const cluster = clusterFor(platform);
  const url = `https://${cluster}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(
    gameName
  )}/${encodeURIComponent(tagLine)}`;
  const res = await riotFetch(url, apiKey);
  if (res.status === 404) return null;
  if (res.status === 401 || res.status === 403)
    throw new RiotApiError(res.status, "Riot API key hết hạn hoặc không hợp lệ");
  if (!res.ok) throw new RiotApiError(res.status, `Riot API lỗi ${res.status}`);
  return (await res.json()) as RiotAccount;
}

interface LeagueEntry {
  queueType: string;
  tier: string;
  rank: string;
  leaguePoints: number;
  wins: number;
  losses: number;
}

/** Lấy rank theo PUUID: ưu tiên Đơn/Đôi, fallback Linh Hoạt, không có thì UNRANKED. */
export async function getRankByPuuid(
  apiKey: string,
  platform: string,
  puuid: string
): Promise<RankInfo> {
  const url = `https://${platform}.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`;
  const res = await riotFetch(url, apiKey);
  if (res.status === 401 || res.status === 403)
    throw new RiotApiError(res.status, "Riot API key hết hạn hoặc không hợp lệ");
  if (!res.ok) throw new RiotApiError(res.status, `Riot API lỗi ${res.status}`);
  const entries = (await res.json()) as LeagueEntry[];
  const solo = entries.find((e) => e.queueType === "RANKED_SOLO_5x5");
  const flex = entries.find((e) => e.queueType === "RANKED_FLEX_SR");
  const entry = solo ?? flex;
  if (!entry) {
    return { tier: "UNRANKED", division: null, lp: 0, wins: 0, losses: 0, queue: null };
  }
  return {
    tier: entry.tier as RankInfo["tier"],
    division: (entry.rank as RankInfo["division"]) ?? null,
    lp: entry.leaguePoints,
    wins: entry.wins,
    losses: entry.losses,
    queue: entry.queueType,
  };
}

export interface SummonerInfo {
  profileIconId: number;
  summonerLevel: number;
}

/** Lấy icon đại diện + cấp độ tài khoản theo PUUID (summoner-v4). */
export async function getSummonerByPuuid(
  apiKey: string,
  platform: string,
  puuid: string
): Promise<SummonerInfo | null> {
  const url = `https://${platform}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`;
  const res = await riotFetch(url, apiKey);
  if (!res.ok) return null;
  const data = (await res.json()) as { profileIconId?: number; summonerLevel?: number };
  if (typeof data.profileIconId !== "number") return null;
  return { profileIconId: data.profileIconId, summonerLevel: data.summonerLevel ?? 0 };
}

/** Lấy danh sách match ID gần nhất theo PUUID (match-v5, regional routing). */
export async function getRecentMatchIds(
  apiKey: string,
  platform: string,
  puuid: string,
  count = 8
): Promise<string[]> {
  const cluster = matchClusterFor(platform);
  const url = `https://${cluster}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=${count}`;
  const res = await riotFetch(url, apiKey);
  if (res.status === 401 || res.status === 403)
    throw new RiotApiError(res.status, "Riot API key hết hạn hoặc không hợp lệ");
  if (!res.ok) {
    console.warn(`[match-v5] ids lỗi HTTP ${res.status} (cluster=${cluster}, puuid=${puuid.slice(0, 12)}…)`);
    return [];
  }
  const ids = (await res.json()) as unknown;
  return Array.isArray(ids) ? (ids as string[]) : [];
}

export interface MatchLite {
  queueId: number;
  /** PUUID của 10 người trong trận. */
  participantPuuids: string[];
}

/** Lấy thông tin gọn của một trận: queueId + danh sách PUUID người chơi. */
export async function getMatchLite(
  apiKey: string,
  platform: string,
  matchId: string
): Promise<MatchLite | null> {
  const cluster = matchClusterFor(platform);
  const url = `https://${cluster}.api.riotgames.com/lol/match/v5/matches/${matchId}`;
  const res = await riotFetch(url, apiKey);
  if (res.status === 401 || res.status === 403)
    throw new RiotApiError(res.status, "Riot API key hết hạn hoặc không hợp lệ");
  if (!res.ok) {
    console.warn(`[match-v5] match ${matchId} lỗi HTTP ${res.status} (cluster=${cluster})`);
    return null;
  }
  const data = (await res.json()) as {
    metadata?: { participants?: string[] };
    info?: { queueId?: number };
  };
  if (typeof data.info?.queueId !== "number" || !Array.isArray(data.metadata?.participants))
    return null;
  return { queueId: data.info.queueId, participantPuuids: data.metadata.participants };
}

// Cache version Data Dragon trong bộ nhớ tiến trình — version game đổi ~2 tuần/lần.
let ddragonVersion = "15.1.1"; // fallback nếu chưa fetch được
let ddragonFetchedAt = 0;
const DDRAGON_TTL_MS = 6 * 60 * 60 * 1000;

/** Version Data Dragon mới nhất (cache 6 giờ). */
export async function getDdragonVersion(): Promise<string> {
  if (Date.now() - ddragonFetchedAt < DDRAGON_TTL_MS) return ddragonVersion;
  try {
    const res = await fetch("https://ddragon.leagueoflegends.com/api/versions.json", {
      cache: "no-store",
    });
    if (res.ok) {
      const versions = (await res.json()) as string[];
      if (Array.isArray(versions) && versions[0]) {
        ddragonVersion = versions[0];
        ddragonFetchedAt = Date.now();
      }
    }
  } catch {
    /* giữ version cũ/fallback */
  }
  return ddragonVersion;
}

/** URL ảnh icon đại diện từ CDN Data Dragon của Riot. */
export function profileIconUrl(version: string, profileIconId: number): string {
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/profileicon/${profileIconId}.png`;
}

/** Kiểm tra key còn hạn không bằng endpoint lol-status (miễn phí, nhẹ). */
export async function checkKeyStatus(apiKey: string, platform: string): Promise<KeyStatus> {
  if (!apiKey) return "missing";
  try {
    const url = `https://${platform}.api.riotgames.com/lol/status/v4/platform-data`;
    const res = await riotFetch(url, apiKey, 0);
    if (res.ok) return "valid";
    if (res.status === 401 || res.status === 403) return "invalid";
    return "error";
  } catch {
    return "error";
  }
}

/** Map platform routing -> region slug dùng trong URL của op.gg. */
const OPGG_REGION: Record<string, string> = {
  na1: "na",
  euw1: "euw",
  eun1: "eune",
  kr: "kr",
  jp1: "jp",
  oc1: "oce",
  br1: "br",
  la1: "lan",
  la2: "las",
  tr1: "tr",
  ru: "ru",
  vn2: "vn",
  tw2: "tw",
  me1: "me",
  ph2: "ph",
  sg2: "sg",
  th2: "th",
};

/** Link xem chi tiết summoner trên op.gg theo Riot ID + platform routing. */
export function opggUrl(gameName: string, tagLine: string, platform: string): string {
  const region = OPGG_REGION[platform.toLowerCase()] ?? "vn";
  return `https://www.op.gg/summoners/${region}/${encodeURIComponent(gameName)}-${encodeURIComponent(tagLine)}`;
}

/** Chuẩn hoá Riot ID: bỏ khoảng trắng thừa quanh dấu # và hai đầu chuỗi. */
export function normalizeRiotId(input: string): string {
  return input.trim().replace(/\s*#\s*/g, "#");
}

/** Tách "Tên#TAG" thành gameName/tagLine. Trả null nếu sai định dạng. */
export function parseRiotId(input: string): { gameName: string; tagLine: string } | null {
  const trimmed = input.trim();
  const hashIdx = trimmed.lastIndexOf("#");
  if (hashIdx <= 0 || hashIdx === trimmed.length - 1) return null;
  const gameName = trimmed.slice(0, hashIdx).trim();
  const tagLine = trimmed.slice(hashIdx + 1).trim();
  if (!gameName || !tagLine) return null;
  return { gameName, tagLine };
}

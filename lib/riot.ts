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

import type { Division, EloMap, RankInfo, Tier } from "./types";

export const TIERS_WITH_DIVISIONS: Tier[] = [
  "IRON",
  "BRONZE",
  "SILVER",
  "GOLD",
  "PLATINUM",
  "EMERALD",
  "DIAMOND",
];

export const APEX_TIERS: Tier[] = ["MASTER", "GRANDMASTER", "CHALLENGER"];

export const DIVISIONS: Division[] = ["IV", "III", "II", "I"];

export const TIER_LABELS: Record<string, string> = {
  IRON: "Sắt",
  BRONZE: "Đồng",
  SILVER: "Bạc",
  GOLD: "Vàng",
  PLATINUM: "Bạch Kim",
  EMERALD: "Lục Bảo",
  DIAMOND: "Kim Cương",
  MASTER: "Cao Thủ",
  GRANDMASTER: "Đại Cao Thủ",
  CHALLENGER: "Thách Đấu",
  UNRANKED: "Chưa rank",
};

export function rankKey(tier: string, division: string | null): string {
  if (tier === "UNRANKED") return "UNRANKED";
  if (APEX_TIERS.includes(tier as Tier)) return tier;
  return `${tier}_${division ?? "IV"}`;
}

/** Bảng elo mặc định: mỗi bậc rank nhỏ cách nhau 100 điểm. */
export function defaultEloMap(): EloMap {
  const map: EloMap = {};
  let elo = 100;
  for (const tier of TIERS_WITH_DIVISIONS) {
    for (const div of DIVISIONS) {
      map[`${tier}_${div}`] = elo;
      elo += 100;
    }
  }
  map.MASTER = elo; // 2900
  map.GRANDMASTER = elo + 200;
  map.CHALLENGER = elo + 400;
  map.UNRANKED = map.SILVER_IV; // mặc định coi như Bạc IV
  return map;
}

export function eloForRank(rank: RankInfo, eloMap: EloMap): number {
  const key = rankKey(rank.tier, rank.division);
  return eloMap[key] ?? eloMap.UNRANKED ?? 0;
}

export function rankLabel(rank: RankInfo | undefined): string {
  if (!rank || rank.tier === "UNRANKED") return TIER_LABELS.UNRANKED;
  const tier = TIER_LABELS[rank.tier] ?? rank.tier;
  if (APEX_TIERS.includes(rank.tier as Tier)) return `${tier} ${rank.lp} LP`;
  return `${tier} ${rank.division ?? ""}`.trim();
}

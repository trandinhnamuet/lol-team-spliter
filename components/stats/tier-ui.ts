import { TIER_LABELS } from "@/lib/elo";

/** Thứ tự bậc rank từ thấp đến cao — dùng cho preset "từ X trở lên". */
export const TIER_ORDER = [
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
] as const;

export const TIER_COLORS: Record<string, string> = {
  IRON: "var(--color-tier-iron)",
  BRONZE: "var(--color-tier-bronze)",
  SILVER: "var(--color-tier-silver)",
  GOLD: "var(--color-tier-gold)",
  PLATINUM: "var(--color-tier-platinum)",
  EMERALD: "var(--color-tier-emerald)",
  DIAMOND: "var(--color-tier-diamond)",
  MASTER: "var(--color-tier-master)",
  GRANDMASTER: "var(--color-tier-grandmaster)",
  CHALLENGER: "var(--color-tier-challenger)",
  UNRANKED: "var(--color-steel-100)",
  UNKNOWN: "var(--color-steel-300)",
};

export function tierColor(tier: string | null | undefined): string {
  return TIER_COLORS[tier ?? "UNKNOWN"] ?? "var(--color-steel-300)";
}

export function tierLabel(tier: string | null | undefined): string {
  if (!tier) return "Chưa tra";
  if (tier === "UNKNOWN") return "Chưa xác định";
  return TIER_LABELS[tier] ?? tier;
}

export const POSITION_LABELS: Record<string, string> = {
  TOP: "Đường trên",
  JUNGLE: "Đi rừng",
  MIDDLE: "Đường giữa",
  BOTTOM: "Xạ thủ",
  UTILITY: "Hỗ trợ",
};

export const QUEUE_LABELS: Record<string, string> = {
  "420": "Xếp hạng Đơn/Đôi",
  "440": "Xếp hạng Linh Hoạt",
};

/** Preset bộ lọc bậc rank: null = mọi bậc. */
export const TIER_PRESETS: { label: string; tiers: string[] | null }[] = [
  { label: "Tất cả", tiers: null },
  { label: "Sắt – Đồng", tiers: ["IRON", "BRONZE"] },
  { label: "Bạc", tiers: ["SILVER"] },
  { label: "Vàng", tiers: ["GOLD"] },
  { label: "Bạch Kim", tiers: ["PLATINUM"] },
  { label: "Lục Bảo+", tiers: TIER_ORDER.slice(TIER_ORDER.indexOf("EMERALD")) },
  { label: "Kim Cương+", tiers: TIER_ORDER.slice(TIER_ORDER.indexOf("DIAMOND")) },
  { label: "Cao Thủ+", tiers: TIER_ORDER.slice(TIER_ORDER.indexOf("MASTER")) },
];

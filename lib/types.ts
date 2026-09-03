export type Tier =
  | "IRON"
  | "BRONZE"
  | "SILVER"
  | "GOLD"
  | "PLATINUM"
  | "EMERALD"
  | "DIAMOND"
  | "MASTER"
  | "GRANDMASTER"
  | "CHALLENGER";

export type Division = "IV" | "III" | "II" | "I";

/** Key trong bảng elo: "IRON_IV" ... "DIAMOND_I", "MASTER", "GRANDMASTER", "CHALLENGER", "UNRANKED" */
export type EloMap = Record<string, number>;

export interface AppConfig {
  riotApiKey: string;
  /** Platform routing: vn2, kr, na1, euw1... */
  platform: string;
  eloMap: EloMap;
}

export interface RankInfo {
  tier: Tier | "UNRANKED";
  division: Division | null;
  lp: number;
  wins: number;
  losses: number;
  queue: string | null; // RANKED_SOLO_5x5 | RANKED_FLEX_SR | null
}

export interface ResolvedPlayer {
  input: string;
  ok: boolean;
  error?: string;
  gameName?: string;
  tagLine?: string;
  puuid?: string;
  rank?: RankInfo;
  elo?: number;
  /** URL icon đại diện (Data Dragon) — có thể thiếu ở kết quả lưu trước đây. */
  avatarUrl?: string;
  /** Cấp độ tài khoản. */
  summonerLevel?: number;
  /** true nếu elo là MMR ước lượng từ lịch sử đấu (chỉ áp dụng cho người chưa rank). */
  eloEstimated?: boolean;
  /** Số người chơi có rank trong các trận gần đây dùng làm mẫu ước lượng. */
  estimateSamples?: number;
}

export interface TeamResult {
  /** totalElo chỉ tính đội hình chính, không tính dự bị. */
  teams: { players: ResolvedPlayer[]; totalElo: number; reserve?: ResolvedPlayer }[];
  /** Người thừa không ghép được vào team nào (mỗi team chỉ nhận tối đa 1 dự bị). */
  bench: ResolvedPlayer[];
  spread: number; // chênh lệch max - min giữa các team
  teamSize: number; // số người mỗi team đã dùng để chia
  /** Platform routing lúc chia (vn2, kr, na1...) — dùng để dựng link op.gg. */
  platform?: string;
}

export interface EventPlayer {
  displayName: string;
  riotId: string;
  gameName: string;
  tagLine: string;
  puuid: string;
  registeredAt: string;
}

export interface TournamentEvent {
  id: string;
  name: string;
  createdAt: string;
  open: boolean;
  players: EventPlayer[];
}

export type KeyStatus = "valid" | "invalid" | "missing" | "error";

/** Kết quả chia team đã lưu để xem lại qua link /result/[id]. */
export interface SavedResult {
  id: string;
  createdAt: string;
  result: TeamResult;
  failed: ResolvedPlayer[];
}

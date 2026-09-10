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
  /** Các key phụ dùng thêm cho crawler thống kê (xoay vòng cùng riotApiKey để nhân rate limit). */
  riotApiKeys: string[];
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
  /** true nếu elo là ước lượng (không phải từ rank thật, chỉ áp dụng cho người chưa rank). */
  eloEstimated?: boolean;
  /** Nguồn ước lượng: từ lịch sử đấu hay từ cấp độ tài khoản. */
  eloSource?: "match" | "level";
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

export type SplitJobStatus = "running" | "done" | "error";

/** Nguồn danh sách của một lượt chia team: dán tay hay từ sự kiện đăng ký. */
export interface SplitJobSource {
  kind: "list" | "event";
  eventId?: string;
  eventName?: string;
}

/**
 * Một lượt chia team chạy nền trên server, có link riêng `/split/[id]`.
 * Job sống độc lập với tab trình duyệt: đóng tab thì vẫn chạy tiếp tới khi xong
 * rồi tự lưu kết quả (`resultId`), mở lại link là xem được tiến trình/kết quả.
 */
export interface SplitJob {
  id: string;
  createdAt: string;
  finishedAt?: string;
  status: SplitJobStatus;
  source: SplitJobSource;
  teamSize: number;
  platform: string;
  estimateUnranked: boolean;
  /** Số người đã tra xong / tổng số người. */
  done: number;
  total: number;
  /** Dòng trạng thái phụ (ví dụ: đang ước lượng MMR cho người chưa rank). */
  note?: string;
  players?: ResolvedPlayer[];
  failed?: ResolvedPlayer[];
  result?: TeamResult;
  error?: string;
  /** id bản ghi trong results.json — job tự lưu kết quả khi chạy xong. */
  resultId?: string;
}

/**
 * running: đang chạy · paused: dừng ngoài ý muốn (server restart, hết key) — watchdog tự tiếp tục
 * job 24/7 · stopped: người dùng bấm Tạm dừng — KHÔNG tự tiếp tục · done: hết việc · error: lỗi.
 */
export type CrawlJobStatus = "running" | "paused" | "stopped" | "done" | "error";

export interface CrawlJob {
  id: number;
  platform: string;
  rootRiotId: string;
  rootPuuid: string | null;
  status: CrawlJobStatus;
  queueIds: number[];
  matchesPerPlayer: number;
  /** <= 0 = không giới hạn. */
  maxPlayers: number;
  /** <= 0 = không giới hạn. */
  maxDepth: number;
  /** Chế độ 24/7: không dừng, tự làm mới người cũ khi hết người mới, tự resume sau khi bị dừng. */
  autoRestart: boolean;
  playersCrawled: number;
  playersRanked: number;
  matchesAdded: number;
  matchesSkipped: number;
  requestsMade: number;
  note: string | null;
  lastError: string | null;
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

export interface CrawlOptions {
  platform: string;
  riotId: string;
  /** 420 = Xếp hạng Đơn/Đôi, 440 = Linh Hoạt. */
  queueIds: number[];
  matchesPerPlayer: number;
  maxPlayers: number;
  maxDepth: number;
  autoRestart: boolean;
}

/** Tổng quan dữ liệu đã thu thập của một platform. */
export interface StatsSummary {
  players: number;
  /** Đã tra rank (kể cả UNRANKED). */
  playersRanked: number;
  /** Chưa tra lịch sử đấu (frontier còn lại). */
  playersPending: number;
  playersCrawled: number;
  matches: number;
  /** Số trận theo bậc rank ước lượng (IRON..CHALLENGER); trận chưa xác định nằm ở key "UNKNOWN". */
  tierCounts: Record<string, number>;
  /** Số trận theo queueId. */
  queueCounts: Record<string, number>;
}

export interface ChampionStat {
  championId: number;
  championName: string; // tên nội bộ từ match-v5 (fallback khi thiếu meta)
  games: number;
  wins: number;
  winRate: number; // 0..1
  pickRate: number; // games / số trận trong bộ lọc
  avgKills: number;
  avgDeaths: number;
  avgAssists: number;
  kda: number;
  topPosition: string | null; // TOP | JUNGLE | MIDDLE | BOTTOM | UTILITY
}

export interface ChampionStatsResponse {
  rows: ChampionStat[];
  /** Số trận khớp bộ lọc — mẫu số của pick rate. */
  totalMatches: number;
  /** Tổng lượt chơi (participant) khớp bộ lọc. */
  totalGames: number;
  ddragonVersion: string;
  /** Meta tướng theo championId: slug ảnh + tên tiếng Việt. */
  champions: Record<string, { id: string; name: string }>;
}

export interface PlayerRow {
  puuid: string;
  gameName: string | null;
  tagLine: string | null;
  tier: string | null;
  division: string | null;
  lp: number | null;
  depth: number;
  crawlStatus: string;
  matchCount: number;
  createdAt: string;
}

export interface PlayersResponse {
  rows: PlayerRow[];
  total: number;
  page: number;
  pageSize: number;
}

/** Trạng thái một key trong pool (đã che, chỉ lộ 4 ký tự cuối). */
export interface KeyInfo {
  hint: string;
  primary: boolean;
  status: "valid" | "invalid" | "unknown";
  /** Số request còn gửi được ngay lúc này theo cửa sổ chặt nhất. */
  available: number;
  /** Giới hạn app hiện biết, ví dụ "20/1s · 100/120s". */
  limits: string;
  /** ms phải chờ trước khi gửi được request kế tiếp (0 = gửi ngay). */
  waitMs: number;
  requests: number;
}

export interface CrawlStatusResponse {
  dbConfigured: boolean;
  dbError?: string;
  job: CrawlJob | null;
  /** true nếu vòng lặp crawler đang chạy trong tiến trình server hiện tại. */
  runnerActive: boolean;
  summary: StatsSummary | null;
  keys: KeyInfo[];
}

/**
 * Rate limiter chủ động cho Riot API — mục tiêu là KHÔNG BAO GIỜ nhận 429 thay vì chờ 429 rồi mới lùi.
 *
 * Riot giới hạn theo từng key ở 2 tầng: app limit (dev key: 20 req/1s và 100 req/120s) và
 * method limit (theo endpoint). Mỗi response đều kèm header:
 *   X-App-Rate-Limit: 20:1,100:120         X-App-Rate-Limit-Count: 3:1,57:120
 *   X-Method-Rate-Limit: 2000:10            X-Method-Rate-Limit-Count: 4:10
 * Limiter đọc các header này để tự học giới hạn thật của key (dev/personal/production khác nhau),
 * đếm cửa sổ trượt phía client (chặt hơn cửa sổ cố định của Riot nên an toàn) và chờ đúng số ms
 * cần thiết trước khi gửi. Nhiều key → KeyPool chọn key sẵn sàng sớm nhất.
 *
 * Trạng thái lưu trên globalThis theo key để dùng chung giữa các route + sống qua HMR.
 */

interface Window {
  limit: number;
  seconds: number;
  /** Thời điểm (ms) các request đã gửi trong cửa sổ, tăng dần. */
  stamps: number[];
}

/** Dev key mặc định — sẽ được ghi đè ngay khi thấy header đầu tiên. */
const DEFAULT_APP_LIMIT = "20:1,100:120";
/** Chừa lại vài % cho lệch đồng hồ / request đang bay. */
const SAFETY = 0.95;
/** Không dùng key trong 10 phút sau khi Riot trả 401/403 (key chết hoặc chưa kích hoạt). */
const AUTH_FAIL_BLOCK_MS = 10 * 60 * 1000;

function parseSpec(spec: string): { limit: number; seconds: number }[] {
  return spec
    .split(",")
    .map((part) => part.trim().split(":").map(Number))
    .filter(([limit, seconds]) => Number.isFinite(limit) && Number.isFinite(seconds) && seconds > 0)
    .map(([limit, seconds]) => ({ limit, seconds }));
}

class WindowSet {
  private windows: Window[] = [];

  constructor(spec?: string) {
    if (spec) this.setLimits(spec);
  }

  private effectiveLimit(w: Window): number {
    return Math.max(1, Math.floor(w.limit * SAFETY));
  }

  private prune(now: number) {
    for (const w of this.windows) {
      const cutoff = now - w.seconds * 1000;
      let i = 0;
      while (i < w.stamps.length && w.stamps[i] <= cutoff) i++;
      if (i > 0) w.stamps.splice(0, i);
    }
  }

  /** Cập nhật giới hạn từ header; giữ lại stamps của cửa sổ cùng độ dài. */
  setLimits(spec: string) {
    const parsed = parseSpec(spec);
    if (parsed.length === 0) return;
    this.windows = parsed.map(({ limit, seconds }) => {
      const existing = this.windows.find((w) => w.seconds === seconds);
      return { limit, seconds, stamps: existing?.stamps ?? [] };
    });
  }

  /** Đồng bộ với số đếm phía Riot (key có thể đang được tiến trình khác dùng). */
  syncCounts(spec: string, now: number) {
    this.prune(now);
    for (const { limit: count, seconds } of parseSpec(spec)) {
      const w = this.windows.find((x) => x.seconds === seconds);
      if (!w) continue;
      // Riot đếm nhiều hơn ta biết → coi phần dư như request vừa gửi (thận trọng nhất)
      while (w.stamps.length < count) w.stamps.push(now);
    }
  }

  /** ms phải chờ để mọi cửa sổ đều còn chỗ (0 = gửi được ngay). */
  waitMs(now: number): number {
    this.prune(now);
    let wait = 0;
    for (const w of this.windows) {
      const cap = this.effectiveLimit(w);
      if (w.stamps.length >= cap) {
        // chỗ trống xuất hiện khi stamp thứ (length - cap + 1) rời cửa sổ
        const oldest = w.stamps[w.stamps.length - cap];
        wait = Math.max(wait, oldest + w.seconds * 1000 - now + 5);
      }
    }
    return wait;
  }

  available(now: number): number {
    this.prune(now);
    let min = Infinity;
    for (const w of this.windows) min = Math.min(min, this.effectiveLimit(w) - w.stamps.length);
    return min === Infinity ? 0 : Math.max(0, min);
  }

  /** Tỉ lệ ngân sách còn trống (0..1) của cửa sổ chật nhất. */
  headroom(now: number): number {
    this.prune(now);
    let min = 1;
    for (const w of this.windows) {
      const cap = this.effectiveLimit(w);
      min = Math.min(min, Math.max(0, cap - w.stamps.length) / cap);
    }
    return min;
  }

  reserve(now: number) {
    for (const w of this.windows) w.stamps.push(now);
  }

  describe(): string {
    return this.windows.map((w) => `${w.limit}/${w.seconds}s`).join(" · ");
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Phạm vi dùng của key so với kho dữ liệu:
 *  - identity: cùng tài khoản Riot Developer với key đã xây kho → giải mã được PUUID trong DB,
 *    dùng cho mọi endpoint (rank, match ids theo puuid, account, tải trận).
 *  - matches-only: khác tài khoản → Riot trả 400 "Exception decrypting" cho PUUID của kho. Chỉ
 *    dùng để tải chi tiết trận theo match id (không mã hoá); PUUID trong response của nó là bản mã
 *    của tài khoản kia nên KHÔNG được đưa vào bảng players.
 *  - null: chưa biết — sẽ được thăm dò (1 request league-v4) trước khi dùng.
 */
export type KeyScope = "identity" | "matches-only";

/** Thông điệp Riot trả về khi id mã hoá không thuộc app của key. */
export const DECRYPT_ERROR_RE = /Exception decrypting/i;

export class KeyLimiter {
  private app = new WindowSet(DEFAULT_APP_LIMIT);
  private methods = new Map<string, WindowSet>();
  /** Bị Riot chặn (429) tới thời điểm này. */
  private blockedUntil = 0;
  /** 401/403 gần nhất → không dùng key tới thời điểm này. */
  private invalidUntil = 0;
  scope: KeyScope | null = null;
  requests = 0;
  lastStatus: number | null = null;

  constructor(readonly key: string) {}

  /** Riot báo không giải mã được PUUID bằng key này → key thuộc tài khoản khác. */
  markForeign() {
    this.scope = "matches-only";
  }

  /** Một request theo PUUID thành công → key cùng tài khoản với kho. */
  markIdentity() {
    if (this.scope !== "matches-only") this.scope = "identity";
  }

  private methodSet(method: string): WindowSet {
    let set = this.methods.get(method);
    if (!set) {
      set = new WindowSet();
      this.methods.set(method, set);
    }
    return set;
  }

  isUsable(now = Date.now()): boolean {
    return now >= this.invalidUntil;
  }

  waitMs(method: string, now = Date.now()): number {
    return Math.max(
      this.app.waitMs(now),
      this.methodSet(method).waitMs(now),
      this.blockedUntil - now,
      this.invalidUntil - now,
      0
    );
  }

  available(now = Date.now()): number {
    if (now < this.blockedUntil || now < this.invalidUntil) return 0;
    return this.app.available(now);
  }

  /** Tỉ lệ ngân sách app còn trống (0..1) — crawler dùng để chừa chỗ cho việc tiền cảnh. */
  headroom(now = Date.now()): number {
    if (now < this.blockedUntil || now < this.invalidUntil) return 0;
    return this.app.headroom(now);
  }

  /** Chờ tới khi gửi được rồi giữ chỗ (đồng bộ ngay sau khi hết chờ để tránh tranh chấp). */
  async acquire(method: string): Promise<void> {
    for (;;) {
      const now = Date.now();
      const wait = this.waitMs(method, now);
      if (wait <= 0) {
        this.app.reserve(now);
        this.methodSet(method).reserve(now);
        this.requests++;
        return;
      }
      await sleep(Math.min(wait, 30_000));
    }
  }

  /** Học giới hạn + đồng bộ số đếm từ response; ghi nhận 429/401/403. */
  observe(method: string, res: Response) {
    const now = Date.now();
    this.lastStatus = res.status;
    const appLimit = res.headers.get("X-App-Rate-Limit");
    const appCount = res.headers.get("X-App-Rate-Limit-Count");
    if (appLimit) this.app.setLimits(appLimit);
    if (appCount) this.app.syncCounts(appCount, now);
    const mLimit = res.headers.get("X-Method-Rate-Limit");
    const mCount = res.headers.get("X-Method-Rate-Limit-Count");
    if (mLimit) this.methodSet(method).setLimits(mLimit);
    if (mCount) this.methodSet(method).syncCounts(mCount, now);

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("Retry-After") ?? "5");
      this.blockedUntil = now + Math.min(Math.max(retryAfter, 1), 120) * 1000 + 250;
    } else if (res.status === 401 || res.status === 403) {
      this.invalidUntil = now + AUTH_FAIL_BLOCK_MS;
    } else if (res.ok) {
      this.invalidUntil = 0;
    }
  }

  /** Cho phép dùng lại ngay (ví dụ user vừa nhập lại key). */
  reset() {
    this.invalidUntil = 0;
    this.blockedUntil = 0;
    this.scope = null;
  }

  status(): "valid" | "invalid" | "unknown" {
    if (Date.now() < this.invalidUntil) return "invalid";
    if (this.lastStatus === null) return "unknown";
    return "valid";
  }

  describeLimits(): string {
    return this.app.describe();
  }
}

declare global {
  var __riotLimiters: Map<string, KeyLimiter> | undefined;
}

export function getLimiter(apiKey: string): KeyLimiter {
  if (!globalThis.__riotLimiters) globalThis.__riotLimiters = new Map();
  let limiter = globalThis.__riotLimiters.get(apiKey);
  if (!limiter) {
    limiter = new KeyLimiter(apiKey);
    globalThis.__riotLimiters.set(apiKey, limiter);
  }
  return limiter;
}

/**
 * Rút "method key" từ URL để tính method limit: bỏ host, giữ các đoạn path dạng chữ
 * cho tới đoạn đầu tiên là id (puuid, match id, tên...).
 *   /lol/match/v5/matches/VN2_123        → lol/match/v5/matches
 *   /lol/match/v5/matches/by-puuid/x/ids → lol/match/v5/matches/by-puuid
 */
export function methodKeyOf(url: string): string {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    path = url;
  }
  const segs = path.split("/").filter(Boolean);
  const kept: string[] = [];
  for (let i = 0; i < segs.length; i++) {
    if (i < 3 || /^[a-z-]+$/i.test(segs[i])) kept.push(segs[i]);
    else break;
  }
  return kept.join("/");
}

/** Chọn key sẵn sàng sớm nhất trong một tập key (dùng cho crawler nhiều key). */
export class KeyPool {
  private limiters: KeyLimiter[];
  private cursor = 0;

  constructor(keys: string[]) {
    this.limiters = keys.map(getLimiter);
  }

  usable(): KeyLimiter[] {
    const now = Date.now();
    return this.limiters.filter((l) => l.isUsable(now));
  }

  /** Key dùng được mà chưa biết phạm vi — cần thăm dò trước khi dùng cho việc cần định danh / tải trận. */
  unknownScope(): KeyLimiter[] {
    return this.usable().filter((l) => l.scope === null);
  }

  /**
   * Key có thời gian chờ ngắn nhất cho method này; hoà thì xoay vòng để chia đều.
   * `needIdentity` = endpoint nhận PUUID (rank, match ids, account) → chỉ key scope "identity".
   * Không cần định danh (tải trận theo match id) → mọi key đã biết phạm vi.
   * Null nếu không còn key phù hợp.
   */
  pick(method: string, needIdentity = false): string | null {
    const usable = this.usable().filter((l) =>
      needIdentity ? l.scope === "identity" : l.scope !== null
    );
    if (usable.length === 0) return null;
    const now = Date.now();
    let best: KeyLimiter | null = null;
    let bestWait = Infinity;
    for (let i = 0; i < usable.length; i++) {
      const l = usable[(this.cursor + i) % usable.length];
      const wait = l.waitMs(method, now);
      if (wait < bestWait) {
        best = l;
        bestWait = wait;
        if (wait === 0) break;
      }
    }
    this.cursor = (this.cursor + 1) % usable.length;
    return best?.key ?? null;
  }
}

const mask = (key: string) => `...${key.slice(-4)}`;

/** Ảnh chụp trạng thái các key cho UI (không lộ key). */
export function snapshotKeys(keys: string[], primary: string) {
  const now = Date.now();
  return keys.map((k) => {
    const l = getLimiter(k);
    return {
      hint: mask(k),
      primary: k === primary,
      status: l.status(),
      scope: l.scope,
      available: l.available(now),
      limits: l.describeLimits(),
      waitMs: l.waitMs("lol/match/v5/matches", now),
      requests: l.requests,
    };
  });
}

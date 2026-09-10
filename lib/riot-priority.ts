/**
 * Ưu tiên Riot API cho việc người dùng đang chờ (chia team, xác thực Riot ID khi đăng ký) so với
 * crawler thống kê chạy nền. Hai bên dùng chung key nên nếu crawler cứ xả hết ngân sách rate limit
 * thì lượt chia team sẽ phải chờ cửa sổ 2 phút, hoặc tệ hơn là dính 429.
 *
 *  - Route tiền cảnh gọi `beginForeground()` khi bắt đầu và `endForeground()` khi xong (kể cả lỗi).
 *  - Crawler gọi `waitForForeground()` trước MỖI request Riot: chừng nào còn request tiền cảnh đang
 *    chạy (+ vài giây đệm sau khi xong) thì crawler ngủ, không gọi Riot.
 *  - Ngoài ra crawler chỉ chạy khi key chính còn ≥ 25 % ngân sách (xem KeyLimiter.headroom) để
 *    lượt chia team bắt đầu là có sẵn lượt gọi ngay.
 *
 * Trạng thái nằm trên globalThis: một tiến trình server (pm2 fork) phục vụ cả route lẫn crawler.
 */

declare global {
  var __riotForeground: { active: number; lastEndedAt: number } | undefined;
}

/** Sau khi request tiền cảnh cuối cùng kết thúc, crawler vẫn nhường thêm bấy nhiêu ms
 *  (người dùng thường bấm chia lại / chia nhiều đợt liền nhau). */
export const FOREGROUND_GRACE_MS = 5_000;
/** Crawler chỉ gọi Riot khi key còn ít nhất tỉ lệ ngân sách này (mọi cửa sổ rate limit). */
export const CRAWLER_MIN_HEADROOM = 0.25;

function state() {
  if (!globalThis.__riotForeground) globalThis.__riotForeground = { active: 0, lastEndedAt: 0 };
  return globalThis.__riotForeground;
}

/** Đánh dấu bắt đầu một request tiền cảnh. Trả về hàm kết thúc (gọi nhiều lần vô hại). */
export function beginForeground(): () => void {
  const s = state();
  s.active++;
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    s.active = Math.max(0, s.active - 1);
    s.lastEndedAt = Date.now();
  };
}

/** true nếu đang có request tiền cảnh, hoặc vừa kết thúc chưa quá thời gian đệm. */
export function isForegroundBusy(now = Date.now()): boolean {
  const s = state();
  return s.active > 0 || now - s.lastEndedAt < FOREGROUND_GRACE_MS;
}

/** Số request tiền cảnh đang chạy (cho UI/log). */
export function foregroundCount(): number {
  return state().active;
}

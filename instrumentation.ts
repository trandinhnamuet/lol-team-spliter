/**
 * Hook khởi động của Next.js (stable từ v15) — `register()` chạy đúng một lần khi tiến trình
 * server khởi động (kể cả sau `pm2 restart`). Dùng để bật watchdog của module thống kê ngay
 * lập tức, thay vì chờ tới khi có ai mở trang `/stats` và gọi `GET /api/stats/crawl` lần đầu —
 * giúp job ở chế độ 24/7 (`autoRestart`) tự "Tiếp tục" trong vòng vài giây sau khi server khởi
 * động lại (thay vì nằm im tới khi có người vào trang).
 */
export async function register() {
  // Chỉ chạy trong runtime Node (không phải Edge) — pg và crawler dùng module Node thuần.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { isDbConfigured } = await import("./lib/stats/db");
  if (!isDbConfigured()) return;
  const { ensureWatchdog } = await import("./lib/stats/crawler");
  ensureWatchdog();
}

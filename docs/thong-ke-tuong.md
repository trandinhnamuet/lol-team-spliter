# Thống kê tướng theo rank (module `/stats`)

Module này gom lịch sử đấu xếp hạng bằng cách **crawl đệ quy** từ một ingame gốc, lưu vào
PostgreSQL (schema `lol`), rồi tính **tỉ lệ thắng / tỉ lệ chọn của mọi tướng theo bậc rank**
— lọc được "chỉ Bạc", "từ Lục Bảo trở lên", v.v.

```
Ingame gốc ──▶ account-v1 (PUUID) ──▶ league-v4 (rank) ──▶ match-v5 ids (trận xếp hạng)
                                                                │
                      ┌─────────────────────────────────────────┘
                      ▼
            match-v5 detail (10 người, tướng, thắng/thua, KDA) ──▶ lol.matches + lol.match_participants
                      │
                      └──▶ 9 người mới ──▶ lol.players (frontier, độ sâu +1) ──▶ lặp (BFS)
```

Code: `lib/stats/` (db, crawler, queries, types), `lib/riot-limiter.ts`, `lib/champions.ts`,
API `app/api/stats/*` + `app/api/keys`, UI `app/stats/page.tsx` + `components/stats/*`.

## 1. Cấu hình

`.env.local` (không commit — xem `.env.example`):

```
DB_HOST=...      DB_PORT=6543     DB_USERNAME=...     DB_PASSWORD=...     DB_NAME=postgres
# DB_SSL=false  (chỉ khi Postgres local không SSL)
```

Schema `lol` và 4 bảng được tạo tự động (idempotent) ở lần truy vấn đầu:

| Bảng | Nội dung |
|---|---|
| `lol.players` | Mỗi PUUID một dòng: tên#tag, rank (tier/division/lp), `depth` (khoảng cách tới gốc), `crawl_status` (`pending` → `crawled` / `error`), `rank_fetched_at`. |
| `lol.matches` | Mỗi trận một dòng: queue, patch, thời gian, **`est_tier`** (bậc rank ước lượng) + `known_ranks` (số người trong trận đã biết rank). |
| `lol.match_participants` | 10 dòng/trận: tướng, vị trí, đội, thắng/thua, K/D/A. |
| `lol.crawl_jobs` | Lịch sử các lần thu thập: tham số, trạng thái, bộ đếm (người, trận mới, trận bỏ qua, request). |

Dữ liệu là **kho chung theo platform** (vn2, kr…): mỗi lần "Bắt đầu" là một job mới nhưng
người/trận đã có được dùng lại, không tải lại.

## 2. Crawler (`lib/stats/crawler.ts`)

Chạy nền trong tiến trình server (một job tại một thời điểm — cùng chia rate limit với trang
chia team). Vòng lặp:

1. Lấy người `pending` có `depth` nhỏ nhất (BFS), bỏ người vượt **Độ sâu tối đa**.
2. **Rank** (1 request, bỏ qua nếu đã tra trong 7 ngày) → cập nhật `players`, tính lại
   `est_tier` các trận đã lưu mà người này góp mặt.
3. **Danh sách match id** (1 request): chỉ queue xếp hạng đã chọn (420 Đơn/Đôi, 440 Linh Hoạt),
   tối đa **Trận / người** id.
4. **Lọc id đã có trong DB** (không tốn request) → chỉ tải trận mới (1 request/trận).
5. Ghi trận + 10 người; người chưa có → `pending` ở `depth + 1`.
6. Đánh dấu người đó `crawled`; dừng khi đủ **Tối đa người** hoặc hết frontier.

Tham số mặc định: 20 trận/người, 200 người, độ sâu 3. Có thể **Tạm dừng** (người đang dở vẫn
`pending`, lần tiếp tục làm lại) và **Tiếp tục**.

### Chế độ liên tục 24/7 (`autoRestart`, mặc định bật trên form)

- **Không giới hạn**: `max_players = 0`, `max_depth = 0` (server ép về 0 bất kể form gửi gì).
- **Không bao giờ "done"**: khi hết người `pending` mới, crawler lấy người đã crawl **lâu nhất**
  (`crawled_at` cũ nhất) đưa lại hàng đợi để tải trận *mới* của họ → cả mạng lưới được làm mới
  xoay vòng; tốc độ hoàn toàn do rate limit của (các) key quyết định, không bao giờ vượt.
- **Nhịp tim**: vòng lặp ghi `updated_at = now()` mỗi 30 s (kể cả khi đang chờ rate limit). Job
  `running` mà quá **120 s** không có nhịp tim = tiến trình đã chết (server restart/crash) → coi
  là `paused`. Trạng thái sống/chết dựa trên DB, không dựa biến trong bộ nhớ, nên nhiều tiến trình
  dùng chung DB (dev + production) không dẫm lên nhau: tiến trình khác thấy nhịp tim mới sẽ không
  khởi động job thứ hai; bấm Tạm dừng từ tiến trình khác chỉ ghi `paused` vào DB và vòng lặp tự
  thoát sau người đang xử lý.
- **Watchdog** (`ensureWatchdog`, bật từ `instrumentation.ts` lúc server khởi động và khi route
  `/api/stats/crawl` được nạp): mỗi 60 s, nếu không có job nào sống, tự **Tiếp tục** job 24/7 đang
  `paused`/`error`/`running`-mất-nhịp-tim. Nhờ đó job tự hồi sau `pm2 restart`/deploy (~2–3 phút),
  sau lỗi liên tiếp thoáng qua, và ngay sau khi được thêm key mới lúc mọi key cũ đã hết hạn.
- **Giới hạn thật sự duy nhất là key**: dev key của Riot hết hạn sau 24 giờ. Khi đó job dừng với
  ghi chú "Không còn Riot API key hợp lệ"; dán key mới ở thanh trên cùng hoặc mục Riot API keys,
  watchdog sẽ tự chạy tiếp trong ≤ 1 phút. Muốn chạy thật sự không cần đụng tay, cần key
  Personal/Production (không hết hạn) đăng ký ở developer.riotgames.com.
- Tắt chế độ này (bỏ tick) thì job hoạt động như cũ: dừng khi đủ người/hết frontier, server restart
  thì chờ bấm Tiếp tục.

### Chi phí request

Mỗi người mở rộng tốn **2 request cố định** (rank + ids) **+ số trận mới**. Với dev key
(100 request / 2 phút) và 20 trận/người: ≈ 4–5 người/2 phút, ≈ 2 500 trận/giờ; đồ thị càng dày
càng nhiều trận trùng nên chi phí giảm dần. Mọi trận và rank chỉ tải **một lần**.

### Bậc rank của trận (`est_tier`)

Riot không trả rank trong dữ liệu trận, và tra rank cả 10 người mỗi trận tốn gấp 10 request.
Thay vào đó `est_tier` = **trung vị rank những người trong trận đã biết rank** (`known_ranks`
người). Lúc mới lưu chỉ biết rank người được crawl; khi crawl tới người khác cùng trận,
`est_tier` được tính lại. Matchmaking xếp hạng ghép người cùng mức nên sai số thường ≤ 1 bậc.
Trận chưa xác định bậc (người crawl chưa rank) chỉ xuất hiện khi lọc "Tất cả".

## 3. Rate limit & nhiều key (`lib/riot-limiter.ts`)

Mục tiêu: **không bao giờ nhận 429**. Mọi request Riot (cả trang chia team) đi qua `riotFetch`,
và `riotFetch` chờ limiter của key đó trước khi gửi:

- Limiter đọc header `X-App-Rate-Limit` / `X-App-Rate-Limit-Count` / `X-Method-Rate-Limit(-Count)`
  của từng response để **tự học giới hạn thật của key** (dev 20/1s + 100/120s; production khác)
  và đồng bộ số đếm nếu key đang được nơi khác dùng.
- Đếm **cửa sổ trượt** phía client với biên an toàn 95 %; đầy thì tính chính xác số ms tới khi
  có chỗ trống và ngủ đúng bấy nhiêu.
- Vẫn nhận 429 (hiếm) → chặn key theo `Retry-After`; 401/403 → loại key 10 phút rồi thử lại.

**Nhiều key:** thêm ở mục "Riot API keys" trong trang `/stats` (dán nhiều key, mỗi dòng một
key; key được kiểm tra với Riot trước khi lưu vào `data/config.json` → `riotApiKeys`). Crawler
dùng `KeyPool`: mỗi request chọn key có thời gian chờ ngắn nhất (hoà thì xoay vòng). Key chính
(thanh trên cùng) luôn nằm trong pool; API `GET/POST/DELETE /api/keys`.

**Ràng buộc quan trọng — PUUID mã hoá theo tài khoản developer** (xác nhận thực nghiệm 2026-09-10:
cùng một trận, `metadata.participants` trả về PUUID khác nhau tuỳ key; PUUID lấy bằng key A gửi
qua key B của tài khoản khác → 400 `Exception decrypting`). Hệ quả và cách xử lý:

| Phạm vi key (`scope`) | Là gì | Được dùng cho |
|---|---|---|
| `identity` | cùng tài khoản Riot Developer với key đã xây kho | mọi endpoint: rank, match ids theo PUUID, account, tải trận |
| `matches-only` | tài khoản khác | chỉ `GET /lol/match/v5/matches/{matchId}` (match id không mã hoá) |

- Phạm vi được **thăm dò tự động** (1 request league-v4 với một PUUID trong kho) khi thêm key và
  khi crawler gặp key chưa rõ; `riotFetch` nhận 400 `Exception decrypting` → đánh dấu
  `matches-only`, request theo PUUID thành công → `identity`.
- Trận tải bằng key `matches-only` vẫn ghi đủ 10 participants (tướng, thắng/thua, KDA, vị trí —
  đủ cho thống kê) và `est_tier` lấy theo rank người được crawl, nhưng **không** đưa PUUID của nó
  vào `players` (bản mã của tài khoản khác, không dùng lại được).
- Vì tải trận chiếm đa số request (2 + N mỗi người), key khác tài khoản vẫn nhân tốc độ gần
  tuyến tính; phần định danh (2 request/người) luôn đi qua key `identity`.
- **Không được đổi key chính sang tài khoản khác** khi kho đã có dữ liệu: mọi PUUID đã lưu trở
  thành không giải mã được → crawler pause với ghi chú "Không có key nào cùng tài khoản…". Kho
  trống thì key chính lúc bắt đầu chính là "tài khoản gốc" của kho.

## 4. Thống kê (`lib/stats/queries.ts`)

`GET /api/stats/champions?platform=vn2&tiers=SILVER,GOLD&queues=420&minGames=5`

- Chọn trận theo platform, queue, `est_tier ∈ tiers` (bỏ `tiers` = mọi bậc).
- Mỗi tướng: số trận, thắng, **tỉ lệ thắng**, **tỉ lệ chọn** = lượt chơi ÷ số trận khớp bộ lọc,
  K/D/A trung bình, vị trí phổ biến nhất. `minGames` loại tướng quá ít mẫu.
- Tên tiếng Việt + ảnh tướng lấy từ Data Dragon (`lib/champions.ts`, cache 6 giờ).

Trên UI: preset (Tất cả · Sắt–Đồng · Bạc · Vàng · Bạch Kim · Lục Bảo+ · Kim Cương+ · Cao Thủ+)
hoặc bấm từng huy hiệu để tự chọn tập bậc; chọn chế độ, số trận tối thiểu; bấm tiêu đề cột để
sắp xếp. Bảng tự tải lại khi kho có trận mới.

`GET /api/stats/players?platform=vn2&q=ten&page=1&pageSize=50` — danh sách ingame đã phát hiện
(BFS order), rank, độ sâu, số trận đã lưu, trạng thái, link op.gg.

`GET/POST /api/stats/crawl` — trạng thái (job mới nhất, tổng quan kho, pool key) và điều khiển
`{action: start|pause|resume, platform, riotId, queueIds, matchesPerPlayer, maxPlayers, maxDepth}`.

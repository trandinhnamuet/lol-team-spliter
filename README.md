# LoL Team Splitter

Chia danh sách game thủ Liên Minh Huyền Thoại thành các team 5 người cân bằng trình độ, dựa trên rank lấy từ Riot API.

## Tính năng

- **2 cách nhập danh sách:**
  1. Dán danh sách tên in-game (mỗi dòng một `Tên#TAG`)
  2. Tạo link đăng ký (`/register/<id>`) — game thủ tự vào nhập Riot ID, form kiểm tra tài khoản tồn tại qua Riot API ngay khi gõ
- **Chia team:** tra rank từng người (League-v4 by-puuid), quy đổi rank → elo theo bảng cấu hình, chia team 5 người bằng snake draft + local search sao cho tổng elo các team chênh lệch ít nhất. Người dư thành dự bị.
- **Trang Admin** (`/admin`): chỉnh elo cho từng mức rank (Sắt IV → Thách Đấu + Chưa rank), xem danh sách sự kiện.
- **Trạng thái Riot key** hiện thường trực trên thanh đầu trang, tự kiểm tra mỗi 60 giây; khi hết hạn có thể dán key mới ngay tại đó (key được kiểm tra hợp lệ trước khi lưu).

## Riot API sử dụng

| API | Endpoint | Routing |
|---|---|---|
| Account-v1 | `/riot/account/v1/accounts/by-riot-id/{gameName}/{tagLine}` | cluster (`asia` cho VN) |
| League-v4 | `/lol/league/v4/entries/by-puuid/{puuid}` | platform (`vn2`) |
| Lol-status-v4 | `/lol/status/v4/platform-data` | platform — dùng kiểm tra key |

Rank ưu tiên Đơn/Đôi (`RANKED_SOLO_5x5`), fallback Linh Hoạt (`RANKED_FLEX_SR`), không có thì tính là Chưa rank.

## Chạy

```bash
npm install
npm run dev        # http://localhost:3000
```

Lấy development key (hạn 24h) tại https://developer.riotgames.com rồi dán vào thanh trạng thái key trên đầu trang. Có thể đặt sẵn qua biến môi trường `RIOT_API_KEY`.

Cấu hình và danh sách sự kiện lưu ở thư mục `data/` (JSON) — cần deploy dạng Node server (`npm run build && npm start`), không chạy được trên môi trường serverless không có filesystem ghi được.

## Lưu ý

- Server mặc định `vn2` (Việt Nam). Đổi platform bằng cách sửa `data/config.json` (`"platform": "kr"`, `"na1"`, ...).
- Trang `/admin` chưa có đăng nhập — nếu deploy công khai nên chặn bằng reverse proxy (basic auth) hoặc bổ sung auth.
- Dev key của Riot giới hạn 20 request/giây — app gọi tuần tự và tự retry khi bị 429, danh sách lớn sẽ mất vài giây.

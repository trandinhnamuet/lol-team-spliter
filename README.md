# LoL Team Splitter

Chia team đấu tập/giải nội bộ Liên Minh Huyền Thoại cân bằng theo rank thật, tra qua Riot API.

- Dán danh sách `Tên#TAG` hoặc tạo link cho người chơi tự đăng ký.
- Tra rank (Đơn/Đôi, fallback Linh Hoạt), quy elo, chia team sao cho tổng elo chênh ít nhất.
- Tuỳ chọn ước lượng MMR cho người chưa rank qua lịch sử đấu hoặc cấp độ tài khoản.
- Lưu kết quả thành link chia sẻ, cấu hình bảng elo trong trang Admin.
- Trải nghiệm kiểu client LMHT: popup "Hoàn thành chia team" (như màn Đã tìm thấy trận) và âm thanh
  hover/click cho mọi nút. Âm thanh được tổng hợp bằng Web Audio (không dùng file của Riot); muốn dùng
  bộ âm riêng thì đặt `hover|click|accept|match-found.mp3|ogg` vào `public/sounds/` — có file là tự ưu tiên.
  Nút loa ở thanh trạng thái để tắt/bật tiếng (lưu trong trình duyệt).

- **Thống kê tướng theo rank** (`/stats`): crawl đệ quy lịch sử xếp hạng từ một ingame gốc vào
  PostgreSQL (schema `lol`), tính tỉ lệ thắng / tỉ lệ chọn từng tướng, lọc theo bậc rank (chỉ Bạc,
  Lục Bảo trở lên...). Rate limiter chủ động + hỗ trợ nhiều Riot API key xoay vòng.

**Cơ chế chia team chi tiết: [docs/co-che-chia-team.md](docs/co-che-chia-team.md)**
**Module thống kê: [docs/thong-ke-tuong.md](docs/thong-ke-tuong.md)**

## Chạy dev

```bash
npm install
npm run dev
```

Mở http://localhost:3000, vào `/admin` nhập Riot API key (lấy tại
[developer.riotgames.com](https://developer.riotgames.com)). Key và dữ liệu sự kiện/kết quả
lưu trong `data/` (không commit).

Module thống kê cần PostgreSQL: copy `.env.example` → `.env.local` và điền `DB_*` (bảng tự tạo trong
schema `lol` khi dùng lần đầu). Không có DB thì các trang khác vẫn chạy bình thường.

Production: build bằng `npm run build` rồi `npm start -- -p 3000` (đang chạy qua pm2 + nginx).

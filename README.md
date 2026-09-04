# LoL Team Splitter

Chia team đấu tập/giải nội bộ Liên Minh Huyền Thoại cân bằng theo rank thật, tra qua Riot API.

- Dán danh sách `Tên#TAG` hoặc tạo link cho người chơi tự đăng ký.
- Tra rank (Đơn/Đôi, fallback Linh Hoạt), quy elo, chia team sao cho tổng elo chênh ít nhất.
- Tuỳ chọn ước lượng MMR cho người chưa rank qua lịch sử đấu hoặc cấp độ tài khoản.
- Lưu kết quả thành link chia sẻ, cấu hình bảng elo trong trang Admin.

**Cơ chế chia team chi tiết: [docs/co-che-chia-team.md](docs/co-che-chia-team.md)**

## Chạy dev

```bash
npm install
npm run dev
```

Mở http://localhost:3000, vào `/admin` nhập Riot API key (lấy tại
[developer.riotgames.com](https://developer.riotgames.com)). Key và dữ liệu sự kiện/kết quả
lưu trong `data/` (không commit).

Production: build bằng `npm run build` rồi `npm start -- -p 3000` (đang chạy qua pm2 + nginx).

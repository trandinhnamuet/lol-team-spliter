# Cơ chế chia team

Tài liệu này mô tả cách hệ thống biến một danh sách tên in-game thành các team cân bằng.
Luồng tổng quát gồm 3 bước: **tra cứu người chơi → quy đổi elo → chia team tối ưu**.

```
Danh sách Tên#TAG ──▶ Riot API (account, rank, level) ──▶ Elo từng người ──▶ Thuật toán chia ──▶ Các team + dự bị
                          │ (tuỳ chọn)
                          └─▶ Ước lượng MMR cho người chưa rank (match-v5)
```

## 1. Tra cứu người chơi

Với mỗi dòng `Tên#TAG` (hoặc người đã đăng ký qua link sự kiện, đã có sẵn PUUID):

1. **account-v1** — đổi Riot ID thành PUUID. Sai định dạng hoặc không tồn tại thì người đó bị
   loại khỏi kết quả và liệt kê ở mục "không xử lý được".
2. **league-v4** — lấy rank theo PUUID: ưu tiên **Đơn/Đôi**, không có thì lấy **Linh Hoạt**,
   không có nốt thì coi là **chưa rank (UNRANKED)**.
3. **summoner-v4** — lấy icon đại diện và **cấp độ tài khoản** (cấp độ còn dùng cho bước ước
   lượng bên dưới; lỗi ở bước này không loại người chơi, chỉ thiếu avatar).

Khu vực tra cứu (VN, KR, NA...) chọn ở góc trên trang, mặc định theo cấu hình server (`vn2`).
Kết quả trả về client theo stream NDJSON nên thanh tiến độ chạy theo từng người.

## 2. Quy đổi rank → elo

Elo lấy từ **bảng elo** cấu hình được trong trang Admin (`data/config.json`). Bảng mặc định:
mỗi bậc rank nhỏ cách nhau **100 điểm**, từ Sắt IV = 100 đến Kim Cương I = 2800, sau đó
Cao Thủ = 2900, Đại Cao Thủ = 3100, Thách Đấu = 3300.

- **Cao Thủ trở lên tính cả LP** theo đường cong bão hoà `+200 × LP / (LP + 400)`:
  LP càng cao elo càng tăng (100 LP → +40, 300 LP → +86, 539 LP → +115, 618 LP → +121,
  2000 LP → +167) nhưng tiệm cận +200 chứ không chạm — nghĩa là Cao Thủ dù bao nhiêu LP
  vẫn dưới Đại Cao Thủ 0 LP (cách nhau 200 điểm theo bảng mặc định).
- **Chưa rank** mặc định tính bằng **Bạc IV (900)**, trừ khi bật ước lượng MMR (mục 3).

## 3. Ước lượng MMR cho người chưa rank (tuỳ chọn)

Checkbox **"Ước lượng MMR cho người chưa rank"** ở trang chủ, **mặc định tắt**. Khi bật, người
chưa rank được đoán trình qua 2 tầng (code: `lib/mmr-estimate.ts`):

### 3a. Theo lịch sử đấu (match-v5)

Ý tưởng: matchmaking của Riot xếp bạn vào lobby nào thì trình bạn quanh mức đó.

1. Lấy tối đa **8 match ID** gần nhất (lưu ý: server Đông Nam Á dùng cluster `sea`,
   khác cluster `asia` của account-v1).
2. Chọn tối đa **3 trận** thuộc queue PvP có matchmaking — normal draft/blind, ranked,
   ARAM, Swiftplay, quickplay, Clash, URF, Nexus Blitz, Ultimate Spellbook, Arena.
   Trận bot/custom/tutorial bị bỏ qua.
3. Tra rank của những người cùng trận (tối đa **18 lượt tra**), quy ra elo theo bảng ở mục 2.
4. Cần tối thiểu **3 mẫu có rank**; elo ước lượng = **trung vị** của các mẫu.

Kết quả tra rank được cache chung cho cả lượt chia (người trong danh sách và người cùng trận
đã tra rồi không tra lại) để tiết kiệm rate limit — mỗi người chưa rank tốn tối đa ~22 request.

### 3b. Theo cấp độ tài khoản (fallback)

Nếu không ước lượng được từ lịch sử đấu (không có trận nào, toàn trận bot, hoặc không đủ mẫu)
thì gán elo theo cấp độ tài khoản — thang cố tình hào phóng vì unranked lâu năm thường là
smurf hoặc người bỏ rank:

| Cấp độ | Elo | Tương đương |
|---|---|---|
| < 30 | 500 | Đồng IV |
| 30–59 | 1000 | Bạc III |
| 60–119 | 1300 | Vàng IV |
| 120–199 | 1500 | Vàng II |
| 200–349 | 1800 | Bạch Kim III |
| 350–499 | 2100 | Lục Bảo IV |
| 500+ | 2300 | Lục Bảo II |

Trên kết quả, elo ước lượng hiển thị dạng `≈1900` kèm badge **"MMR ≈"** (từ lịch sử đấu,
tooltip ghi số mẫu) hoặc **"Cấp ≈"** (từ cấp độ). Mỗi lượt ước lượng đều ghi log server
(`[mmr-estimate] ...`) nêu số trận dùng, số người tra, số mẫu và kết quả/lý do thất bại —
xem bằng `pm2 logs lol-team-splitter`.

Khi checkbox tắt, mọi người chưa rank giữ nguyên mức Bạc IV như mục 2.

## 4. Thuật toán chia team

Code: `lib/balance.ts`. Mục tiêu: **tổng elo các team chênh nhau ít nhất**.

### Số team và đội hình chính

Với `n` người hợp lệ và cỡ team `s` (chọn trên UI, mặc định 5, giới hạn 1–20):

- `n ≥ 2s` → chia `floor(n / s)` team, mỗi team đúng `s` người.
- `n < 2s` → vẫn chia **2 team đều nhau** (`floor(n / 2)` người/team) để dùng được khi ít người.

Đội hình chính lấy từ những người **elo cao nhất**; người dư (elo thấp nhất) xử lý ở bước dự bị.

### Tối ưu hoá

1. **Snake draft** khởi tạo: xếp theo elo giảm dần, phát người theo thứ tự 1→k rồi k→1 xen kẽ.
2. **Local search**: thử hoán đổi mọi cặp người chơi khác team; giữ hoán đổi nào làm giảm
   hàm mục tiêu (tổng bình phương độ lệch tổng elo so với trung bình — mượt hơn max-min nên
   ít kẹt cực trị địa phương); lặp đến khi hết cải thiện.
3. **15 lần khởi động lại** với thứ tự xáo trộn (RNG có seed cố định → kết quả tái lập được),
   giữ phương án có **spread** (chênh lệch tổng elo max − min) nhỏ nhất; spread = 0 thì dừng sớm.

### Dự bị và bench

- Người dư được ghép làm **dự bị**, mỗi team tối đa 1: dự bị mạnh nhất vào team có tổng elo
  thấp nhất, cứ thế tiếp.
- Dư nữa thì vào **bench** (chưa xếp đội).
- **Tổng elo của team không tính dự bị.**

## 5. Kết quả

Mỗi team hiển thị danh sách người chơi (rank, elo, link op.gg), tổng elo Σ và thanh so sánh;
đầu trang ghi **spread** giữa các team. Kết quả có thể lưu thành link chia sẻ `/result/[id]`
(lưu trong `data/results.json`).

## Giới hạn đã biết

- Riot **không cung cấp rank các mùa trước** qua API, nên "rank cũ" không tham gia tính elo —
  chỉ suy được gián tiếp qua ước lượng MMR ở mục 3.
- Ước lượng MMR tốn request: dev key Riot giới hạn 100 request / 2 phút, nhiều người chưa rank
  cùng lúc sẽ chậm (hệ thống tự chờ và retry khi dính 429, kể cả lỗi mạng thoáng qua).
- Elo ước lượng từ ARAM/URF nhiễu hơn từ trận Summoner's Rift vì lobby các chế độ này
  nhiều người không rank.

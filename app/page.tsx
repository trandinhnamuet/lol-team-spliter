"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CSSProperties } from "react";
import HexCorners from "@/components/hex/HexCorners";
import TeamSizeInput, { parseTeamSize } from "@/components/hex/TeamSizeInput";
import { getStoredRegion } from "@/lib/region";
import { startSplit } from "@/lib/split-client";

type Tab = "paste" | "event";

/** Chuẩn hoá phía client cho khớp với server: bỏ khoảng trắng quanh dấu #. */
function normalizeLine(s: string): string {
  return s.trim().replace(/\s*#\s*/g, "#");
}

export default function HomePage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("paste");

  // Tab 1: dán danh sách
  const [rawList, setRawList] = useState("");
  const [teamSize, setTeamSize] = useState("5");
  const [estimateUnranked, setEstimateUnranked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Tab 2: tạo sự kiện
  const [eventName, setEventName] = useState("");
  const [creating, setCreating] = useState(false);
  const [eventError, setEventError] = useState("");

  const lineCount = rawList.split("\n").filter((l) => l.trim()).length;

  /** Khởi động lượt chia rồi chuyển sang /split/[id] — từ đó job chạy trên server,
   *  đóng tab không dừng nó lại và link luôn mở lại được. */
  async function split() {
    setLoading(true);
    setError("");
    const riotIds = rawList.split("\n").map(normalizeLine).filter(Boolean);
    const { id, error: err } = await startSplit({
      riotIds,
      teamSize: parseTeamSize(teamSize) ?? 5,
      platform: getStoredRegion(),
      estimateUnranked,
    });
    if (!id) {
      setError(err ?? "Có lỗi xảy ra");
      setLoading(false);
      return;
    }
    router.push(`/split/${id}`);
  }

  async function createEvent() {
    setCreating(true);
    setEventError("");
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: eventName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEventError(data.error ?? "Không tạo được sự kiện");
        return;
      }
      router.push(`/event/${data.event.id}`);
    } catch {
      setEventError("Lỗi kết nối server");
      setCreating(false);
    }
  }

  return (
    <div className="space-y-7">
      <div className="hex-reveal">
        <p className="hex-kicker">Hextech Draft</p>
        <h1 className="hex-h1 mt-1.5">Chia team cân bằng theo rank</h1>
      </div>

      <div className="hex-reveal flex gap-1 border-b border-gold-700/70" style={{ animationDelay: "80ms" }}>
        {(
          [
            ["paste", "Dán danh sách"],
            ["event", "Link đăng ký"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} className="hex-tab" data-active={tab === key}>
            {label}
          </button>
        ))}
      </div>

      {tab === "paste" && (
        <div className="hex-reveal space-y-5" style={{ animationDelay: "120ms" }}>
          <p className="max-w-3xl text-sm leading-relaxed text-steel-100">
            Mỗi dòng một tên in-game theo định dạng{" "}
            <code className="hex-code px-1.5 py-0.5 text-xs">Tên#TAG</code> (ví dụ:{" "}
            <code className="hex-code px-1.5 py-0.5 text-xs">Faker#KR1</code>). Hệ thống tra rank
            từng người qua Riot API rồi chia team theo số người bạn chọn sao cho tổng elo cân
            bằng nhất; người thừa được ghép vào các team làm dự bị (mỗi team tối đa 1).
          </p>

          <div className="hex-panel relative p-1">
            <HexCorners />
            <textarea
              value={rawList}
              onChange={(e) => setRawList(e.target.value)}
              rows={10}
              placeholder={"NguoiChoi1#VN2\nNguoiChoi2#VN2\nNguoiChoi3#VN2\n..."}
              className="hex-input border-0 bg-transparent p-3 font-mono text-sm shadow-none focus:shadow-none"
              style={{ boxShadow: "none" }}
            />
          </div>

          <label className="flex max-w-3xl cursor-pointer items-start gap-2.5 text-sm text-steel-100">
            <input
              type="checkbox"
              checked={estimateUnranked}
              onChange={(e) => setEstimateUnranked(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-magic-300,#0ac8b9)]"
            />
            <span>
              <span className="font-semibold text-gold-100">
                Ước lượng MMR cho người chưa rank
              </span>{" "}
              — tra vài trận gần nhất qua Riot API, lấy rank trung vị của những người cùng trận
              thay vì mặc định coi là Bạc IV; ai không có lịch sử đấu dùng được thì gán elo theo
              cấp độ tài khoản. Chính xác hơn nhưng chậm hơn đáng kể và tốn thêm lượt gọi API
              (dễ chạm rate limit nếu nhiều người chưa rank).
            </span>
          </label>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <TeamSizeInput value={teamSize} onChange={setTeamSize} />
            <button
              onClick={split}
              disabled={loading || lineCount < 2 || parseTeamSize(teamSize) === null}
              className="hex-btn hex-btn-magic"
            >
              {loading ? (
                <>
                  <span className="hex-spinner" style={{ "--size": "15px" } as CSSProperties} />
                  Đang khởi động…
                </>
              ) : (
                "⬡ Lấy rank & chia team"
              )}
            </button>
            <span className="font-display text-[0.65rem] font-bold uppercase tracking-[0.2em] text-steel-100">
              Summoners: <span className="text-gold-200">{lineCount}</span>
            </span>
          </div>
          {parseTeamSize(teamSize) === null && (
            <p className="text-xs text-blood-300">Số người mỗi team phải từ 1 đến 20.</p>
          )}
          <p className="text-xs text-steel-300">
            Bấm chia là mở một lượt có link riêng — lượt đó chạy trên server nên đóng tab vẫn
            xong và tự lưu kết quả.
          </p>

          {error && <p className="hex-reveal text-sm text-blood-300">{error}</p>}
        </div>
      )}

      {tab === "event" && (
        <div className="hex-reveal max-w-xl space-y-5" style={{ animationDelay: "120ms" }}>
          <p className="text-sm leading-relaxed text-steel-100">
            Tạo một link đăng ký để gửi cho game thủ. Mỗi người tự vào link, nhập tên in-game
            (được kiểm tra tồn tại qua Riot API) để đăng ký. Sau đó bạn quay lại trang sự kiện
            để chia team từ danh sách đã đăng ký.
          </p>
          <div className="hex-panel relative p-5">
            <HexCorners />
            <label className="mb-2 block font-display text-[0.62rem] font-bold uppercase tracking-[0.2em] text-gold-200">
              Tên giải đấu
            </label>
            <input
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              placeholder="Ví dụ: Giải nội bộ tháng 9"
              className="hex-input px-3 py-2.5 text-sm"
              onKeyDown={(e) => e.key === "Enter" && eventName.trim() && createEvent()}
            />
            <button
              onClick={createEvent}
              disabled={creating || !eventName.trim()}
              className="hex-btn hex-btn-magic mt-4 w-full"
            >
              {creating ? (
                <>
                  <span className="hex-spinner" style={{ "--size": "15px" } as CSSProperties} />
                  Đang tạo…
                </>
              ) : (
                "⬡ Tạo link đăng ký"
              )}
            </button>
            {eventError && <p className="mt-3 text-sm text-blood-300">{eventError}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

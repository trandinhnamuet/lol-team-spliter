"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CSSProperties } from "react";
import HexCorners from "@/components/hex/HexCorners";
import TeamResults from "@/components/TeamResults";
import type { ResolvedPlayer, TeamResult } from "@/lib/types";

type Tab = "paste" | "event";

interface SplitResponse {
  players?: ResolvedPlayer[];
  failed?: ResolvedPlayer[];
  result?: TeamResult;
  error?: string;
}

export default function HomePage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("paste");

  // Tab 1: dán danh sách
  const [rawList, setRawList] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [failed, setFailed] = useState<ResolvedPlayer[]>([]);
  const [result, setResult] = useState<TeamResult | null>(null);

  // Tab 2: tạo sự kiện
  const [eventName, setEventName] = useState("");
  const [creating, setCreating] = useState(false);
  const [eventError, setEventError] = useState("");

  const lineCount = rawList.split("\n").filter((l) => l.trim()).length;

  async function split() {
    setLoading(true);
    setError("");
    setResult(null);
    setFailed([]);
    try {
      const riotIds = rawList.split("\n").map((l) => l.trim()).filter(Boolean);
      const res = await fetch("/api/split", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ riotIds }),
      });
      const data = (await res.json()) as SplitResponse;
      if (!res.ok) {
        setError(data.error ?? "Có lỗi xảy ra");
        setFailed((data.players ?? []).filter((p) => !p.ok));
        return;
      }
      setResult(data.result ?? null);
      setFailed(data.failed ?? []);
    } catch {
      setError("Lỗi kết nối server");
    } finally {
      setLoading(false);
    }
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
            từng người qua Riot API rồi chia team 5 người sao cho tổng elo cân bằng nhất.
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

          <div className="flex flex-wrap items-center gap-4">
            <button onClick={split} disabled={loading || lineCount < 2} className="hex-btn hex-btn-magic">
              {loading ? (
                <>
                  <span className="hex-spinner" style={{ "--size": "15px" } as CSSProperties} />
                  Đang tra rank &amp; chia team…
                </>
              ) : (
                "⬡ Lấy rank & chia team"
              )}
            </button>
            <span className="font-display text-[0.65rem] font-bold uppercase tracking-[0.2em] text-steel-100">
              Summoners: <span className="text-gold-200">{lineCount}</span>
            </span>
          </div>

          {error && <p className="hex-reveal text-sm text-blood-300">{error}</p>}
          {failed.length > 0 && (
            <div className="hex-alert hex-reveal p-4 text-sm">
              <p className="mb-1.5 font-semibold text-blood-300">
                Không xử lý được {failed.length} người (bị loại khỏi kết quả):
              </p>
              <ul className="list-inside list-disc space-y-0.5 text-gold-100/85">
                {failed.map((p, i) => (
                  <li key={i}>
                    {p.input} — {p.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {result && <TeamResults result={result} />}
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

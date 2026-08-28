"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
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
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Chia team cân bằng theo rank</h1>

      <div className="flex gap-2 border-b border-zinc-800">
        {(
          [
            ["paste", "📋 Dán danh sách"],
            ["event", "🔗 Link đăng ký"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`border-b-2 px-4 py-2 text-sm font-medium ${
              tab === key
                ? "border-blue-500 text-blue-300"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "paste" && (
        <div className="space-y-4">
          <p className="text-sm text-zinc-400">
            Mỗi dòng một tên in-game theo định dạng <code className="rounded bg-zinc-800 px-1">Tên#TAG</code>{" "}
            (ví dụ: <code className="rounded bg-zinc-800 px-1">Faker#KR1</code>). Hệ thống sẽ tra
            rank từng người qua Riot API rồi chia team 5 người sao cho tổng elo cân bằng nhất.
          </p>
          <textarea
            value={rawList}
            onChange={(e) => setRawList(e.target.value)}
            rows={10}
            placeholder={"NguoiChoi1#VN2\nNguoiChoi2#VN2\nNguoiChoi3#VN2\n..."}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 p-3 font-mono text-sm outline-none focus:border-blue-500"
          />
          <div className="flex items-center gap-4">
            <button
              onClick={split}
              disabled={loading || lineCount < 2}
              className="rounded-lg bg-blue-600 px-5 py-2 font-medium text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {loading ? "Đang tra rank & chia team…" : "Lấy rank & chia team"}
            </button>
            <span className="text-sm text-zinc-500">{lineCount} người chơi</span>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          {failed.length > 0 && (
            <div className="rounded-lg border border-red-900/60 bg-red-950/30 p-3 text-sm">
              <p className="mb-1 font-medium text-red-300">
                Không xử lý được {failed.length} người (bị loại khỏi kết quả):
              </p>
              <ul className="list-inside list-disc text-red-200/80">
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
        <div className="max-w-lg space-y-4">
          <p className="text-sm text-zinc-400">
            Tạo một link đăng ký để gửi cho game thủ. Mỗi người tự vào link, nhập tên in-game
            (được kiểm tra tồn tại qua Riot API) để đăng ký. Sau đó bạn quay lại trang sự kiện
            để chia team từ danh sách đã đăng ký.
          </p>
          <input
            value={eventName}
            onChange={(e) => setEventName(e.target.value)}
            placeholder="Tên giải đấu / custom (ví dụ: Giải nội bộ tháng 9)"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-sm outline-none focus:border-blue-500"
            onKeyDown={(e) => e.key === "Enter" && eventName.trim() && createEvent()}
          />
          <button
            onClick={createEvent}
            disabled={creating || !eventName.trim()}
            className="rounded-lg bg-blue-600 px-5 py-2 font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {creating ? "Đang tạo…" : "Tạo link đăng ký"}
          </button>
          {eventError && <p className="text-sm text-red-400">{eventError}</p>}
        </div>
      )}
    </div>
  );
}

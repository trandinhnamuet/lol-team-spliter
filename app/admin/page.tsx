"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { APEX_TIERS, DIVISIONS, TIER_LABELS, TIERS_WITH_DIVISIONS } from "@/lib/elo";

interface EventSummary {
  id: string;
  name: string;
  createdAt: string;
  open: boolean;
  playerCount: number;
}

export default function AdminPage() {
  const [eloMap, setEloMap] = useState<Record<string, number> | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [events, setEvents] = useState<EventSummary[]>([]);

  useEffect(() => {
    fetch("/api/elo", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setEloMap(d.eloMap))
      .catch(() => setMessage("Không tải được cấu hình elo"));
    fetch("/api/events", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setEvents(d.events ?? []))
      .catch(() => {});
  }, []);

  function setValue(key: string, value: string) {
    setEloMap((m) => (m ? { ...m, [key]: Number(value) || 0 } : m));
  }

  async function save(reset = false) {
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/elo", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reset ? { reset: true } : { eloMap }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "Lưu thất bại");
      } else {
        setEloMap(data.eloMap);
        setMessage(reset ? "Đã khôi phục bảng elo mặc định" : "Đã lưu bảng elo ✓");
      }
    } catch {
      setMessage("Lỗi kết nối server");
    } finally {
      setSaving(false);
    }
  }

  if (!eloMap) return <p className="text-zinc-400">Đang tải…</p>;

  const inputCls =
    "w-24 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-right font-mono text-sm outline-none focus:border-blue-500";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Admin</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Chỉnh số elo gán cho từng mức rank. Trạng thái và thay đổi Riot API key nằm ở thanh
          trên cùng (nút &quot;Đổi key&quot;).
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Bảng elo theo rank</h2>
        <div className="overflow-x-auto rounded-lg border border-zinc-800">
          <table className="w-full min-w-130 border-collapse bg-zinc-900 text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-zinc-400">
                <th className="px-4 py-2">Rank</th>
                {DIVISIONS.map((d) => (
                  <th key={d} className="px-4 py-2 text-right">
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TIERS_WITH_DIVISIONS.map((tier) => (
                <tr key={tier} className="border-b border-zinc-800/60">
                  <td className="px-4 py-2 font-medium">{TIER_LABELS[tier]}</td>
                  {DIVISIONS.map((div) => {
                    const key = `${tier}_${div}`;
                    return (
                      <td key={key} className="px-4 py-1.5 text-right">
                        <input
                          type="number"
                          value={eloMap[key] ?? 0}
                          onChange={(e) => setValue(key, e.target.value)}
                          className={inputCls}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
              {APEX_TIERS.map((tier) => (
                <tr key={tier} className="border-b border-zinc-800/60">
                  <td className="px-4 py-2 font-medium">{TIER_LABELS[tier]}</td>
                  <td className="px-4 py-1.5 text-right" colSpan={4}>
                    <input
                      type="number"
                      value={eloMap[tier] ?? 0}
                      onChange={(e) => setValue(tier, e.target.value)}
                      className={inputCls}
                    />
                  </td>
                </tr>
              ))}
              <tr>
                <td className="px-4 py-2 font-medium text-zinc-400">{TIER_LABELS.UNRANKED}</td>
                <td className="px-4 py-1.5 text-right" colSpan={4}>
                  <input
                    type="number"
                    value={eloMap.UNRANKED ?? 0}
                    onChange={(e) => setValue("UNRANKED", e.target.value)}
                    className={inputCls}
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={() => save(false)}
            disabled={saving}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {saving ? "Đang lưu…" : "Lưu bảng elo"}
          </button>
          <button
            onClick={() => save(true)}
            disabled={saving}
            className="rounded-lg border border-zinc-700 px-5 py-2 text-sm hover:bg-zinc-800 disabled:opacity-50"
          >
            Khôi phục mặc định
          </button>
          {message && <span className="text-sm text-zinc-300">{message}</span>}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Sự kiện đăng ký</h2>
        {events.length === 0 ? (
          <p className="text-sm text-zinc-500">Chưa có sự kiện nào.</p>
        ) : (
          <ul className="divide-y divide-zinc-800 rounded-lg border border-zinc-800 bg-zinc-900">
            {events.map((e) => (
              <li key={e.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                <Link href={`/event/${e.id}`} className="font-medium text-blue-300 hover:underline">
                  {e.name}
                </Link>
                <span className="text-zinc-500">{e.playerCount} người</span>
                <span className={e.open ? "text-emerald-400" : "text-red-400"}>
                  {e.open ? "Đang mở" : "Đã đóng"}
                </span>
                <span className="ml-auto text-xs text-zinc-600">
                  {new Date(e.createdAt).toLocaleString("vi-VN")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

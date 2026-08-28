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

  if (!eloMap)
    return (
      <p className="flex items-center gap-2 text-hex-frame-500">
        <span className="hex-spinner" />
        Đang tải…
      </p>
    );

  const inputCls = "hex-input w-24 rounded-sm px-2 py-1 text-right font-mono text-sm";

  return (
    <div className="space-y-8">
      <div className="hex-fade-item">
        <p className="font-display text-xs uppercase tracking-[0.25em] text-hex-cyan-400">Hextech Console</p>
        <h1 className="mt-1 font-serif text-3xl font-semibold text-hex-gold-100">Admin</h1>
        <p className="mt-1 text-sm text-hex-frame-500">
          Chỉnh số elo gán cho từng mức rank. Trạng thái và thay đổi Riot API key nằm ở thanh
          trên cùng (nút &quot;Đổi key&quot;).
        </p>
      </div>

      <section className="hex-fade-item">
        <h2 className="mb-3 font-serif text-lg font-semibold uppercase tracking-[0.06em] text-hex-gold-200">
          Bảng elo theo rank
        </h2>
        <div className="hex-panel overflow-x-auto">
          <table className="w-full min-w-130 border-collapse text-sm">
            <thead>
              <tr className="border-b border-hex-gold-600/50 text-left text-hex-frame-500">
                <th className="px-4 py-2 font-display text-xs uppercase tracking-wider">Rank</th>
                {DIVISIONS.map((d) => (
                  <th key={d} className="px-4 py-2 text-right font-display text-xs uppercase tracking-wider">
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TIERS_WITH_DIVISIONS.map((tier) => (
                <tr key={tier} className="border-b border-hex-frame-700/50">
                  <td className="px-4 py-2 font-medium text-hex-gold-100">{TIER_LABELS[tier]}</td>
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
                <tr key={tier} className="border-b border-hex-frame-700/50">
                  <td className="px-4 py-2 font-medium text-hex-gold-100">{TIER_LABELS[tier]}</td>
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
                <td className="px-4 py-2 font-medium text-hex-frame-500">{TIER_LABELS.UNRANKED}</td>
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
          <button onClick={() => save(false)} disabled={saving} className="hex-btn hex-btn-primary">
            {saving ? "Đang lưu…" : "Lưu bảng elo"}
          </button>
          <button onClick={() => save(true)} disabled={saving} className="hex-btn hex-btn-ghost">
            Khôi phục mặc định
          </button>
          {message && <span className="text-sm text-hex-gold-100">{message}</span>}
        </div>
      </section>

      <section className="hex-fade-item">
        <h2 className="mb-3 font-serif text-lg font-semibold uppercase tracking-[0.06em] text-hex-gold-200">
          Sự kiện đăng ký
        </h2>
        {events.length === 0 ? (
          <p className="text-sm text-hex-frame-500">Chưa có sự kiện nào.</p>
        ) : (
          <ul className="hex-panel divide-y divide-hex-frame-700/50">
            {events.map((e) => (
              <li key={e.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                <Link href={`/event/${e.id}`} className="font-medium text-hex-cyan-400 hover:underline">
                  {e.name}
                </Link>
                <span className="text-hex-frame-500">{e.playerCount} người</span>
                <span className={e.open ? "text-hex-green-400" : "text-hex-red-400"}>
                  {e.open ? "Đang mở" : "Đã đóng"}
                </span>
                <span className="ml-auto text-xs text-hex-frame-700">
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

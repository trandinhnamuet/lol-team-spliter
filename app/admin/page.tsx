"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import HexCorners from "@/components/hex/HexCorners";
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
  const [origin, setOrigin] = useState("");
  const [copiedId, setCopiedId] = useState("");
  const [busyId, setBusyId] = useState("");
  const [eventError, setEventError] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
    fetch("/api/elo", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setEloMap(d.eloMap))
      .catch(() => setMessage("Không tải được cấu hình elo"));
    void refreshEvents();
  }, []);

  async function refreshEvents() {
    try {
      const res = await fetch("/api/events", { cache: "no-store" });
      const data = await res.json();
      setEvents(data.events ?? []);
    } catch {
      setEventError("Không tải được danh sách sự kiện");
    }
  }

  async function copyRegisterLink(id: string) {
    await navigator.clipboard.writeText(`${origin}/register/${id}`);
    setCopiedId(id);
    setTimeout(() => setCopiedId(""), 1500);
  }

  async function toggleOpen(id: string, open: boolean) {
    setBusyId(id);
    setEventError("");
    try {
      const res = await fetch(`/api/events/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ open }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setEventError(data.error ?? "Không đổi được trạng thái sự kiện");
        return;
      }
      await refreshEvents();
    } catch {
      setEventError("Lỗi kết nối server");
    } finally {
      setBusyId("");
    }
  }

  async function removeEvent(id: string) {
    setBusyId(id);
    setEventError("");
    try {
      const res = await fetch(`/api/events/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setEventError(data.error ?? "Không xoá được sự kiện");
        return;
      }
      setConfirmDeleteId("");
      await refreshEvents();
    } catch {
      setEventError("Lỗi kết nối server");
    } finally {
      setBusyId("");
    }
  }

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
      <p className="flex items-center gap-2.5 text-steel-100">
        <span className="hex-spinner" />
        Đang tải…
      </p>
    );

  const inputCls = "hex-input w-24 px-2 py-1 text-right font-mono text-sm";

  return (
    <div className="space-y-9">
      <div className="hex-reveal">
        <p className="hex-kicker">Hextech Console</p>
        <h1 className="hex-h1 mt-1.5">Admin</h1>
        <p className="mt-2 max-w-2xl text-sm text-steel-100">
          Chỉnh số elo gán cho từng mức rank. Trạng thái và thay đổi Riot API key nằm ở thanh trên
          cùng (nút &quot;Đổi key&quot;).
        </p>
      </div>

      <section className="hex-reveal space-y-3" style={{ animationDelay: "80ms" }}>
        <h2 className="hex-section-title">Bảng elo theo rank</h2>
        <div className="hex-panel relative overflow-x-auto">
          <HexCorners />
          <table className="w-full min-w-130 border-collapse text-sm">
            <thead>
              <tr className="border-b border-gold-700 text-left">
                <th className="px-4 py-2.5 font-display text-[0.62rem] font-bold uppercase tracking-[0.18em] text-gold-200">
                  Rank
                </th>
                {DIVISIONS.map((d) => (
                  <th
                    key={d}
                    className="px-4 py-2.5 text-right font-display text-[0.62rem] font-bold uppercase tracking-[0.18em] text-gold-200"
                  >
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TIERS_WITH_DIVISIONS.map((tier) => (
                <tr key={tier} className="hex-player-row border-b border-steel-700/60">
                  <td className="px-4 py-2 font-medium text-gold-100">{TIER_LABELS[tier]}</td>
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
                <tr key={tier} className="hex-player-row border-b border-steel-700/60">
                  <td className="px-4 py-2 font-medium text-gold-100">{TIER_LABELS[tier]}</td>
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
              <tr className="hex-player-row">
                <td className="px-4 py-2 font-medium text-steel-100">{TIER_LABELS.UNRANKED}</td>
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
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={() => save(false)} disabled={saving} className="hex-btn">
            {saving ? "Đang lưu…" : "Lưu bảng elo"}
          </button>
          <button onClick={() => save(true)} disabled={saving} className="hex-btn hex-btn-ghost">
            Khôi phục mặc định
          </button>
          {message && <span className="hex-reveal text-sm text-gold-200">{message}</span>}
        </div>
      </section>

      <section className="hex-reveal space-y-3" style={{ animationDelay: "160ms" }}>
        <h2 className="hex-section-title">Sự kiện đăng ký</h2>
        {eventError && <p className="text-sm text-blood-300">{eventError}</p>}
        {events.length === 0 ? (
          <p className="text-sm text-steel-100">Chưa có sự kiện nào.</p>
        ) : (
          <ul className="hex-panel relative divide-y divide-steel-700/60">
            <HexCorners />
            {events.map((e) => (
              <li key={e.id} className="hex-player-row space-y-2 px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-3">
                  <Link
                    href={`/event/${e.id}`}
                    className="font-medium text-magic-300 transition-colors hover:text-magic-100 hover:[text-shadow:0_0_8px_rgba(10,200,185,0.6)]"
                  >
                    {e.name}
                  </Link>
                  <span className="text-steel-100">{e.playerCount} người</span>
                  <span className={e.open ? "text-magic-300" : "text-blood-300"}>
                    {e.open ? "Đang mở" : "Đã đóng"}
                  </span>
                  <span className="ml-auto font-mono text-xs text-steel-300">
                    {new Date(e.createdAt).toLocaleString("vi-VN")}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <code className="hex-code min-w-0 flex-1 basis-64 truncate text-xs">
                    {origin ? `${origin}/register/${e.id}` : `/register/${e.id}`}
                  </code>
                  <button
                    onClick={() => copyRegisterLink(e.id)}
                    className="hex-btn hex-btn-ghost"
                    title="Copy link đăng ký để gửi cho game thủ"
                  >
                    {copiedId === e.id ? (
                      <span className="text-magic-300">✓ Đã copy</span>
                    ) : (
                      "Copy link"
                    )}
                  </button>
                  <button
                    onClick={() => toggleOpen(e.id, !e.open)}
                    disabled={busyId === e.id}
                    className="hex-btn hex-btn-ghost"
                  >
                    {e.open ? "Đóng đăng ký" : "Mở lại đăng ký"}
                  </button>
                  {confirmDeleteId === e.id ? (
                    <>
                      <span className="text-xs text-blood-300">
                        Xoá vĩnh viễn cả {e.playerCount} người đã đăng ký?
                      </span>
                      <button
                        onClick={() => removeEvent(e.id)}
                        disabled={busyId === e.id}
                        className="hex-btn hex-btn-ghost hex-btn-danger"
                      >
                        {busyId === e.id ? "Đang xoá…" : "Xoá thật"}
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId("")}
                        className="hex-btn hex-btn-ghost"
                      >
                        Huỷ
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(e.id)}
                      className="hex-btn hex-btn-ghost hex-btn-danger"
                      title="Xoá sự kiện"
                    >
                      Xoá
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

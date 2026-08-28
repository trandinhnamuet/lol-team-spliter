"use client";

import { use, useCallback, useEffect, useState } from "react";
import TeamResults from "@/components/TeamResults";
import type { ResolvedPlayer, TeamResult, TournamentEvent } from "@/lib/types";

export default function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [event, setEvent] = useState<TournamentEvent | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);
  const [splitting, setSplitting] = useState(false);
  const [error, setError] = useState("");
  const [failed, setFailed] = useState<ResolvedPlayer[]>([]);
  const [result, setResult] = useState<TeamResult | null>(null);
  const [registerUrl, setRegisterUrl] = useState("");

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/events/${id}`, { cache: "no-store" });
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      const data = await res.json();
      setEvent(data.event);
    } catch {
      /* giữ dữ liệu cũ, thử lại lần sau */
    }
  }, [id]);

  useEffect(() => {
    setRegisterUrl(`${window.location.origin}/register/${id}`);
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [id, refresh]);

  async function copyLink() {
    await navigator.clipboard.writeText(registerUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function toggleOpen() {
    if (!event) return;
    const res = await fetch(`/api/events/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ open: !event.open }),
    });
    if (res.ok) setEvent((await res.json()).event);
  }

  async function removePlayer(puuid: string) {
    const res = await fetch(`/api/events/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ removePuuid: puuid }),
    });
    if (res.ok) setEvent((await res.json()).event);
  }

  async function split() {
    setSplitting(true);
    setError("");
    setResult(null);
    setFailed([]);
    try {
      const res = await fetch("/api/split", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Có lỗi xảy ra");
        return;
      }
      setResult(data.result);
      setFailed(data.failed ?? []);
    } catch {
      setError("Lỗi kết nối server");
    } finally {
      setSplitting(false);
    }
  }

  if (notFound) {
    return <p className="text-red-400">Không tìm thấy sự kiện này.</p>;
  }
  if (!event) {
    return <p className="text-zinc-400">Đang tải…</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{event.name}</h1>
        <p className="text-sm text-zinc-500">
          Tạo lúc {new Date(event.createdAt).toLocaleString("vi-VN")} ·{" "}
          {event.open ? (
            <span className="text-emerald-400">Đang mở đăng ký</span>
          ) : (
            <span className="text-red-400">Đã đóng đăng ký</span>
          )}
        </p>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
        <p className="mb-2 text-sm font-medium text-zinc-300">Link đăng ký (gửi cho game thủ):</p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded bg-zinc-950 px-3 py-1.5 text-sm text-blue-300">
            {registerUrl || "…"}
          </code>
          <button
            onClick={copyLink}
            className="rounded border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800"
          >
            {copied ? "✓ Đã copy" : "Copy link"}
          </button>
          <button
            onClick={toggleOpen}
            className="rounded border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800"
          >
            {event.open ? "Đóng đăng ký" : "Mở lại đăng ký"}
          </button>
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            Đã đăng ký: {event.players.length} người
            <span className="ml-2 text-sm font-normal text-zinc-500">(tự làm mới mỗi 5 giây)</span>
          </h2>
          <button
            onClick={split}
            disabled={splitting || event.players.length < 2}
            className="rounded-lg bg-blue-600 px-5 py-2 font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {splitting ? "Đang tra rank & chia team…" : "Lấy rank & chia team"}
          </button>
        </div>
        {event.players.length === 0 ? (
          <p className="text-sm text-zinc-500">Chưa có ai đăng ký.</p>
        ) : (
          <ul className="divide-y divide-zinc-800 rounded-lg border border-zinc-800 bg-zinc-900">
            {event.players.map((p) => (
              <li key={p.puuid} className="flex items-center gap-3 px-4 py-2 text-sm">
                <span className="font-medium">{p.riotId}</span>
                {p.displayName && <span className="text-zinc-500">({p.displayName})</span>}
                <span className="ml-auto text-xs text-zinc-600">
                  {new Date(p.registeredAt).toLocaleTimeString("vi-VN")}
                </span>
                <button
                  onClick={() => removePlayer(p.puuid)}
                  className="rounded px-2 py-0.5 text-xs text-red-400 hover:bg-red-950"
                  title="Xoá khỏi danh sách"
                >
                  Xoá
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {failed.length > 0 && (
        <div className="rounded-lg border border-red-900/60 bg-red-950/30 p-3 text-sm">
          <p className="mb-1 font-medium text-red-300">Không xử lý được {failed.length} người:</p>
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
  );
}

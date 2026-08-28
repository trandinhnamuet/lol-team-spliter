"use client";

import { use, useEffect, useRef, useState } from "react";
import type { TournamentEvent } from "@/lib/types";

type CheckState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "valid"; riotId: string }
  | { kind: "invalid"; message: string };

export default function RegisterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [event, setEvent] = useState<TournamentEvent | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [riotId, setRiotId] = useState("");
  const [check, setCheck] = useState<CheckState>({ kind: "idle" });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch(`/api/events/${id}`, { cache: "no-store" })
      .then(async (res) => {
        if (res.status === 404) setNotFound(true);
        else setEvent((await res.json()).event);
      })
      .catch(() => setNotFound(true));
  }, [id]);

  // Kiểm tra tồn tại in-game qua Riot API (debounce 600ms sau khi gõ xong)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const value = riotId.trim();
    if (!value) {
      setCheck({ kind: "idle" });
      return;
    }
    if (!value.includes("#")) {
      setCheck({ kind: "invalid", message: "Nhập dạng Tên#TAG (ví dụ: Faker#KR1)" });
      return;
    }
    setCheck({ kind: "checking" });
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ riotId: value }),
        });
        const data = await res.json();
        if (data.valid) {
          setCheck({ kind: "valid", riotId: `${data.gameName}#${data.tagLine}` });
        } else {
          setCheck({ kind: "invalid", message: data.error ?? "Không tìm thấy tài khoản" });
        }
      } catch {
        setCheck({ kind: "invalid", message: "Lỗi kết nối, thử lại sau" });
      }
    }, 600);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [riotId]);

  async function submit() {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/events/${id}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ riotId: riotId.trim(), displayName: displayName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Đăng ký thất bại");
        return;
      }
      setDone(data.player.riotId);
    } catch {
      setError("Lỗi kết nối server");
    } finally {
      setSubmitting(false);
    }
  }

  if (notFound) return <p className="text-red-400">Link đăng ký không tồn tại.</p>;
  if (!event) return <p className="text-zinc-400">Đang tải…</p>;

  if (done) {
    return (
      <div className="mx-auto max-w-md rounded-lg border border-emerald-800 bg-emerald-950/30 p-6 text-center">
        <p className="text-3xl">✅</p>
        <h1 className="mt-2 text-xl font-bold text-emerald-300">Đăng ký thành công!</h1>
        <p className="mt-1 text-zinc-300">
          Tài khoản <span className="font-semibold">{done}</span> đã được ghi danh vào{" "}
          <span className="font-semibold">{event.name}</span>.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Đăng ký thi đấu</h1>
        <p className="mt-1 text-zinc-400">
          Sự kiện: <span className="font-semibold text-zinc-200">{event.name}</span>
        </p>
      </div>

      {!event.open ? (
        <p className="rounded-lg border border-red-900 bg-red-950/30 p-4 text-red-300">
          Sự kiện đã đóng đăng ký.
        </p>
      ) : (
        <div className="space-y-4 rounded-lg border border-zinc-800 bg-zinc-900 p-5">
          <div>
            <label className="mb-1 block text-sm text-zinc-400">Tên hiển thị (tuỳ chọn)</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={50}
              placeholder="Tên thật / biệt danh"
              className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-zinc-400">
              Tên in-game (Riot ID) <span className="text-red-400">*</span>
            </label>
            <input
              value={riotId}
              onChange={(e) => setRiotId(e.target.value)}
              placeholder="Tên#TAG (ví dụ: Faker#KR1)"
              className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
            <p className="mt-1 min-h-5 text-xs">
              {check.kind === "checking" && (
                <span className="text-zinc-400">Đang kiểm tra tài khoản…</span>
              )}
              {check.kind === "valid" && (
                <span className="text-emerald-400">✓ Tìm thấy tài khoản {check.riotId}</span>
              )}
              {check.kind === "invalid" && <span className="text-red-400">✗ {check.message}</span>}
            </p>
          </div>
          <button
            onClick={submit}
            disabled={submitting || check.kind !== "valid"}
            className="w-full rounded-lg bg-blue-600 py-2.5 font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {submitting ? "Đang đăng ký…" : "Đăng ký"}
          </button>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
      )}
    </div>
  );
}

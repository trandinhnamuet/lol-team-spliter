"use client";

import { use, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
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

  if (notFound) return <p className="text-hex-red-400">Link đăng ký không tồn tại.</p>;
  if (!event)
    return (
      <p className="flex items-center gap-2 text-hex-frame-500">
        <span className="hex-spinner" />
        Đang tải…
      </p>
    );

  if (done) {
    return (
      <div className="hex-panel hex-panel-corners hex-fade-item mx-auto max-w-md p-8 text-center" style={{ animation: "hex-fade-up 0.5s cubic-bezier(0.16,1,0.3,1) both, hex-glow-pulse 2.4s ease-in-out infinite 0.5s" }}>
        <span className="mx-auto flex h-14 w-14 items-center justify-center text-3xl text-hex-cyan-400" style={{ filter: "drop-shadow(0 0 12px rgba(10,200,185,0.8))" }}>
          ⬡
        </span>
        <h1 className="mt-3 font-serif text-2xl font-semibold text-hex-gold-100">Đăng ký thành công!</h1>
        <div className="hex-divider" />
        <p className="text-hex-gold-100/80">
          Tài khoản <span className="font-semibold text-hex-cyan-400">{done}</span> đã được ghi danh vào{" "}
          <span className="font-semibold text-hex-gold-200">{event.name}</span>.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-5">
      <div className="hex-fade-item">
        <p className="font-display text-xs uppercase tracking-[0.25em] text-hex-cyan-400">Ghi danh</p>
        <h1 className="mt-1 font-serif text-2xl font-semibold text-hex-gold-100">Đăng ký thi đấu</h1>
        <p className="mt-1 text-hex-frame-500">
          Sự kiện: <span className="font-semibold text-hex-gold-200">{event.name}</span>
        </p>
      </div>

      {!event.open ? (
        <p className="hex-fade-item rounded-sm border border-hex-red-500/60 bg-hex-red-500/10 p-4 text-hex-red-400">
          Sự kiện đã đóng đăng ký.
        </p>
      ) : (
        <div className="hex-panel hex-fade-item space-y-4 p-5">
          <div>
            <label className="mb-1 block text-sm text-hex-frame-500">Tên hiển thị (tuỳ chọn)</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={50}
              placeholder="Tên thật / biệt danh"
              className="hex-input rounded-sm px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-hex-frame-500">
              Tên in-game (Riot ID) <span className="text-hex-red-400">*</span>
            </label>
            <input
              value={riotId}
              onChange={(e) => setRiotId(e.target.value)}
              placeholder="Tên#TAG (ví dụ: Faker#KR1)"
              className="hex-input rounded-sm px-3 py-2 text-sm"
            />
            <p className="mt-1 flex min-h-5 items-center gap-1.5 text-xs">
              {check.kind === "checking" && (
                <span className="flex items-center gap-1.5 text-hex-frame-500">
                  <span className="hex-spinner" style={{ "--size": "12px" } as CSSProperties} />
                  Đang kiểm tra tài khoản…
                </span>
              )}
              {check.kind === "valid" && (
                <span className="text-hex-green-400">✓ Tìm thấy tài khoản {check.riotId}</span>
              )}
              {check.kind === "invalid" && <span className="text-hex-red-400">✗ {check.message}</span>}
            </p>
          </div>
          <button
            onClick={submit}
            disabled={submitting || check.kind !== "valid"}
            className="hex-btn hex-btn-primary w-full"
          >
            {submitting ? "Đang đăng ký…" : "Đăng ký"}
          </button>
          {error && <p className="text-sm text-hex-red-400">{error}</p>}
        </div>
      )}
    </div>
  );
}

"use client";

import { use, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import HexCorners from "@/components/hex/HexCorners";
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
  function handleRiotIdChange(raw: string) {
    setRiotId(raw);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const value = raw.trim();
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
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

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

  if (notFound) return <p className="text-blood-300">Link đăng ký không tồn tại.</p>;
  if (!event)
    return (
      <p className="flex items-center gap-2.5 text-steel-100">
        <span className="hex-spinner" />
        Đang tải…
      </p>
    );

  if (done) {
    return (
      <div className="hex-panel hex-success-panel relative mx-auto max-w-md p-10 text-center">
        <HexCorners />
        <svg
          className="hex-success-glyph mx-auto"
          width="72"
          height="72"
          viewBox="0 0 100 100"
          fill="none"
          aria-hidden="true"
        >
          <polygon points="50,3 91,26 91,74 50,97 9,74 9,26" stroke="#C8AA6E" strokeWidth="4" />
          <polygon points="50,16 80,33 80,67 50,84 20,67 20,33" stroke="#463714" strokeWidth="2" />
          <path
            d="M35 51 L46 62 L67 39"
            stroke="#0AC8B9"
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <h1 className="mt-4 font-display text-xl font-bold uppercase tracking-[0.14em] text-gold-100 [text-shadow:0_0_16px_rgba(200,170,110,0.5)]">
          Đăng ký thành công
        </h1>
        <div className="hex-divider" />
        <p className="leading-relaxed text-gold-100/85">
          Tài khoản <span className="font-semibold text-magic-300">{done}</span> đã được ghi danh
          vào <span className="font-semibold text-gold-200">{event.name}</span>.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="hex-reveal text-center">
        <p className="hex-kicker">Ghi danh</p>
        <h1 className="hex-h1 mt-1.5">Đăng ký thi đấu</h1>
        <p className="mt-2 text-steel-100">
          Sự kiện: <span className="font-semibold text-gold-200">{event.name}</span>
        </p>
      </div>

      {!event.open ? (
        <p className="hex-alert hex-reveal p-4 text-blood-300">Sự kiện đã đóng đăng ký.</p>
      ) : (
        <div className="hex-panel hex-reveal relative space-y-4 p-6" style={{ animationDelay: "100ms" }}>
          <HexCorners />
          <div>
            <label className="mb-1.5 block font-display text-[0.62rem] font-bold uppercase tracking-[0.2em] text-gold-200">
              Tên hiển thị (tuỳ chọn)
            </label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={50}
              placeholder="Tên thật / biệt danh"
              className="hex-input px-3 py-2.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1.5 block font-display text-[0.62rem] font-bold uppercase tracking-[0.2em] text-gold-200">
              Tên in-game (Riot ID) <span className="text-blood-400">*</span>
            </label>
            <input
              value={riotId}
              onChange={(e) => handleRiotIdChange(e.target.value)}
              placeholder="Tên#TAG (ví dụ: Faker#KR1)"
              className="hex-input px-3 py-2.5 text-sm"
            />
            <p className="mt-1.5 flex min-h-5 items-center gap-1.5 text-xs">
              {check.kind === "checking" && (
                <span className="flex items-center gap-1.5 text-steel-100">
                  <span className="hex-spinner" style={{ "--size": "12px" } as CSSProperties} />
                  Đang kiểm tra tài khoản…
                </span>
              )}
              {check.kind === "valid" && (
                <span className="text-magic-300">✓ Tìm thấy tài khoản {check.riotId}</span>
              )}
              {check.kind === "invalid" && <span className="text-blood-300">✗ {check.message}</span>}
            </p>
          </div>
          <button
            onClick={submit}
            disabled={submitting || check.kind !== "valid"}
            className="hex-btn hex-btn-magic w-full"
          >
            {submitting ? (
              <>
                <span className="hex-spinner" style={{ "--size": "15px" } as CSSProperties} />
                Đang đăng ký…
              </>
            ) : (
              "⬡ Đăng ký"
            )}
          </button>
          {error && <p className="text-sm text-blood-300">{error}</p>}
        </div>
      )}
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import HexCorners from "@/components/hex/HexCorners";
import TeamSizeInput, { parseTeamSize } from "@/components/hex/TeamSizeInput";
import { getStoredRegion } from "@/lib/region";
import { opggUrl } from "@/lib/riot";
import { startSplit } from "@/lib/split-client";
import type { TournamentEvent } from "@/lib/types";

export default function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [event, setEvent] = useState<TournamentEvent | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);
  const [platform, setPlatform] = useState("vn2");
  const [teamSize, setTeamSize] = useState("5");
  const [splitting, setSplitting] = useState(false);
  const [error, setError] = useState("");
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
    // đặt URL + fetch qua microtask để không setState đồng bộ trong effect
    void Promise.resolve().then(() => {
      setRegisterUrl(`${window.location.origin}/register/${id}`);
      return refresh();
    });
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [id, refresh]);

  useEffect(() => {
    setPlatform(getStoredRegion());
  }, []);

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

  /** Khởi động lượt chia rồi chuyển sang /split/[id] — job chạy trên server, đóng tab vẫn xong. */
  async function split() {
    setSplitting(true);
    setError("");
    const { id: jobId, error: err } = await startSplit({
      eventId: id,
      teamSize: parseTeamSize(teamSize) ?? 5,
      platform: getStoredRegion(),
    });
    if (!jobId) {
      setError(err ?? "Có lỗi xảy ra");
      setSplitting(false);
      return;
    }
    router.push(`/split/${jobId}`);
  }

  if (notFound) {
    return <p className="text-blood-300">Không tìm thấy sự kiện này.</p>;
  }
  if (!event) {
    return (
      <p className="flex items-center gap-2.5 text-steel-100">
        <span className="hex-spinner" />
        Đang tải…
      </p>
    );
  }

  return (
    <div className="space-y-7">
      <div className="hex-reveal">
        <p className="hex-kicker">Sự kiện</p>
        <h1 className="hex-h1 mt-1.5">{event.name}</h1>
        <p className="mt-2 text-sm text-steel-100">
          Tạo lúc {new Date(event.createdAt).toLocaleString("vi-VN")} ·{" "}
          {event.open ? (
            <span className="text-magic-300">Đang mở đăng ký</span>
          ) : (
            <span className="text-blood-300">Đã đóng đăng ký</span>
          )}
        </p>
      </div>

      <div className="hex-panel hex-reveal relative p-4" style={{ animationDelay: "80ms" }}>
        <HexCorners />
        <p className="mb-2.5 font-display text-[0.62rem] font-bold uppercase tracking-[0.2em] text-gold-200">
          Link đăng ký — gửi cho game thủ
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="hex-code min-w-0 flex-1 basis-64 truncate">{registerUrl || "…"}</code>
          <button onClick={copyLink} className="hex-btn">
            {copied ? <span className="text-magic-300">✓ Đã copy</span> : "Copy link"}
          </button>
          <button
            onClick={toggleOpen}
            className="hex-btn"
            title={
              event.open
                ? "Chốt sổ — không cho đăng ký thêm"
                : "Cho phép game thủ đăng ký tiếp"
            }
          >
            {event.open ? "Chốt sổ / Đóng đăng ký" : "Mở lại đăng ký"}
          </button>
        </div>
      </div>

      <div className="hex-reveal space-y-3" style={{ animationDelay: "140ms" }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="hex-section-title flex-1">
            Đã đăng ký: {event.players.length} người
            <span className="font-sans text-[0.6rem] font-normal normal-case tracking-normal text-steel-300">
              (tự làm mới mỗi 5 giây)
            </span>
          </h2>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <TeamSizeInput value={teamSize} onChange={setTeamSize} />
            <button
              onClick={split}
              disabled={splitting || event.players.length < 2 || parseTeamSize(teamSize) === null}
              className="hex-btn hex-btn-magic"
            >
              {splitting ? (
                <>
                  <span className="hex-spinner" style={{ "--size": "15px" } as CSSProperties} />
                  Đang khởi động…
                </>
              ) : (
                "⬡ Lấy rank & chia team"
              )}
            </button>
          </div>
        </div>
        {parseTeamSize(teamSize) === null && (
          <p className="text-xs text-blood-300">Số người mỗi team phải từ 1 đến 20.</p>
        )}
        {error && <p className="text-sm text-blood-300">{error}</p>}

        {event.players.length === 0 ? (
          <p className="text-sm text-steel-100">Chưa có ai đăng ký.</p>
        ) : (
          <ul className="hex-panel relative divide-y divide-steel-700/60">
            <HexCorners />
            {event.players.map((p) => (
              <li key={p.puuid} className="hex-player-row flex items-center gap-3 px-4 py-2.5 text-sm">
                <a
                  href={opggUrl(p.gameName, p.tagLine, platform)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`Xem ${p.riotId} trên op.gg`}
                  className="font-medium text-gold-100 underline decoration-gold-600/60 underline-offset-2 hover:text-magic-300 hover:decoration-magic-300"
                >
                  {p.riotId}
                </a>
                {p.displayName && <span className="text-steel-100">({p.displayName})</span>}
                <span className="ml-auto font-mono text-xs text-steel-300">
                  {new Date(p.registeredAt).toLocaleTimeString("vi-VN")}
                </span>
                <button
                  onClick={() => removePlayer(p.puuid)}
                  className="hex-btn hex-btn-ghost hex-btn-danger"
                  title="Xoá khỏi danh sách"
                >
                  Xoá
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import HexCorners from "@/components/hex/HexCorners";
import { playSound } from "@/lib/sounds";

type Phase = "enter" | "accepted" | "leave";

const ACCEPT_HOLD_MS = 2000; // nút tối đi bấy nhiêu lâu trước khi đóng (như client LMHT)
const LEAVE_MS = 380; // khớp với animation hex-mf-panel-out / hex-mf-fade-out

/**
 * Popup "Hoàn thành chia team" kiểu màn "Đã tìm thấy trận" của client LMHT.
 * Mount khi cần hiện (cha render có điều kiện) — mỗi lần mount phát âm thanh tìm thấy trận.
 * Bấm "Xem kết quả": phát tiếng chấp nhận (qua data-sound), nút tối đi 2s, rồi panel trượt
 * ra, gọi onView() (cha cuộn tới kết quả) và onClose() sau khi animation kết thúc.
 */
export default function MatchFoundModal({
  title = "Hoàn thành chia team",
  subtitle,
  onView,
  onClose,
}: {
  title?: string;
  subtitle?: string;
  onView: () => void;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("enter");
  const timers = useRef<number[]>([]);

  useEffect(() => {
    playSound("match-found");
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  function accept() {
    if (phase !== "enter") return;
    setPhase("accepted");
    timers.current.push(
      window.setTimeout(() => {
        setPhase("leave");
        onView();
        timers.current.push(window.setTimeout(onClose, LEAVE_MS));
      }, ACCEPT_HOLD_MS)
    );
  }

  const accepted = phase !== "enter";

  return (
    <div
      className={`hex-mf-overlay${phase === "leave" ? " is-leaving" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="hex-mf-title"
    >
      <div className="hex-mf-flash" aria-hidden="true" />
      <div className="hex-mf-panel">
        <HexCorners />
        <div className="hex-mf-rings" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <p className="hex-mf-kicker">Hextech Draft</p>
        <h2 id="hex-mf-title" className="hex-mf-title">
          {title}
        </h2>
        {subtitle && <p className="hex-mf-sub">{subtitle}</p>}
        <button
          type="button"
          className="hex-mf-accept"
          data-sound="accept"
          data-accepted={accepted ? "true" : "false"}
          aria-disabled={accepted}
          onClick={accept}
        >
          {accepted ? "Đã xác nhận" : "Xem kết quả"}
        </button>
      </div>
    </div>
  );
}

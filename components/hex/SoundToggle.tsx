"use client";

import { useSyncExternalStore } from "react";
import { isMuted, playSound, setMuted, subscribeMuted } from "@/lib/sounds";

/** Nút tắt/bật âm thanh giao diện — trạng thái lưu localStorage. */
export default function SoundToggle() {
  const muted = useSyncExternalStore(subscribeMuted, isMuted, () => false);

  function toggle() {
    const next = !muted;
    setMuted(next);
    if (!next) playSound("click"); // xác nhận đã có tiếng lại
  }

  return (
    <button
      type="button"
      onClick={toggle}
      data-sound="none"
      className="hex-btn hex-btn-ghost px-2.5"
      title={muted ? "Bật âm thanh giao diện" : "Tắt âm thanh giao diện"}
      aria-label={muted ? "Bật âm thanh giao diện" : "Tắt âm thanh giao diện"}
      aria-pressed={!muted}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M11 5 6 9H2v6h4l5 4V5z" />
        {muted ? (
          <>
            <line x1="23" y1="9" x2="17" y2="15" />
            <line x1="17" y1="9" x2="23" y2="15" />
          </>
        ) : (
          <>
            <path d="M15.5 8.5a5 5 0 0 1 0 7" />
            <path d="M19 5a10 10 0 0 1 0 14" />
          </>
        )}
      </svg>
    </button>
  );
}

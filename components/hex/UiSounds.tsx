"use client";

import { useEffect } from "react";
import { playSound, warmAudio, type SoundName } from "@/lib/sounds";

/**
 * Gắn âm thanh hover/click cho MỌI phần tử tương tác trong app bằng listener ở document,
 * không cần sửa từng nút. Tuỳ biến bằng data-attribute trên phần tử:
 *   data-sound="accept" | "none"        — âm thanh khi click (mặc định "click")
 *   data-sound-hover="none"             — tắt tiếng hover cho phần tử đó
 *   data-sounds-off (trên tổ tiên)      — tắt toàn bộ trong vùng
 */
const INTERACTIVE =
  'button, a[href], [role="button"], select, input[type="checkbox"], input[type="radio"]';

function interactiveOf(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const el = target.closest<HTMLElement>(INTERACTIVE);
  if (!el || el.closest("[data-sounds-off]")) return null;
  if ((el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true") return null;
  return el;
}

function soundFor(el: HTMLElement, attr: string, fallback: SoundName): SoundName | null {
  const v = el.getAttribute(attr);
  if (v === "none") return null;
  return (v as SoundName | null) || fallback;
}

export default function UiSounds() {
  useEffect(() => {
    // Thiết bị cảm ứng không có hover thật — bỏ tiếng hover để khỏi kêu 2 lần khi chạm
    const canHover = window.matchMedia?.("(hover: hover)").matches ?? true;
    let current: HTMLElement | null = null;

    const onOver = (e: PointerEvent) => {
      if (!canHover) return;
      const el = interactiveOf(e.target);
      if (!el) {
        current = null;
        return;
      }
      if (el === current) return; // vẫn đang trong cùng một nút
      current = el;
      const s = soundFor(el, "data-sound-hover", "hover");
      if (s) playSound(s);
    };
    const onClick = (e: MouseEvent) => {
      const el = interactiveOf(e.target);
      if (!el) return;
      const s = soundFor(el, "data-sound", "click");
      if (s) playSound(s);
    };
    const onWarm = () => warmAudio();

    document.addEventListener("pointerover", onOver, { passive: true });
    // capture để vẫn kêu dù handler của nút có stopPropagation
    document.addEventListener("click", onClick, true);
    document.addEventListener("pointerdown", onWarm, { passive: true, capture: true });
    document.addEventListener("keydown", onWarm, { passive: true, capture: true });
    return () => {
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("pointerdown", onWarm, true);
      document.removeEventListener("keydown", onWarm, true);
    };
  }, []);
  return null;
}

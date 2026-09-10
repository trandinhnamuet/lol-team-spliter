"use client";

import { useEffect, useRef, useState } from "react";

interface Track {
  file: string;
  title: string;
}

const VOLUME = 0.29; // tăng 30% so với mặc định 0.22
const PREF_KEY = "hex-music-off"; // người dùng đã tắt nhạc thì lần sau không tự phát

function readPref(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) === "1";
  } catch {
    return false;
  }
}

function pickRandom(tracks: Track[], exclude?: string): Track | null {
  if (tracks.length === 0) return null;
  const pool = tracks.length > 1 ? tracks.filter((t) => t.file !== exclude) : tracks;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Nhạc nền: vào web tự chọn ngẫu nhiên 1 bản trong public/music-theme (qua /api/music) và BẮT ĐẦU
 * CHẠY NGAY, không chờ bấm nút.
 *
 * Giới hạn nền tảng (không có cách lách): mọi trình duyệt chặn autoplay CÓ TIẾNG trước khi trang có
 * bất kỳ tương tác nào — Chrome còn chủ động tạm dừng nếu code tự ý gọi `muted = false` mà không
 * kèm cử chỉ. Chỉ "autoplay câm tiếng" là luôn được phép. Nên chiến lược ở đây:
 *   1. Thử phát CÓ TIẾNG ngay khi có track — nếu trình duyệt đã tin tưởng site này (từng nghe nhiều
 *      lần, đã cài PWA...) thì thành công luôn, không cần chạm gì cả.
 *   2. Thất bại thì phát CÂM TIẾNG ngay lập tức (luôn thành công) — nhạc đã chạy thật, chỉ chưa có
 *      âm thanh — rồi tự bỏ câm ngay ở cử chỉ đầu tiên (pointerdown/keydown) bất kỳ đâu trên trang,
 *      không cần đúng vào nút nhạc. Việc bỏ câm này chạy trực tiếp trong tay cầm sự kiện của cử chỉ
 *      nên trình duyệt luôn cho phép.
 * Độc lập với nút loa hiệu ứng UI (SoundToggle) — có nút ♪ riêng để dừng/bật nhạc, trạng thái tắt
 * được nhớ trong trình duyệt.
 */
export default function MusicPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const tracksRef = useRef<Track[]>([]);
  const [track, setTrack] = useState<Track | null>(null);
  // readPref() an toàn trên server (localStorage không tồn tại -> catch -> false); không gây lệch
  // hydration vì component trả null cho tới khi track được nạp (chỉ xảy ra ở client).
  const [off, setOff] = useState(readPref);
  const [playing, setPlaying] = useState(false); // audio đang chạy (có thể đang câm tiếng)
  const [silent, setSilent] = useState(true); // audio.muted hiện tại

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";
    audio.volume = VOLUME;
    audioRef.current = audio;
    let disposed = false;
    let userOff = readPref();
    let unlocked = false; // đã từng có tiếng thật trong phiên này — khỏi câm lại các bài sau
    let currentFile: string | undefined; // bài đang phát — loại khỏi lượt bốc kế tiếp khi hết bài

    const tryPlay = () => {
      if (disposed || userOff) return;
      audio.play().catch(() => {
        /* vẫn bị chặn kể cả câm tiếng (rất hiếm) — cử chỉ kế tiếp sẽ thử lại qua unmuteNow */
      });
    };
    /** Bỏ câm + đảm bảo đang chạy — CHỈ gọi trực tiếp trong tay cầm sự kiện của một cử chỉ thật
     *  (click/keydown), nếu không trình duyệt sẽ tự tạm dừng thay vì bỏ câm. */
    const unmuteNow = () => {
      if (disposed || userOff) return;
      unlocked = true;
      if (audio.muted) audio.muted = false;
      if (audio.paused) tryPlay();
    };
    const startTrack = (t: Track | null) => {
      if (!t || disposed) return;
      currentFile = t.file;
      setTrack(t);
      // public/music-theme được Next.js phục vụ tĩnh trực tiếp tại /music-theme/<file>
      audio.src = `/music-theme/${encodeURIComponent(t.file)}`;
      if (unlocked) {
        tryPlay(); // đã có tiếng thật trong phiên này — cứ phát thẳng, trình duyệt đã tin
        return;
      }
      // Chưa từng mở khoá: thử có tiếng trước (thành công ngay nếu trình duyệt đã tin site này),
      // thất bại thì lùi về câm tiếng (luôn được phép) và chờ cử chỉ đầu tiên để bỏ câm.
      audio.muted = false;
      audio
        .play()
        .then(() => {
          if (disposed) return;
          unlocked = true;
          // audio.muted không đổi giá trị (vốn đã là false) nên sự kiện volumechange không bắn ra —
          // set tường minh để UI không kẹt ở nhãn "im lặng" trong lúc thực ra đã có tiếng thật.
          setSilent(false);
        })
        .catch(() => {
          if (disposed) return;
          audio.muted = true;
          tryPlay();
        });
    };
    const onGesture = (e: Event) => {
      // Bỏ qua cử chỉ trên chính nút ♪ — nút tự lo việc bỏ câm/phát qua toggle() bên dưới;
      // nếu không loại trừ, pointerdown (chạy trước click) sẽ tranh chấp với toggle() trong
      // cùng một lượt bấm.
      const target = e.target;
      if (target instanceof Node && buttonRef.current?.contains(target)) return;
      if (!userOff && (audio.muted || audio.paused)) unmuteNow();
    };
    const onEnded = () => startTrack(pickRandom(tracksRef.current, currentFile));

    audio.addEventListener("ended", onEnded);
    audio.addEventListener("pause", () => setPlaying(false));
    audio.addEventListener("play", () => setPlaying(true));
    audio.addEventListener("volumechange", () => setSilent(audio.muted));
    document.addEventListener("pointerdown", onGesture, { capture: true, passive: true });
    document.addEventListener("keydown", onGesture, { capture: true, passive: true });

    fetch("/api/music", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { tracks: [] }))
      .then((d: { tracks?: Track[] }) => {
        if (disposed) return;
        tracksRef.current = d.tracks ?? [];
        startTrack(pickRandom(tracksRef.current));
      })
      .catch(() => {});

    // cho nút ♪ đổi trạng thái mà không phải khai lại các closure
    (audio as HTMLAudioElement & { __apply?: (off: boolean) => void }).__apply = (v: boolean) => {
      userOff = v;
      if (v) audio.pause();
      else unmuteNow();
    };

    return () => {
      disposed = true;
      audio.pause();
      audio.removeEventListener("ended", onEnded);
      document.removeEventListener("pointerdown", onGesture, true);
      document.removeEventListener("keydown", onGesture, true);
    };
  }, []);

  function toggle() {
    // off=true -> bật lại. Đang phát nhưng CÂM TIẾNG (silent) -> bấm này chính là cử chỉ mở khoá,
    // chỉ cần bỏ câm chứ đừng lật thành tắt hẳn. Chỉ khi đang phát CÓ TIẾNG thật mới coi bấm là tắt.
    const next = off ? false : silent ? false : true;
    setOff(next);
    try {
      localStorage.setItem(PREF_KEY, next ? "1" : "0");
    } catch {
      /* bỏ qua */
    }
    (audioRef.current as (HTMLAudioElement & { __apply?: (off: boolean) => void }) | null)?.__apply?.(next);
  }

  if (!track) return null;
  const audible = playing && !silent && !off;
  const label = off
    ? "Bật nhạc nền"
    : silent
      ? `Đang phát (im lặng) — bấm để nghe: ${track.title}`
      : `Đang phát: ${track.title} — bấm để tắt`;

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={toggle}
      className={`hex-btn hex-btn-ghost max-w-[240px] gap-2 px-2.5 ${off ? "opacity-70" : ""}`}
      title={label}
      aria-label={label}
      aria-pressed={!off}
    >
      <span className={`hex-music-note ${audible ? "is-playing" : ""}`} aria-hidden="true">
        ♪
      </span>
      <span className="truncate font-sans text-[0.62rem] normal-case tracking-normal text-steel-100">
        {off ? "Nhạc: tắt" : silent ? "Chạm để nghe nhạc" : track.title}
      </span>
    </button>
  );
}

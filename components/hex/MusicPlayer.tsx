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
 * Nhạc nền: vào web tự chọn ngẫu nhiên 1 bản trong public/music-theme (qua /api/music), hết bài
 * thì đổi bài khác. Trình duyệt chặn autoplay có tiếng tới khi người dùng chạm trang, nên nếu play()
 * bị từ chối sẽ chờ pointerdown/keydown đầu tiên rồi phát. Độc lập với nút loa hiệu ứng UI
 * (SoundToggle) — có nút ♪ riêng để dừng/bật nhạc, trạng thái tắt được nhớ trong trình duyệt.
 */
export default function MusicPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const tracksRef = useRef<Track[]>([]);
  const [track, setTrack] = useState<Track | null>(null);
  // readPref() an toàn trên server (localStorage không tồn tại -> catch -> false); không gây lệch
  // hydration vì component trả null cho tới khi track được nạp (chỉ xảy ra ở client).
  const [off, setOff] = useState(readPref);
  const [playing, setPlaying] = useState(false);
  const [blocked, setBlocked] = useState(false); // autoplay bị chặn, chờ tương tác

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";
    audio.volume = VOLUME;
    audioRef.current = audio;
    let disposed = false;
    let userOff = readPref();

    const tryPlay = () => {
      if (disposed || userOff) return;
      audio
        .play()
        .then(() => {
          setBlocked(false);
          setPlaying(true);
        })
        .catch(() => setBlocked(true)); // autoplay policy — chờ tương tác đầu tiên
    };
    const startTrack = (t: Track | null) => {
      if (!t) return;
      setTrack(t);
      // public/music-theme được Next.js phục vụ tĩnh trực tiếp tại /music-theme/<file>
      audio.src = `/music-theme/${encodeURIComponent(t.file)}`;
      tryPlay();
    };
    const onGesture = (e: Event) => {
      // Bỏ qua cử chỉ trên chính nút ♪ — nút tự lo việc phát/dừng qua toggle() bên dưới;
      // nếu không loại trừ, pointerdown (chạy trước click) sẽ tranh chấp với toggle() trong
      // cùng một lượt bấm (vừa mở khoá phát vừa bị toggle tắt ngay sau đó).
      const target = e.target;
      if (target instanceof Node && buttonRef.current?.contains(target)) return;
      if (audio.paused && !userOff && audio.src) tryPlay();
    };
    const onEnded = () => startTrack(pickRandom(tracksRef.current, track?.file));

    audio.addEventListener("ended", onEnded);
    audio.addEventListener("pause", () => setPlaying(false));
    audio.addEventListener("play", () => setPlaying(true));
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
    (audio as HTMLAudioElement & { __setOff?: (v: boolean) => void }).__setOff = (v: boolean) => {
      userOff = v;
      if (v) audio.pause();
      else tryPlay();
    };

    return () => {
      disposed = true;
      audio.pause();
      audio.removeEventListener("ended", onEnded);
      document.removeEventListener("pointerdown", onGesture, true);
      document.removeEventListener("keydown", onGesture, true);
    };
    // track chỉ dùng trong onEnded để loại bài vừa phát — không cần chạy lại effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle() {
    // off=true -> bật lại. Đang "bật" nhưng chưa thật sự phát (blocked, chờ cử chỉ đầu tiên) ->
    // click này CHÍNH LÀ cử chỉ đó, giữ nguyên trạng thái bật và chỉ thử phát lại, đừng lật thành tắt.
    // Chỉ khi thật sự đang phát mới coi click là yêu cầu tắt.
    const next = off ? false : blocked ? false : true;
    setOff(next);
    try {
      localStorage.setItem(PREF_KEY, next ? "1" : "0");
    } catch {
      /* bỏ qua */
    }
    (audioRef.current as (HTMLAudioElement & { __setOff?: (v: boolean) => void }) | null)?.__setOff?.(next);
  }

  if (!track) return null;
  const label = off
    ? "Bật nhạc nền"
    : blocked && !playing
      ? `Chạm vào trang để phát: ${track.title}`
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
      <span className={`hex-music-note ${playing && !off ? "is-playing" : ""}`} aria-hidden="true">
        ♪
      </span>
      <span className="truncate font-sans text-[0.62rem] normal-case tracking-normal text-steel-100">
        {off ? "Nhạc: tắt" : track.title}
      </span>
    </button>
  );
}

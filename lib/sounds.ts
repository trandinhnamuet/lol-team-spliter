/**
 * Âm thanh giao diện kiểu client LMHT.
 *
 * Mặc định mọi âm thanh được TỔNG HỢP bằng Web Audio API (không dùng file của Riot).
 * Nếu muốn dùng bộ âm thanh riêng, đặt file vào `public/sounds/` với tên:
 *   hover.mp3|ogg · click.mp3|ogg · accept.mp3|ogg · match-found.mp3|ogg
 * File nào có sẽ được ưu tiên tự động, không có thì dùng bản tổng hợp.
 *
 * Tắt/bật tiếng lưu trong localStorage (`hex-sound-muted`).
 */

export type SoundName = "hover" | "click" | "accept" | "match-found";

const STORAGE_KEY = "hex-sound-muted";
const FILE_EXTS = ["mp3", "ogg"] as const;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

let muted = false;
let mutedLoaded = false;
const mutedListeners = new Set<() => void>();

/** Buffer từ file trong public/sounds — null = đã thử và không có, dùng bản tổng hợp. */
const fileBuffers = new Map<SoundName, AudioBuffer | null>();
const filePending = new Set<SoundName>();

function loadMuted() {
  if (mutedLoaded) return;
  mutedLoaded = true;
  try {
    muted = localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    /* localStorage bị chặn — coi như bật tiếng */
  }
}

export function isMuted(): boolean {
  if (typeof window === "undefined") return false;
  loadMuted();
  return muted;
}

export function setMuted(next: boolean) {
  muted = next;
  mutedLoaded = true;
  try {
    localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  } catch {
    /* bỏ qua */
  }
  mutedListeners.forEach((fn) => fn());
}

/** Dùng với useSyncExternalStore. */
export function subscribeMuted(fn: () => void): () => void {
  mutedListeners.add(fn);
  return () => {
    mutedListeners.delete(fn);
  };
}

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  const AC =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);
  return ctx;
}

/** Gọi ở thao tác đầu tiên của người dùng để mở khoá AudioContext (chính sách autoplay). */
export function warmAudio() {
  const c = getCtx();
  if (c && c.state === "suspended") void c.resume().catch(() => {});
}

function loadFile(name: SoundName) {
  const c = getCtx();
  if (!c || fileBuffers.has(name) || filePending.has(name)) return;
  filePending.add(name);
  void (async () => {
    for (const ext of FILE_EXTS) {
      try {
        const res = await fetch(`/sounds/${name}.${ext}`, { cache: "force-cache" });
        const type = res.headers.get("content-type") ?? "";
        // Next trả trang 404 dạng text/html khi không có file → bỏ qua
        if (!res.ok || !type.startsWith("audio")) continue;
        const buf = await c.decodeAudioData(await res.arrayBuffer());
        fileBuffers.set(name, buf);
        filePending.delete(name);
        return;
      } catch {
        /* thử đuôi tiếp theo */
      }
    }
    fileBuffers.set(name, null);
    filePending.delete(name);
  })();
}

// ---------- Bộ tổng hợp ----------

interface ToneOpts {
  type: OscillatorType;
  freq: number;
  /** Trượt tần số tới giá trị này trong thời gian dur (nếu có). */
  freqEnd?: number;
  start: number;
  dur: number;
  gain: number;
  attack?: number;
}

function tone(c: AudioContext, out: AudioNode, o: ToneOpts) {
  const osc = c.createOscillator();
  osc.type = o.type;
  osc.frequency.setValueAtTime(o.freq, o.start);
  if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(o.freqEnd, o.start + o.dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, o.start);
  g.gain.exponentialRampToValueAtTime(o.gain, o.start + (o.attack ?? 0.006));
  g.gain.exponentialRampToValueAtTime(0.0001, o.start + o.dur);
  osc.connect(g).connect(out);
  osc.start(o.start);
  osc.stop(o.start + o.dur + 0.03);
}

interface NoiseOpts {
  start: number;
  dur: number;
  gain: number;
  /** Tần số trung tâm bandpass. */
  freq: number;
  q?: number;
}

let noiseBuffer: AudioBuffer | null = null;
function noise(c: AudioContext, out: AudioNode, o: NoiseOpts) {
  if (!noiseBuffer) {
    noiseBuffer = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const src = c.createBufferSource();
  src.buffer = noiseBuffer;
  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = o.freq;
  filter.Q.value = o.q ?? 1;
  const g = c.createGain();
  g.gain.setValueAtTime(o.gain, o.start);
  g.gain.exponentialRampToValueAtTime(0.0001, o.start + o.dur);
  src.connect(filter).connect(g).connect(out);
  src.start(o.start);
  src.stop(o.start + o.dur + 0.02);
}

const SYNTH: Record<SoundName, (c: AudioContext, out: AudioNode, t: number) => void> = {
  // Tick rất nhẹ khi rê chuột qua nút
  hover(c, out, t) {
    noise(c, out, { start: t, dur: 0.06, gain: 0.05, freq: 3200, q: 1.4 });
    tone(c, out, { type: "sine", freq: 1900, freqEnd: 2400, start: t, dur: 0.055, gain: 0.03 });
  },
  // Click kim loại ngắn, có "đáy" trầm
  click(c, out, t) {
    noise(c, out, { start: t, dur: 0.05, gain: 0.13, freq: 1800, q: 0.9 });
    tone(c, out, { type: "sine", freq: 170, freqEnd: 90, start: t, dur: 0.09, gain: 0.2 });
    tone(c, out, { type: "triangle", freq: 2500, start: t, dur: 0.04, gain: 0.05 });
  },
  // "Cạch" chấp nhận: thùm trầm + vang kim loại
  accept(c, out, t) {
    noise(c, out, { start: t, dur: 0.08, gain: 0.12, freq: 1200, q: 0.8 });
    tone(c, out, { type: "sine", freq: 120, freqEnd: 65, start: t, dur: 0.38, gain: 0.4 });
    tone(c, out, { type: "triangle", freq: 660, start: t + 0.01, dur: 0.32, gain: 0.13 });
    tone(c, out, { type: "sine", freq: 990, start: t + 0.03, dur: 0.55, gain: 0.08 });
  },
  // Tìm thấy trận: trống trầm rồi hợp âm sáng dâng lên (E – B – E' – G#')
  "match-found"(c, out, t) {
    tone(c, out, { type: "sine", freq: 150, freqEnd: 45, start: t, dur: 0.95, gain: 0.5, attack: 0.01 });
    noise(c, out, { start: t, dur: 0.3, gain: 0.16, freq: 420, q: 0.7 });
    tone(c, out, { type: "triangle", freq: 329.63, start: t + 0.08, dur: 1.5, gain: 0.17, attack: 0.02 });
    tone(c, out, { type: "triangle", freq: 493.88, start: t + 0.22, dur: 1.4, gain: 0.15, attack: 0.02 });
    tone(c, out, { type: "sine", freq: 659.25, start: t + 0.36, dur: 1.7, gain: 0.17, attack: 0.02 });
    tone(c, out, { type: "sine", freq: 830.61, start: t + 0.52, dur: 1.9, gain: 0.13, attack: 0.03 });
    tone(c, out, { type: "sine", freq: 2637.02, start: t + 0.55, dur: 1.3, gain: 0.03, attack: 0.05 });
  },
};

const FILE_GAIN: Record<SoundName, number> = {
  hover: 0.35,
  click: 0.6,
  accept: 0.9,
  "match-found": 1,
};

/** Phát một âm thanh UI. An toàn khi gọi trên server / trình duyệt không hỗ trợ (no-op). */
export function playSound(name: SoundName) {
  if (isMuted()) return;
  const c = getCtx();
  if (!c || !master) return;
  if (c.state === "suspended") void c.resume().catch(() => {});

  const buf = fileBuffers.get(name);
  if (buf) {
    const src = c.createBufferSource();
    src.buffer = buf;
    const g = c.createGain();
    g.gain.value = FILE_GAIN[name];
    src.connect(g).connect(master);
    src.start();
    return;
  }
  if (!fileBuffers.has(name)) loadFile(name); // lần đầu: tải nền, lần này dùng bản tổng hợp
  try {
    SYNTH[name](c, master, c.currentTime);
  } catch {
    /* không để lỗi âm thanh làm hỏng UI */
  }
}

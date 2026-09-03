"use client";

import type { SplitProgress } from "@/lib/split-client";

/** Thanh tiến độ tra rank qua Riot API: % + số người đã xong. */
export default function SplitProgressBar({ progress }: { progress: SplitProgress }) {
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  return (
    <div className="hex-reveal space-y-1.5" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="flex items-baseline justify-between">
        <span className="font-display text-[0.62rem] font-bold uppercase tracking-[0.2em] text-magic-300">
          Đang tra rank qua Riot API…
        </span>
        <span className="font-mono text-xs text-gold-200">
          {progress.done}/{progress.total} · {pct}%
        </span>
      </div>
      <div className="hex-progress-track">
        <div className="hex-progress-fill" style={{ width: `${pct}%` }} />
      </div>
      {progress.note && (
        <p className="truncate font-mono text-[0.68rem] text-steel-100">{progress.note}</p>
      )}
    </div>
  );
}

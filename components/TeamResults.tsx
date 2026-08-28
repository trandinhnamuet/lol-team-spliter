"use client";

import type { CSSProperties } from "react";
import { rankLabel } from "@/lib/elo";
import type { ResolvedPlayer, TeamResult } from "@/lib/types";

const TIER_COLORS: Record<string, string> = {
  IRON: "var(--color-tier-iron)",
  BRONZE: "var(--color-tier-bronze)",
  SILVER: "var(--color-tier-silver)",
  GOLD: "var(--color-tier-gold)",
  PLATINUM: "var(--color-tier-platinum)",
  EMERALD: "var(--color-tier-emerald)",
  DIAMOND: "var(--color-tier-diamond)",
  MASTER: "var(--color-tier-master)",
  GRANDMASTER: "var(--color-tier-grandmaster)",
  CHALLENGER: "var(--color-tier-challenger)",
  UNRANKED: "var(--color-hex-frame-500)",
};

function PlayerRow({ p, index }: { p: ResolvedPlayer; index: number }) {
  const tier = p.rank?.tier ?? "UNRANKED";
  return (
    <li
      className="hex-fade-item flex items-center justify-between gap-2 py-1.5"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <span className="truncate text-sm text-hex-gold-100">{p.input}</span>
      <span
        className="hex-badge shrink-0"
        style={{ "--tier-color": TIER_COLORS[tier] ?? "var(--color-hex-frame-500)" } as CSSProperties}
      >
        {rankLabel(p.rank)}
      </span>
      <span className="w-12 shrink-0 text-right font-mono text-xs text-hex-frame-500">{p.elo}</span>
    </li>
  );
}

export default function TeamResults({ result }: { result: TeamResult }) {
  return (
    <div className="hex-fade-item space-y-5">
      <div className="hex-divider" />
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-lg font-semibold uppercase tracking-[0.06em] text-hex-gold-200">
          Kết quả chia team
        </h2>
        <p className="text-sm text-hex-frame-500">
          Chênh lệch elo:{" "}
          <span className="font-mono font-semibold text-hex-gold-100">{result.spread}</span>
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {result.teams.map((team, i) => (
          <div
            key={i}
            className="hex-panel hex-panel-corners hex-panel-glow hex-fade-item relative p-4"
            style={{ animationDelay: `${i * 90}ms` }}
          >
            <div className="mb-3 flex items-center justify-between border-b border-hex-gold-600/60 pb-2">
              <h3 className="font-serif text-base font-semibold uppercase tracking-[0.06em] text-hex-cyan-400">
                Đội {i + 1}
              </h3>
              <span className="font-mono text-sm text-hex-gold-100">Σ {team.totalElo}</span>
            </div>
            <ul className="divide-y divide-hex-frame-700/50">
              {team.players.map((p, j) => (
                <PlayerRow key={j} p={p} index={j} />
              ))}
            </ul>
          </div>
        ))}
      </div>
      {result.bench.length > 0 && (
        <div className="hex-fade-item rounded-sm border border-dashed border-hex-frame-700 bg-hex-navy-950/50 p-4">
          <h3 className="mb-2 font-serif text-sm font-semibold uppercase tracking-[0.06em] text-hex-frame-500">
            Dự bị ({result.bench.length})
          </h3>
          <ul className="divide-y divide-hex-frame-700/50">
            {result.bench.map((p, j) => (
              <PlayerRow key={j} p={p} index={j} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

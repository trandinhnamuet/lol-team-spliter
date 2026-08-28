"use client";

import type { CSSProperties } from "react";
import { rankLabel } from "@/lib/elo";
import HexCorners from "@/components/hex/HexCorners";
import RankCrest from "@/components/hex/RankCrest";
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
  UNRANKED: "var(--color-steel-100)",
};

function tierColor(p: ResolvedPlayer): string {
  return TIER_COLORS[p.rank?.tier ?? "UNRANKED"] ?? "var(--color-steel-100)";
}

function PlayerRow({ p, index }: { p: ResolvedPlayer; index: number }) {
  const color = tierColor(p);
  return (
    <li
      className="hex-player-row hex-reveal flex items-center gap-3 py-2 pr-1"
      style={{ animationDelay: `${240 + index * 70}ms`, "--tier-color": color } as CSSProperties}
    >
      <RankCrest tier={p.rank?.tier ?? "UNRANKED"} color={color} size={26} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm leading-tight text-gold-100" title={p.input}>
          {p.input}
        </span>
        <span className="hex-badge mt-1" style={{ "--tier-color": color } as CSSProperties}>
          {rankLabel(p.rank)}
        </span>
      </span>
      <span className="shrink-0 text-right font-mono text-xs text-steel-100">{p.elo}</span>
    </li>
  );
}

export default function TeamResults({ result }: { result: TeamResult }) {
  const maxElo = Math.max(...result.teams.map((t) => t.totalElo), 1);

  return (
    <div className="hex-reveal space-y-6 pt-2">
      {/* Banner kết quả kiểu màn hình Chiến Thắng */}
      <div className="hex-result-banner pt-4">
        <span className="line" aria-hidden="true" />
        <h2>Kết quả chia team</h2>
        <span className="line" aria-hidden="true" />
      </div>
      <p className="hex-reveal text-center text-sm text-steel-100" style={{ animationDelay: "200ms" }}>
        Chênh lệch elo giữa các đội:{" "}
        <span className="hex-sigma text-base font-bold">{result.spread}</span>
      </p>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {result.teams.map((team, i) => (
          <section
            key={i}
            className="hex-panel hex-team-card hex-reveal relative p-4"
            style={{ animationDelay: `${150 + i * 120}ms` }}
          >
            <HexCorners />
            <header className="mb-1 flex items-baseline justify-between gap-2 pb-2">
              <h3 className="font-display text-sm font-bold uppercase tracking-[0.18em] text-magic-300 [text-shadow:0_0_10px_rgba(10,200,185,0.5)]">
                Đội {i + 1}
              </h3>
              <span className="hex-sigma text-sm font-bold">Σ {team.totalElo}</span>
            </header>
            <div className="hex-elo-track mb-3" title={`Tổng elo: ${team.totalElo}`}>
              <div
                className="hex-elo-fill"
                style={{ width: `${Math.round((team.totalElo / maxElo) * 100)}%`, animationDelay: `${400 + i * 120}ms` }}
              />
            </div>
            <ul className="divide-y divide-steel-700/60">
              {team.players.map((p, j) => (
                <PlayerRow key={j} p={p} index={j} />
              ))}
            </ul>
          </section>
        ))}
      </div>

      {result.bench.length > 0 && (
        <div
          className="hex-reveal relative border border-dashed border-gold-700 bg-abyss-950/60 p-4"
          style={{ animationDelay: `${200 + result.teams.length * 120}ms` }}
        >
          <h3 className="mb-2 font-display text-xs font-bold uppercase tracking-[0.18em] text-steel-100">
            Dự bị ({result.bench.length})
          </h3>
          <ul className="divide-y divide-steel-700/60">
            {result.bench.map((p, j) => (
              <PlayerRow key={j} p={p} index={j} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

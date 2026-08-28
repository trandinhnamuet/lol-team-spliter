"use client";

import { rankLabel } from "@/lib/elo";
import type { ResolvedPlayer, TeamResult } from "@/lib/types";

const TIER_COLORS: Record<string, string> = {
  IRON: "text-zinc-400",
  BRONZE: "text-orange-700",
  SILVER: "text-slate-300",
  GOLD: "text-yellow-400",
  PLATINUM: "text-teal-300",
  EMERALD: "text-emerald-400",
  DIAMOND: "text-sky-400",
  MASTER: "text-purple-400",
  GRANDMASTER: "text-red-400",
  CHALLENGER: "text-amber-300",
  UNRANKED: "text-zinc-500",
};

function PlayerRow({ p }: { p: ResolvedPlayer }) {
  const tier = p.rank?.tier ?? "UNRANKED";
  return (
    <li className="flex items-center justify-between gap-2 py-1">
      <span className="truncate text-zinc-100">{p.input}</span>
      <span className={`shrink-0 text-xs ${TIER_COLORS[tier] ?? "text-zinc-400"}`}>
        {rankLabel(p.rank)}
      </span>
      <span className="w-12 shrink-0 text-right font-mono text-xs text-zinc-400">{p.elo}</span>
    </li>
  );
}

export default function TeamResults({ result }: { result: TeamResult }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-400">
        Chênh lệch elo lớn nhất giữa các team:{" "}
        <span className="font-mono font-semibold text-zinc-200">{result.spread}</span>
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {result.teams.map((team, i) => (
          <div key={i} className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-semibold text-blue-300">Team {i + 1}</h3>
              <span className="font-mono text-sm text-zinc-300">Σ {team.totalElo}</span>
            </div>
            <ul className="divide-y divide-zinc-800/60">
              {team.players.map((p, j) => (
                <PlayerRow key={j} p={p} />
              ))}
            </ul>
          </div>
        ))}
      </div>
      {result.bench.length > 0 && (
        <div className="rounded-lg border border-dashed border-zinc-700 bg-zinc-900/50 p-4">
          <h3 className="mb-2 font-semibold text-zinc-400">Dự bị ({result.bench.length})</h3>
          <ul className="divide-y divide-zinc-800/60">
            {result.bench.map((p, j) => (
              <PlayerRow key={j} p={p} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

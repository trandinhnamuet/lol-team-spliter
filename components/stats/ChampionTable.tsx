"use client";

import { useMemo, useState } from "react";
import HexCorners from "@/components/hex/HexCorners";
import { championIconUrl } from "@/lib/champions";
import type { ChampionStat, ChampionStatsResponse } from "@/lib/stats/types";
import { POSITION_LABELS } from "./tier-ui";

type SortKey = "winRate" | "games" | "pickRate" | "kda";

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

function winColor(wr: number): string {
  if (wr >= 0.53) return "var(--color-magic-300)";
  if (wr >= 0.5) return "var(--color-gold-200)";
  if (wr >= 0.47) return "var(--color-steel-100)";
  return "var(--color-blood-300)";
}

export default function ChampionTable({
  data,
  loading,
}: {
  data: ChampionStatsResponse | null;
  loading: boolean;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("winRate");
  const [desc, setDesc] = useState(true);

  const rows = useMemo(() => {
    if (!data) return [] as ChampionStat[];
    const sorted = [...data.rows].sort((a, b) => (a[sortKey] - b[sortKey]) * (desc ? -1 : 1) || b.games - a.games);
    return sorted;
  }, [data, sortKey, desc]);

  function header(key: SortKey, label: string) {
    const active = sortKey === key;
    return (
      <th
        onClick={() => {
          if (active) setDesc((d) => !d);
          else {
            setSortKey(key);
            setDesc(true);
          }
        }}
        className="cursor-pointer select-none px-3 py-2.5 text-right font-display text-[0.6rem] font-bold uppercase tracking-[0.16em] hover:text-gold-100"
        style={{ color: active ? "var(--color-gold-100)" : "var(--color-gold-200)" }}
        title="Bấm để sắp xếp"
      >
        {label} {active ? (desc ? "▼" : "▲") : ""}
      </th>
    );
  }

  return (
    <div className="hex-panel relative overflow-x-auto">
      <HexCorners />
      {loading && (
        <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-2 bg-abyss-950/80 px-4 py-2 text-xs text-steel-100">
          <span className="hex-spinner" style={{ "--size": "12px" } as React.CSSProperties} />
          Đang tính…
        </div>
      )}
      <table className="w-full min-w-170 border-collapse text-sm">
        <thead>
          <tr className="border-b border-gold-700 text-left">
            <th className="px-3 py-2.5 font-display text-[0.6rem] font-bold uppercase tracking-[0.16em] text-gold-200">
              #
            </th>
            <th className="px-3 py-2.5 font-display text-[0.6rem] font-bold uppercase tracking-[0.16em] text-gold-200">
              Tướng
            </th>
            <th className="px-3 py-2.5 font-display text-[0.6rem] font-bold uppercase tracking-[0.16em] text-gold-200">
              Vị trí
            </th>
            {header("winRate", "Tỉ lệ thắng")}
            {header("games", "Số trận")}
            {header("pickRate", "Tỉ lệ chọn")}
            {header("kda", "KDA")}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-8 text-center text-sm text-steel-100">
                {data && data.totalMatches === 0
                  ? "Chưa có trận nào khớp bộ lọc — thu thập thêm dữ liệu hoặc nới bộ lọc."
                  : data
                    ? "Không có tướng nào đủ số trận tối thiểu."
                    : "Đang tải…"}
              </td>
            </tr>
          )}
          {rows.map((r, i) => {
            const meta = data?.champions[String(r.championId)];
            const name = meta?.name ?? r.championName;
            const icon = data && meta ? championIconUrl(data.ddragonVersion, meta.id) : null;
            const color = winColor(r.winRate);
            return (
              <tr key={r.championId} className="hex-player-row border-b border-steel-700/60">
                <td className="px-3 py-2 font-mono text-xs text-steel-100">{i + 1}</td>
                <td className="px-3 py-1.5">
                  <span className="flex items-center gap-2.5">
                    {icon ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={icon}
                        alt=""
                        width={32}
                        height={32}
                        loading="lazy"
                        className="border border-gold-700/70"
                        style={{ clipPath: "polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)" }}
                      />
                    ) : (
                      <span className="h-8 w-8 border border-steel-500 bg-abyss-950" />
                    )}
                    <span className="font-medium text-gold-100">{name}</span>
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-steel-100">
                  {r.topPosition ? POSITION_LABELS[r.topPosition] ?? r.topPosition : "—"}
                </td>
                <td className="px-3 py-2 text-right">
                  <span className="flex flex-col items-end gap-1">
                    <span className="font-mono font-semibold" style={{ color }}>
                      {pct(r.winRate)}
                    </span>
                    <span className="hex-elo-track w-24">
                      <span
                        className="block h-full"
                        style={{
                          width: `${Math.min(100, r.winRate * 100)}%`,
                          background: color,
                          boxShadow: `0 0 6px ${color}`,
                        }}
                      />
                    </span>
                  </span>
                </td>
                <td className="px-3 py-2 text-right font-mono text-gold-200">
                  {r.games}
                  <span className="ml-1 text-[0.65rem] text-steel-300">
                    ({r.wins}T/{r.games - r.wins}B)
                  </span>
                </td>
                <td className="px-3 py-2 text-right font-mono text-steel-100">{pct(r.pickRate)}</td>
                <td className="px-3 py-2 text-right font-mono text-steel-100">
                  {r.kda.toFixed(2)}
                  <span className="ml-1 text-[0.65rem] text-steel-300">
                    {r.avgKills.toFixed(1)}/{r.avgDeaths.toFixed(1)}/{r.avgAssists.toFixed(1)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

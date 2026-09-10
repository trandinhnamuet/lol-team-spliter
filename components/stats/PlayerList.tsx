"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import HexCorners from "@/components/hex/HexCorners";
import RankCrest from "@/components/hex/RankCrest";
import { opggUrl } from "@/lib/riot";
import type { PlayersResponse } from "@/lib/stats/types";
import { tierColor, tierLabel } from "./tier-ui";

const STATUS_LABEL: Record<string, string> = {
  pending: "Chờ tra",
  crawled: "Đã tra",
  error: "Lỗi",
};

/** Danh sách ingame đã phát hiện (BFS từ người gốc), có tìm kiếm + phân trang. */
export default function PlayerList({ platform, refreshToken }: { platform: string; refreshToken: number }) {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PlayersResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(q);
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const ctrl = new AbortController();
    const params = new URLSearchParams({ platform, q: debouncedQ, page: String(page), pageSize: "50" });
    fetch(`/api/stats/players?${params}`, { cache: "no-store", signal: ctrl.signal })
      .then(async (res) => {
        const d = await res.json();
        if (!res.ok) throw new Error(d.error ?? "Lỗi");
        setData(d as PlayersResponse);
        setError("");
      })
      .catch((e) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : "Không tải được danh sách");
      });
    return () => ctrl.abort();
  }, [platform, debouncedQ, page, refreshToken]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Tìm Tên#TAG…"
          className="hex-input max-w-xs px-3 py-1.5 text-sm"
        />
        {data && (
          <span className="font-display text-[0.62rem] font-bold uppercase tracking-[0.2em] text-steel-100">
            {data.total} ingame
          </span>
        )}
        <div className="ml-auto flex items-center gap-2 text-xs text-steel-100">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="hex-btn hex-btn-ghost">
            ‹
          </button>
          <span className="font-mono">
            {page}/{totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="hex-btn hex-btn-ghost"
          >
            ›
          </button>
        </div>
      </div>
      {error && <p className="text-sm text-blood-300">{error}</p>}
      <div className="hex-panel relative overflow-x-auto">
        <HexCorners />
        <table className="w-full min-w-150 border-collapse text-sm">
          <thead>
            <tr className="border-b border-gold-700 text-left">
              {["Ingame", "Rank", "Độ sâu", "Trận đã lưu", "Trạng thái", ""].map((h, i) => (
                <th
                  key={i}
                  className="px-3 py-2.5 font-display text-[0.6rem] font-bold uppercase tracking-[0.16em] text-gold-200"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data && data.rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-steel-100">
                  Chưa có ingame nào.
                </td>
              </tr>
            )}
            {data?.rows.map((p) => {
              const color = tierColor(p.tier ?? undefined);
              const name = p.gameName ? `${p.gameName}#${p.tagLine ?? ""}` : p.puuid.slice(0, 16) + "…";
              return (
                <tr
                  key={p.puuid}
                  className="hex-player-row border-b border-steel-700/60"
                  style={{ "--tier-color": color } as CSSProperties}
                >
                  <td className="px-3 py-2 font-medium text-gold-100">{name}</td>
                  <td className="px-3 py-1.5">
                    <span className="flex items-center gap-1.5">
                      <RankCrest tier={p.tier ?? "UNRANKED"} color={color} size={20} />
                      <span className="text-xs" style={{ color }}>
                        {p.tier
                          ? `${tierLabel(p.tier)}${p.division && p.tier !== "UNRANKED" ? ` ${p.division}` : ""}${
                              p.lp != null && p.tier !== "UNRANKED" ? ` · ${p.lp} LP` : ""
                            }`
                          : "Chưa tra"}
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-steel-100">{p.depth}</td>
                  <td className="px-3 py-2 font-mono text-xs text-gold-200">{p.matchCount}</td>
                  <td className="px-3 py-2 text-xs text-steel-100">{STATUS_LABEL[p.crawlStatus] ?? p.crawlStatus}</td>
                  <td className="px-3 py-2 text-right">
                    {p.gameName && p.tagLine && (
                      <a
                        href={opggUrl(p.gameName, p.tagLine, platform)}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-xs text-magic-300 underline decoration-magic-500/50 underline-offset-2 hover:text-magic-100"
                      >
                        op.gg ↗
                      </a>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

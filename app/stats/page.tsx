"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ChampionTable from "@/components/stats/ChampionTable";
import CrawlPanel from "@/components/stats/CrawlPanel";
import PlayerList from "@/components/stats/PlayerList";
import TierFilter from "@/components/stats/TierFilter";
import { QUEUE_LABELS } from "@/components/stats/tier-ui";
import { DEFAULT_REGION, REGIONS, getStoredRegion } from "@/lib/region";
import type { ChampionStatsResponse, CrawlStatusResponse } from "@/lib/stats/types";

type QueueFilter = "all" | "420" | "440";

export default function StatsPage() {
  const [platform, setPlatform] = useState(DEFAULT_REGION);
  const [status, setStatus] = useState<CrawlStatusResponse | null>(null);

  const [tiers, setTiers] = useState<string[] | null>(null);
  const [queue, setQueue] = useState<QueueFilter>("all");
  const [minGames, setMinGames] = useState("5");
  const [champs, setChamps] = useState<ChampionStatsResponse | null>(null);
  const [champsLoading, setChampsLoading] = useState(false);
  const [champsError, setChampsError] = useState("");

  // Tăng khi kho dữ liệu đổi (số trận) để danh sách ingame + bảng tướng tải lại
  const [refreshToken, setRefreshToken] = useState(0);
  const lastMatches = useRef<number | null>(null);

  useEffect(() => {
    // đọc localStorage sau hydrate qua microtask để không setState đồng bộ trong effect
    void Promise.resolve().then(() => setPlatform(getStoredRegion()));
  }, []);

  const pollStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/stats/crawl?platform=${platform}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as CrawlStatusResponse;
      setStatus(data);
      const matches = data.summary?.matches ?? null;
      if (matches !== null && lastMatches.current !== null && matches !== lastMatches.current) {
        setRefreshToken((t) => t + 1);
      }
      lastMatches.current = matches;
    } catch {
      /* giữ trạng thái cũ */
    }
  }, [platform]);

  // Poll nhanh khi crawler chạy, chậm khi rảnh
  useEffect(() => {
    lastMatches.current = null;
    void Promise.resolve().then(pollStatus);
    const interval = status?.runnerActive ? 3000 : 20000;
    const timer = setInterval(pollStatus, interval);
    return () => clearInterval(timer);
  }, [pollStatus, status?.runnerActive]);

  // Bảng tướng theo bộ lọc
  const dbConfigured = status?.dbConfigured;
  useEffect(() => {
    if (dbConfigured === false) return;
    const ctrl = new AbortController();
    const params = new URLSearchParams({ platform, minGames });
    if (tiers) params.set("tiers", tiers.join(","));
    if (queue !== "all") params.set("queues", queue);
    Promise.resolve()
      .then(() => {
        setChampsLoading(true);
        return fetch(`/api/stats/champions?${params}`, { cache: "no-store", signal: ctrl.signal });
      })
      .then(async (res) => {
        const d = await res.json();
        if (!res.ok) throw new Error(d.error ?? "Lỗi");
        setChamps(d as ChampionStatsResponse);
        setChampsError("");
      })
      .catch((e) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setChampsError(e instanceof Error ? e.message : "Không tải được thống kê");
      })
      .finally(() => setChampsLoading(false));
    return () => ctrl.abort();
  }, [platform, tiers, queue, minGames, refreshToken, dbConfigured]);

  const regionLabel = REGIONS.find((r) => r.value === platform)?.label ?? platform;

  return (
    <div className="space-y-9">
      <div className="hex-reveal">
        <p className="hex-kicker">Hextech Archive</p>
        <h1 className="hex-h1 mt-1.5">Thống kê tướng theo rank</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-steel-100">
          Từ một ingame gốc, hệ thống tra lịch sử xếp hạng để phát hiện những người cùng trận, rồi lặp lại đệ quy
          theo độ sâu để gom một kho trận đấu. Từ kho đó tính tỉ lệ thắng / tỉ lệ chọn của mọi tướng, lọc theo bậc
          rank (chỉ Bạc, từ Lục Bảo trở lên…). Khu vực đang xem:{" "}
          <span className="text-gold-200">{regionLabel}</span> (đổi ở thanh trên cùng).
        </p>
      </div>

      <section className="hex-reveal space-y-3" style={{ animationDelay: "80ms" }}>
        <h2 className="hex-section-title">Thu thập dữ liệu</h2>
        <CrawlPanel status={status} platform={platform} onStatus={setStatus} />
      </section>

      <section className="hex-reveal space-y-4" style={{ animationDelay: "140ms" }}>
        <h2 className="hex-section-title">Tỉ lệ thắng theo tướng</h2>
        <TierFilter value={tiers} onChange={setTiers} counts={status?.summary?.tierCounts} />
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-sm text-steel-100">
          <label className="flex items-center gap-2">
            Chế độ
            <select
              value={queue}
              onChange={(e) => setQueue(e.target.value as QueueFilter)}
              className="hex-input px-2 py-1 text-xs"
              style={{ width: "auto" }}
            >
              <option value="all">Mọi chế độ đã thu thập</option>
              <option value="420">{QUEUE_LABELS["420"]}</option>
              <option value="440">{QUEUE_LABELS["440"]}</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            Tối thiểu
            <input
              type="number"
              min={1}
              value={minGames}
              onChange={(e) => setMinGames(e.target.value)}
              className="hex-input w-20 px-2 py-1 text-right font-mono text-xs"
            />
            trận
          </label>
          {champs && (
            <span className="ml-auto font-display text-[0.62rem] font-bold uppercase tracking-[0.2em]">
              <span className="text-gold-200">{champs.totalMatches}</span> trận ·{" "}
              <span className="text-gold-200">{champs.totalGames}</span> lượt chơi ·{" "}
              <span className="text-gold-200">{champs.rows.length}</span> tướng
            </span>
          )}
        </div>
        {champsError && <p className="text-sm text-blood-300">{champsError}</p>}
        <ChampionTable data={champs} loading={champsLoading} />
        <p className="text-xs leading-relaxed text-steel-300">
          Tỉ lệ chọn = số lượt chơi tướng ÷ số trận khớp bộ lọc. Bậc rank của trận là trung vị rank những người
          trong trận đã tra được (ban đầu chỉ người được crawl, càng crawl sâu càng chính xác); trận chưa xác định
          bậc chỉ xuất hiện khi chọn &quot;Tất cả&quot;.
        </p>
      </section>

      <section className="hex-reveal space-y-3" style={{ animationDelay: "200ms" }}>
        <h2 className="hex-section-title">Ingame đã phát hiện</h2>
        {status?.dbConfigured && <PlayerList platform={platform} refreshToken={refreshToken} />}
      </section>
    </div>
  );
}

"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import HexCorners from "@/components/hex/HexCorners";
import type { CrawlStatusResponse } from "@/lib/stats/types";
import KeyManager from "./KeyManager";
import { TIER_ORDER, tierColor, tierLabel } from "./tier-ui";

const STATUS_UI: Record<string, { label: string; dot: string }> = {
  running: { label: "Đang thu thập", dot: "var(--color-magic-300)" },
  paused: { label: "Tạm dừng", dot: "var(--color-gold-400)" },
  done: { label: "Hoàn tất", dot: "var(--color-tier-emerald)" },
  error: { label: "Lỗi", dot: "var(--color-blood-400)" },
};

function Tile({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="border border-gold-700/50 bg-abyss-950/60 px-3 py-2">
      <p className="font-display text-[0.55rem] font-bold uppercase tracking-[0.18em] text-steel-100">{label}</p>
      <p className="font-mono text-lg text-gold-100">{value}</p>
      {hint && <p className="text-[0.65rem] text-steel-300">{hint}</p>}
    </div>
  );
}

/** Bảng điều khiển crawler: form bắt đầu, nút tạm dừng/tiếp tục, tiến độ, phân bố bậc, quản lý key. */
export default function CrawlPanel({
  status,
  platform,
  onStatus,
}: {
  status: CrawlStatusResponse | null;
  platform: string;
  onStatus: (s: CrawlStatusResponse) => void;
}) {
  const [riotId, setRiotId] = useState("");
  const [solo, setSolo] = useState(true);
  const [flex, setFlex] = useState(false);
  const [matchesPerPlayer, setMatchesPerPlayer] = useState("20");
  const [maxPlayers, setMaxPlayers] = useState("200");
  const [maxDepth, setMaxDepth] = useState("3");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const job = status?.job ?? null;
  const running = Boolean(status?.runnerActive);
  const summary = status?.summary;

  async function act(action: "start" | "pause" | "resume") {
    setBusy(true);
    setError("");
    try {
      const queueIds = [solo ? 420 : null, flex ? 440 : null].filter((q): q is number => q !== null);
      const res = await fetch("/api/stats/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "start"
            ? { action, platform, riotId, queueIds, matchesPerPlayer, maxPlayers, maxDepth }
            : { action, platform }
        ),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Có lỗi xảy ra");
        return;
      }
      onStatus(data as CrawlStatusResponse);
    } catch {
      setError("Lỗi kết nối server");
    } finally {
      setBusy(false);
    }
  }

  async function refreshKeys() {
    try {
      const res = await fetch(`/api/stats/crawl?platform=${platform}`, { cache: "no-store" });
      if (res.ok) onStatus((await res.json()) as CrawlStatusResponse);
    } catch {
      /* lần poll sau sẽ cập nhật */
    }
  }

  const ui = job ? STATUS_UI[job.status] : null;
  const progressPct = job ? Math.min(100, Math.round((job.playersCrawled / job.maxPlayers) * 100)) : 0;
  const tierTotal = summary ? Object.values(summary.tierCounts).reduce((s, c) => s + c, 0) : 0;

  return (
    <div className="hex-panel relative space-y-5 p-5">
      <HexCorners />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        {/* ---- Form ---- */}
        <div className="space-y-3">
          <label className="block font-display text-[0.62rem] font-bold uppercase tracking-[0.2em] text-gold-200">
            Ingame gốc (Tên#TAG)
          </label>
          <input
            value={riotId}
            onChange={(e) => setRiotId(e.target.value)}
            placeholder="Ví dụ: Faker#KR1"
            disabled={running}
            className="hex-input px-3 py-2 text-sm"
            onKeyDown={(e) => e.key === "Enter" && riotId.trim() && !running && act("start")}
          />
          <div className="flex flex-wrap gap-4 text-sm text-steel-100">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={solo}
                onChange={(e) => setSolo(e.target.checked)}
                disabled={running}
                className="h-4 w-4 accent-[var(--color-magic-300,#0ac8b9)]"
              />
              Xếp hạng Đơn/Đôi
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={flex}
                onChange={(e) => setFlex(e.target.checked)}
                disabled={running}
                className="h-4 w-4 accent-[var(--color-magic-300,#0ac8b9)]"
              />
              Xếp hạng Linh Hoạt
            </label>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {(
              [
                ["Trận / người", matchesPerPlayer, setMatchesPerPlayer, "1–100"],
                ["Tối đa người", maxPlayers, setMaxPlayers, "dừng khi đủ"],
                ["Độ sâu tối đa", maxDepth, setMaxDepth, "0 = chỉ người gốc"],
              ] as [string, string, (v: string) => void, string][]
            ).map(([label, value, set, hint]) => (
              <label key={label} className="block">
                <span className="block font-display text-[0.55rem] font-bold uppercase tracking-[0.16em] text-steel-100">
                  {label}
                </span>
                <input
                  type="number"
                  value={value}
                  onChange={(e) => set(e.target.value)}
                  disabled={running}
                  className="hex-input mt-1 px-2 py-1.5 font-mono text-sm"
                />
                <span className="block text-[0.62rem] text-steel-300">{hint}</span>
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {!running && (
              <button
                onClick={() => act("start")}
                disabled={busy || !riotId.trim() || (!solo && !flex) || !status?.dbConfigured}
                className="hex-btn hex-btn-magic"
              >
                {busy ? (
                  <>
                    <span className="hex-spinner" style={{ "--size": "14px" } as CSSProperties} />
                    Đang xử lý…
                  </>
                ) : (
                  "⬡ Bắt đầu thu thập"
                )}
              </button>
            )}
            {running && (
              <button onClick={() => act("pause")} disabled={busy} className="hex-btn hex-btn-danger">
                {busy ? "Đang dừng…" : "■ Tạm dừng"}
              </button>
            )}
            {!running && job && (job.status === "paused" || job.status === "error") && (
              <button onClick={() => act("resume")} disabled={busy} className="hex-btn">
                ▶ Tiếp tục
              </button>
            )}
          </div>
          {error && <p className="text-sm text-blood-300">{error}</p>}
          <p className="text-xs leading-relaxed text-steel-100">
            Mỗi người chỉ tốn <span className="text-gold-200">2 request</span> (rank + danh sách trận) cộng số
            trận <em>mới</em>; trận đã có trong kho không tải lại. Bậc rank của trận suy từ rank những người
            trong trận đã biết — không tra rank cả 10 người.
          </p>
        </div>

        {/* ---- Trạng thái ---- */}
        <div className="space-y-3">
          {!status && (
            <p className="flex items-center gap-2 text-sm text-steel-100">
              <span className="hex-spinner" /> Đang tải trạng thái…
            </p>
          )}
          {status && !status.dbConfigured && (
            <div className="hex-alert p-3 text-sm text-blood-300">
              Chưa cấu hình PostgreSQL. Thêm DB_HOST / DB_PORT / DB_USERNAME / DB_PASSWORD / DB_NAME vào{" "}
              <code className="hex-code px-1 text-xs">.env.local</code> rồi khởi động lại server.
            </div>
          )}
          {status?.dbError && <div className="hex-alert p-3 text-sm text-blood-300">Lỗi database: {status.dbError}</div>}
          {status?.dbConfigured && !job && (
            <p className="text-sm text-steel-100">
              Chưa có lần thu thập nào cho khu vực này. Nhập ingame gốc và bấm Bắt đầu.
            </p>
          )}
          {job && ui && (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <span className="hex-status-dot" style={{ "--dot-color": ui.dot } as CSSProperties} />
                <span className="font-display text-[0.7rem] font-bold uppercase tracking-[0.18em] text-gold-100">
                  {ui.label}
                </span>
                <span className="text-xs text-steel-100">
                  gốc <span className="font-mono text-gold-200">{job.rootRiotId}</span> · từ{" "}
                  {new Date(job.startedAt).toLocaleString("vi-VN")}
                </span>
              </div>
              {job.note && <p className="truncate font-mono text-xs text-magic-100">{job.note}</p>}
              {job.lastError && <p className="text-xs text-blood-300">{job.lastError}</p>}
              <div className="hex-progress-track">
                <div className="hex-progress-fill" style={{ width: `${progressPct}%` }} />
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Tile label="Người đã tra" value={`${job.playersCrawled}/${job.maxPlayers}`} hint={`${progressPct}%`} />
                <Tile label="Trận mới" value={job.matchesAdded} hint={`bỏ ${job.matchesSkipped} trận đã có`} />
                <Tile label="Request Riot" value={job.requestsMade} hint={`${job.playersRanked} lượt tra rank`} />
              </div>
            </>
          )}
          {summary && (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Tile label="Kho: ingame" value={summary.players} hint={`${summary.playersPending} chờ tra`} />
                <Tile label="Kho: đã tra" value={summary.playersCrawled} hint={`${summary.playersRanked} có rank`} />
                <Tile label="Kho: trận" value={summary.matches} />
              </div>
              {tierTotal > 0 && (
                <div className="space-y-1">
                  <p className="font-display text-[0.55rem] font-bold uppercase tracking-[0.18em] text-steel-100">
                    Phân bố bậc rank của trận
                  </p>
                  <div className="flex h-3 w-full overflow-hidden border border-gold-700/50">
                    {[...TIER_ORDER, "UNKNOWN"].map((t) => {
                      const c = summary.tierCounts[t] ?? 0;
                      if (!c) return null;
                      return (
                        <span
                          key={t}
                          title={`${tierLabel(t)}: ${c} trận`}
                          style={{ width: `${(c / tierTotal) * 100}%`, background: tierColor(t) }}
                        />
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[0.65rem] text-steel-100">
                    {[...TIER_ORDER, "UNKNOWN"].map((t) => {
                      const c = summary.tierCounts[t] ?? 0;
                      if (!c) return null;
                      return (
                        <span key={t} className="flex items-center gap-1">
                          <span className="inline-block h-2 w-2" style={{ background: tierColor(t) }} />
                          {tierLabel(t)} <span className="font-mono text-gold-200">{c}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="hex-divider !my-2" />
      {status && <KeyManager keys={status.keys} onChanged={refreshKeys} />}
    </div>
  );
}

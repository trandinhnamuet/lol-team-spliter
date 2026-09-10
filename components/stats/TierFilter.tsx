"use client";

import type { CSSProperties } from "react";
import RankCrest from "@/components/hex/RankCrest";
import { TIER_ORDER, TIER_PRESETS, tierColor, tierLabel } from "./tier-ui";

function sameSet(a: string[] | null, b: string[] | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}

/**
 * Bộ lọc bậc rank: hàng preset (Tất cả / Bạc / Lục Bảo+ …) + từng huy hiệu bấm chọn/bỏ chọn.
 * `value` null = mọi bậc (kể cả trận chưa xác định bậc).
 */
export default function TierFilter({
  value,
  onChange,
  counts,
}: {
  value: string[] | null;
  onChange: (tiers: string[] | null) => void;
  /** Số trận theo bậc để hiện dưới huy hiệu. */
  counts?: Record<string, number>;
}) {
  function toggle(tier: string) {
    if (value === null) {
      onChange([tier]);
      return;
    }
    const next = value.includes(tier) ? value.filter((t) => t !== tier) : [...value, tier];
    onChange(next.length === 0 ? null : next);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {TIER_PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => onChange(p.tiers)}
            className="hex-btn hex-btn-ghost"
            data-active={sameSet(value, p.tiers)}
            style={
              sameSet(value, p.tiers)
                ? { color: "var(--color-gold-100)", boxShadow: "0 0 10px rgba(200,170,110,0.35)" }
                : undefined
            }
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        {TIER_ORDER.map((tier) => {
          const active = value === null || value.includes(tier);
          const color = tierColor(tier);
          return (
            <button
              key={tier}
              onClick={() => toggle(tier)}
              title={`${tierLabel(tier)} — bấm để ${value !== null && value.includes(tier) ? "bỏ" : "chọn"}`}
              className="flex min-w-16 flex-col items-center gap-0.5 border px-2 py-1.5 transition"
              style={
                {
                  borderColor: active ? `color-mix(in srgb, ${color} 55%, transparent)` : "rgba(70,55,20,0.5)",
                  background: active ? `color-mix(in srgb, ${color} 12%, transparent)` : "rgba(1,10,19,0.5)",
                  opacity: active ? 1 : 0.45,
                  "--tier-color": color,
                } as CSSProperties
              }
            >
              <RankCrest tier={tier} color={color} size={24} />
              <span className="font-display text-[0.55rem] font-bold uppercase tracking-[0.08em]" style={{ color }}>
                {tierLabel(tier)}
              </span>
              {counts && (
                <span className="font-mono text-[0.6rem] text-steel-100">{counts[tier] ?? 0}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

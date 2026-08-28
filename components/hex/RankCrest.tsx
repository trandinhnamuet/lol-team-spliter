"use client";

import { useState } from "react";

/** Huy hiệu rank mini lấy từ CommunityDragon (asset gốc của client LMHT).
 *  Nếu tải lỗi thì thay bằng viên kim cương màu theo bậc rank. */
const CREST_BASE =
  "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-mini-crests";

const VALID_TIERS = new Set([
  "iron",
  "bronze",
  "silver",
  "gold",
  "platinum",
  "emerald",
  "diamond",
  "master",
  "grandmaster",
  "challenger",
]);

export default function RankCrest({
  tier,
  color,
  size = 22,
}: {
  tier: string;
  color: string;
  size?: number;
}) {
  const slug = tier.toLowerCase();
  const [broken, setBroken] = useState(false);

  if (broken || !VALID_TIERS.has(slug)) {
    return (
      <span
        aria-hidden="true"
        style={{
          width: size * 0.55,
          height: size * 0.55,
          rotate: "45deg",
          background: color,
          boxShadow: `0 0 6px ${color}`,
          flexShrink: 0,
          margin: size * 0.22,
        }}
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`${CREST_BASE}/${slug}.svg`}
      alt={tier}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setBroken(true)}
      style={{ flexShrink: 0, filter: `drop-shadow(0 0 4px ${color}66)` }}
    />
  );
}

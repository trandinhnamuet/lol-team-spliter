"use client";

import { useEffect, useState } from "react";
import { DEFAULT_REGION, REGIONS, getStoredRegion, setStoredRegion } from "@/lib/region";

/** Dropdown chọn khu vực/server, lưu lựa chọn vào localStorage của trình duyệt. */
export default function RegionSelect() {
  const [region, setRegion] = useState(DEFAULT_REGION);

  useEffect(() => {
    setRegion(getStoredRegion());
  }, []);

  function handleChange(value: string) {
    setRegion(value);
    setStoredRegion(value);
  }

  return (
    <label className="flex items-center gap-1.5 text-xs text-steel-100">
      <span className="hidden sm:inline">Khu vực:</span>
      <select
        value={region}
        onChange={(e) => handleChange(e.target.value)}
        title="Khu vực/server dùng để tra rank"
        className="hex-input px-2 py-1 text-xs"
        style={{ width: "auto" }}
      >
        {REGIONS.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
    </label>
  );
}

"use client";

import { use, useEffect, useState } from "react";
import TeamResults from "@/components/TeamResults";
import type { SavedResult } from "@/lib/types";

export default function SavedResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [saved, setSaved] = useState<SavedResult | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/results/${id}`, { cache: "no-store" })
      .then(async (res) => {
        if (res.ok) setSaved((await res.json()).saved);
        else setNotFound(true);
      })
      .catch(() => setNotFound(true));
  }, [id]);

  if (notFound) return <p className="text-blood-300">Không tìm thấy kết quả này (có thể đã bị xoá).</p>;
  if (!saved)
    return (
      <p className="flex items-center gap-2.5 text-steel-100">
        <span className="hex-spinner" />
        Đang tải…
      </p>
    );

  return (
    <div className="space-y-4">
      <div className="hex-reveal">
        <p className="hex-kicker">Kết quả đã lưu</p>
        <p className="mt-1.5 text-sm text-steel-100">
          Lưu lúc {new Date(saved.createdAt).toLocaleString("vi-VN")}
        </p>
      </div>

      <TeamResults result={saved.result} failed={saved.failed} allowSave={false} />

      {saved.failed.length > 0 && (
        <div className="hex-alert hex-reveal p-4 text-sm">
          <p className="mb-1.5 font-semibold text-blood-300">
            {saved.failed.length} người không xử lý được khi chia:
          </p>
          <ul className="list-inside list-disc space-y-0.5 text-gold-100/85">
            {saved.failed.map((p, i) => (
              <li key={i}>
                {p.input} — {p.error}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

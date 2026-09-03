"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import HexCorners from "@/components/hex/HexCorners";

interface ResultSummary {
  id: string;
  createdAt: string;
  teamCount: number;
  teamSize: number;
  playerCount: number;
  spread: number;
}

export default function ResultsPage() {
  const [results, setResults] = useState<ResultSummary[] | null>(null);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState("");

  useEffect(() => {
    fetch("/api/results", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error();
        const data = await res.json();
        setResults(data.results ?? []);
      })
      .catch(() => setError("Không tải được danh sách kết quả"));
  }, []);

  async function copyLink(id: string) {
    await navigator.clipboard.writeText(`${window.location.origin}/result/${id}`);
    setCopiedId(id);
    setTimeout(() => setCopiedId(""), 1500);
  }

  return (
    <div className="space-y-7">
      <div className="hex-reveal">
        <p className="hex-kicker">Lưu trữ</p>
        <h1 className="hex-h1 mt-1.5">Kết quả đã lưu</h1>
        <p className="mt-2 text-sm text-steel-100">
          Danh sách các lần chia team đã được lưu lại để xem lại hoặc chia sẻ.
        </p>
      </div>

      {error && <p className="text-sm text-blood-300">{error}</p>}

      {!results && !error && (
        <p className="flex items-center gap-2.5 text-steel-100">
          <span className="hex-spinner" />
          Đang tải…
        </p>
      )}

      {results && results.length === 0 && (
        <p className="text-sm text-steel-100">Chưa có kết quả nào được lưu.</p>
      )}

      {results && results.length > 0 && (
        <ul className="hex-panel hex-reveal relative divide-y divide-steel-700/60">
          <HexCorners />
          {results.map((r) => (
            <li
              key={r.id}
              className="hex-player-row flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3 text-sm"
            >
              <Link
                href={`/result/${r.id}`}
                className="font-mono text-magic-300 underline decoration-magic-500/50 underline-offset-2 hover:text-magic-100 hover:[text-shadow:0_0_8px_rgba(10,200,185,0.6)]"
              >
                /result/{r.id}
              </Link>
              <span className="text-steel-100">
                {r.teamCount} đội × {r.teamSize} người ({r.playerCount} người chơi)
              </span>
              <span className="text-steel-100">
                Chênh lệch elo: <span className="font-mono text-gold-200">{r.spread}</span>
              </span>
              <span className="font-mono text-xs text-steel-300">
                {new Date(r.createdAt).toLocaleString("vi-VN")}
              </span>
              <button onClick={() => copyLink(r.id)} className="hex-btn hex-btn-ghost ml-auto">
                {copiedId === r.id ? <span className="text-magic-300">✓ Đã copy</span> : "Copy link"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

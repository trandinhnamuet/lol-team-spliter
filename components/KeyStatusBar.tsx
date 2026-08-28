"use client";

import { useCallback, useEffect, useState } from "react";
import type { KeyStatus } from "@/lib/types";

interface KeyInfo {
  status: KeyStatus;
  platform: string;
  keyHint: string | null;
}

const STATUS_UI: Record<KeyStatus, { dot: string; text: string; cls: string }> = {
  valid: { dot: "bg-emerald-400", text: "Riot key còn hạn", cls: "text-emerald-300" },
  invalid: { dot: "bg-red-500", text: "Riot key hết hạn / không hợp lệ", cls: "text-red-300" },
  missing: { dot: "bg-amber-400", text: "Chưa có Riot key", cls: "text-amber-300" },
  error: { dot: "bg-zinc-400", text: "Không kiểm tra được key", cls: "text-zinc-300" },
};

export default function KeyStatusBar() {
  const [info, setInfo] = useState<KeyInfo | null>(null);
  const [showInput, setShowInput] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/key", { cache: "no-store" });
      const data = (await res.json()) as KeyInfo;
      setInfo(data);
      if (data.status === "invalid" || data.status === "missing") setShowInput(true);
    } catch {
      setInfo({ status: "error", platform: "", keyHint: null });
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 60_000);
    return () => clearInterval(timer);
  }, [refresh]);

  async function submitKey() {
    if (!newKey.trim()) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: newKey.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Không lưu được key");
      } else {
        setNewKey("");
        setShowInput(false);
        await refresh();
      }
    } catch {
      setError("Lỗi kết nối");
    } finally {
      setSaving(false);
    }
  }

  const ui = info ? STATUS_UI[info.status] : null;

  return (
    <div className="border-b border-zinc-800 bg-zinc-900/80 px-4 py-2 text-sm">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3">
        {ui ? (
          <span className={`flex items-center gap-2 ${ui.cls}`}>
            <span className={`h-2.5 w-2.5 rounded-full ${ui.dot}`} />
            {ui.text}
            {info?.keyHint && info.status === "valid" && (
              <span className="text-zinc-500">({info.keyHint})</span>
            )}
          </span>
        ) : (
          <span className="text-zinc-500">Đang kiểm tra Riot key…</span>
        )}
        <button
          onClick={() => setShowInput((v) => !v)}
          className="ml-auto rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-300 hover:bg-zinc-800"
        >
          {showInput ? "Ẩn" : "Đổi key"}
        </button>
        {showInput && (
          <div className="flex w-full items-center gap-2 pt-1">
            <input
              type="password"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="RGAPI-xxxxxxxx-xxxx-..."
              className="flex-1 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono text-xs text-zinc-100 outline-none focus:border-blue-500"
              onKeyDown={(e) => e.key === "Enter" && submitKey()}
            />
            <button
              onClick={submitKey}
              disabled={saving || !newKey.trim()}
              className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {saving ? "Đang kiểm tra…" : "Lưu key"}
            </button>
            {error && <span className="text-xs text-red-400">{error}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { KeyStatus } from "@/lib/types";

interface KeyInfo {
  status: KeyStatus;
  platform: string;
  keyHint: string | null;
}

const STATUS_UI: Record<KeyStatus, { dot: string; text: string; cls: string }> = {
  valid: { dot: "var(--color-magic-300)", text: "Riot key còn hạn", cls: "text-magic-300" },
  invalid: { dot: "var(--color-blood-400)", text: "Riot key hết hạn / không hợp lệ", cls: "text-blood-300" },
  missing: { dot: "var(--color-gold-400)", text: "Chưa có Riot key", cls: "text-gold-300" },
  error: { dot: "var(--color-steel-100)", text: "Không kiểm tra được key", cls: "text-steel-100" },
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
    // gọi qua microtask để không setState đồng bộ trong effect
    void Promise.resolve().then(refresh);
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
    <div className="relative z-30 border-b border-gold-700/60 bg-abyss-950/80 px-4 py-2 text-sm backdrop-blur-sm">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3">
        {ui ? (
          <span className={`flex items-center gap-2.5 ${ui.cls}`}>
            <span className="hex-status-dot" style={{ "--dot-color": ui.dot } as CSSProperties} />
            {ui.text}
            {info?.keyHint && info.status === "valid" && (
              <span className="font-mono text-xs text-steel-300">({info.keyHint})</span>
            )}
          </span>
        ) : (
          <span className="flex items-center gap-2 text-steel-100">
            <span className="hex-spinner" style={{ "--size": "13px" } as CSSProperties} />
            Đang kiểm tra Riot key…
          </span>
        )}
        <button onClick={() => setShowInput((v) => !v)} className="hex-btn hex-btn-ghost ml-auto">
          {showInput ? "Ẩn" : "Đổi key"}
        </button>
        {showInput && (
          <div className="hex-reveal flex w-full items-center gap-2 pt-1">
            <input
              type="password"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="RGAPI-xxxxxxxx-xxxx-..."
              className="hex-input flex-1 px-3 py-1.5 font-mono text-xs"
              onKeyDown={(e) => e.key === "Enter" && submitKey()}
            />
            <button onClick={submitKey} disabled={saving || !newKey.trim()} className="hex-btn hex-btn-ghost">
              {saving ? (
                <>
                  <span className="hex-spinner" style={{ "--size": "12px" } as CSSProperties} />
                  Đang kiểm tra…
                </>
              ) : (
                "Lưu key"
              )}
            </button>
            {error && <span className="text-xs text-blood-300">{error}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

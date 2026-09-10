"use client";

import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import RegionSelect from "@/components/hex/RegionSelect";
import SoundToggle from "@/components/hex/SoundToggle";
import type { KeyStatus } from "@/lib/types";

interface KeyInfo {
  status: KeyStatus;
  platform: string;
  keyHint: string | null;
  /** Tổng số key trong pool (key chính + key phụ). */
  keyCount?: number;
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
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [res, keysRes] = await Promise.all([
        fetch("/api/key", { cache: "no-store" }),
        fetch("/api/keys", { cache: "no-store" }).catch(() => null),
      ]);
      const data = (await res.json()) as KeyInfo;
      if (keysRes?.ok) {
        const k = (await keysRes.json()) as { keys?: unknown[] };
        data.keyCount = k.keys?.length;
      }
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

  /**
   * Thêm key ngay tại header. Key chính hết hạn/chưa có → key mới THAY key chính (key dev Riot hết
   * hạn mỗi 24h, dán key mới cùng tài khoản là crawler tự chạy tiếp). Key chính còn hạn → key mới
   * được THÊM làm key phụ vào pool (dán nhiều key cách nhau bằng xuống dòng/dấu phẩy đều được).
   */
  async function submitKey() {
    const raw = newKey.trim();
    if (!raw) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const primaryDead = !info || info.status === "invalid" || info.status === "missing";
      const parts = raw.split(/[\s,;]+/).filter(Boolean);
      const messages: string[] = [];
      let rest = parts;
      if (primaryDead) {
        const res = await fetch("/api/key", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apiKey: parts[0] }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Không lưu được key");
          return;
        }
        messages.push(`Đã đặt ${data.keyHint} làm key chính`);
        rest = parts.slice(1);
      }
      if (rest.length > 0) {
        const res = await fetch("/api/keys", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apiKeys: rest }),
        });
        const data = (await res.json()) as {
          error?: string;
          addedScopes?: { hint: string; scope: "identity" | "matches-only" | null }[];
          rejected?: { hint: string; reason: string }[];
        };
        if (!res.ok) {
          setError(data.error ?? "Không thêm được key");
          return;
        }
        for (const a of data.addedScopes ?? []) {
          messages.push(
            a.scope === "matches-only"
              ? `Đã thêm ${a.hint} (khác tài khoản Riot Developer → chỉ dùng tải trận)`
              : `Đã thêm ${a.hint}${a.scope === "identity" ? " (cùng tài khoản, dùng cho mọi request)" : ""}`
          );
        }
        for (const r of data.rejected ?? []) messages.push(`${r.hint}: ${r.reason}`);
        if ((data.rejected?.length ?? 0) > 0 && (data.addedScopes?.length ?? 0) === 0) {
          setError(messages.join(" · "));
          return;
        }
      }
      setNewKey("");
      setShowInput(false);
      setNotice(messages.join(" · "));
      setTimeout(() => setNotice(""), 8000);
      await refresh();
    } catch {
      setError("Lỗi kết nối");
    } finally {
      setSaving(false);
    }
  }

  const ui = info ? STATUS_UI[info.status] : null;

  return (
    <div className="relative z-30 border-b border-gold-700/60 bg-abyss-950/80 px-4 py-2 text-sm backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3">
        {ui ? (
          <span className={`flex items-center gap-2.5 ${ui.cls}`}>
            <span className="hex-status-dot" style={{ "--dot-color": ui.dot } as CSSProperties} />
            {ui.text}
            {info?.keyHint && info.status === "valid" && (
              <span className="font-mono text-xs text-steel-300">
                ({info.keyHint}
                {info.keyCount && info.keyCount > 1 ? ` · ${info.keyCount} key` : ""})
              </span>
            )}
          </span>
        ) : (
          <span className="flex items-center gap-2 text-steel-100">
            <span className="hex-spinner" style={{ "--size": "13px" } as CSSProperties} />
            Đang kiểm tra Riot key…
          </span>
        )}
        <RegionSelect />
        {notice && <span className="text-xs text-magic-300">{notice}</span>}
        <div className="ml-auto flex items-center gap-2">
          <SoundToggle />
          <button
            onClick={() => setShowInput((v) => !v)}
            className="hex-btn hex-btn-ghost"
            title="Key chính hết hạn thì key mới thay nó; còn hạn thì key mới được thêm làm key phụ. Dán nhiều key cách nhau bằng dấu phẩy hoặc xuống dòng."
          >
            {showInput ? "Ẩn" : "Thêm key"}
          </button>
        </div>
        {showInput && (
          <div className="hex-reveal flex w-full items-center gap-2 pt-1">
            <input
              type="password"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder={
                info && (info.status === "invalid" || info.status === "missing")
                  ? "RGAPI-… (key chính mới — cùng tài khoản Riot Developer với key cũ)"
                  : "RGAPI-… (thêm key phụ; nhiều key cách nhau bằng dấu phẩy)"
              }
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
                "Thêm"
              )}
            </button>
            {error && <span className="text-xs text-blood-300">{error}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

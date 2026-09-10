"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import type { KeyInfo } from "@/lib/stats/types";

const STATUS_DOT: Record<KeyInfo["status"], string> = {
  valid: "var(--color-magic-300)",
  invalid: "var(--color-blood-400)",
  unknown: "var(--color-steel-100)",
};

/**
 * Quản lý pool Riot API key: key chính (đổi ở thanh trên) + các key phụ thêm ở đây.
 * Crawler xoay vòng mọi key theo cửa sổ rate limit riêng của từng key.
 */
export default function KeyManager({ keys, onChanged }: { keys: KeyInfo[]; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function addKeys() {
    if (!input.trim()) return;
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKeys: input }),
      });
      const data = (await res.json()) as {
        error?: string;
        added?: string[];
        rejected?: { hint: string; reason: string }[];
      };
      if (!res.ok) {
        setMessage(data.error ?? "Không thêm được key");
        return;
      }
      const parts: string[] = [];
      if (data.added?.length) parts.push(`Đã thêm ${data.added.length} key (${data.added.join(", ")})`);
      for (const r of data.rejected ?? []) parts.push(`${r.hint}: ${r.reason}`);
      setMessage(parts.join(" · ") || "Không có key mới");
      if (data.added?.length) setInput("");
      onChanged();
    } catch {
      setMessage("Lỗi kết nối server");
    } finally {
      setBusy(false);
    }
  }

  async function removeKey(hint: string) {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/keys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hint }),
      });
      const data = await res.json();
      if (!res.ok) setMessage(data.error ?? "Không xoá được key");
      onChanged();
    } catch {
      setMessage("Lỗi kết nối server");
    } finally {
      setBusy(false);
    }
  }

  const totalAvailable = keys.reduce((s, k) => s + (k.status === "invalid" ? 0 : k.available), 0);

  return (
    <div className="space-y-2">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 text-left">
        <span className="font-display text-[0.62rem] font-bold uppercase tracking-[0.2em] text-gold-200">
          Riot API keys
        </span>
        <span className="font-mono text-xs text-steel-100">
          {keys.length} key · còn gửi ngay được <span className="text-gold-200">{totalAvailable}</span> request
        </span>
        <span className="ml-auto text-xs text-steel-100">{open ? "Ẩn ▲" : "Quản lý ▼"}</span>
      </button>

      {open && (
        <div className="hex-reveal space-y-3">
          <ul className="divide-y divide-steel-700/60 border border-gold-700/50">
            {keys.map((k) => (
              <li key={k.hint} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-xs">
                <span className="hex-status-dot" style={{ "--dot-color": STATUS_DOT[k.status] } as CSSProperties} />
                <span className="font-mono text-gold-100">{k.hint}</span>
                {k.primary && <span className="hex-badge">Chính</span>}
                <span className="text-steel-100">
                  {k.status === "invalid" ? "Bị Riot từ chối" : k.status === "valid" ? "Hợp lệ" : "Chưa dùng"}
                </span>
                <span className="font-mono text-steel-100">giới hạn {k.limits}</span>
                <span className="font-mono text-steel-100">
                  còn <span className="text-gold-200">{k.available}</span>
                  {k.waitMs > 0 && <span className="text-blood-300"> · chờ {Math.ceil(k.waitMs / 1000)}s</span>}
                </span>
                <span className="font-mono text-steel-300">{k.requests} req</span>
                {!k.primary && (
                  <button
                    onClick={() => removeKey(k.hint)}
                    disabled={busy}
                    className="hex-btn hex-btn-ghost hex-btn-danger ml-auto"
                  >
                    Xoá
                  </button>
                )}
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-2 sm:flex-row">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={2}
              placeholder={"Dán một hoặc nhiều key, mỗi dòng một key:\nRGAPI-xxxxxxxx-...\nRGAPI-yyyyyyyy-..."}
              className="hex-input flex-1 px-3 py-2 font-mono text-xs"
            />
            <button onClick={addKeys} disabled={busy || !input.trim()} className="hex-btn hex-btn-ghost self-start">
              {busy ? (
                <>
                  <span className="hex-spinner" style={{ "--size": "12px" } as CSSProperties} />
                  Đang kiểm tra…
                </>
              ) : (
                "Thêm key"
              )}
            </button>
          </div>
          <p className="text-xs text-steel-100">
            Mỗi key có rate limit riêng (dev key: 20 request/giây, 100 request/2 phút). Crawler tự chọn key còn
            nhiều lượt nhất cho từng request, nên thêm N key là nhân N tốc độ thu thập. Key chết (401/403) tự bị
            loại 10 phút rồi thử lại.
          </p>
          {message && <p className="text-xs text-gold-200">{message}</p>}
        </div>
      )}
    </div>
  );
}

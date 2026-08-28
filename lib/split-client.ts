import type { ResolvedPlayer, TeamResult } from "./types";

export interface SplitProgress {
  done: number;
  total: number;
}

export interface SplitOutcome {
  result?: TeamResult;
  failed?: ResolvedPlayer[];
  players?: ResolvedPlayer[];
  error?: string;
}

interface SplitEvent extends SplitOutcome {
  type: "start" | "progress" | "result" | "error";
  done?: number;
  total?: number;
}

/**
 * Gọi /api/split và đọc stream NDJSON, báo tiến độ qua onProgress.
 * Trả về kết quả cuối (result) hoặc error — không throw trừ lỗi mạng.
 */
export async function splitWithProgress(
  body: { riotIds?: string[]; eventId?: string; teamSize?: number },
  onProgress: (p: SplitProgress) => void
): Promise<SplitOutcome> {
  const res = await fetch("/api/split", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  // Lỗi validate trước khi stream bắt đầu trả JSON thường
  const contentType = res.headers.get("content-type") ?? "";
  if (!res.ok || !contentType.includes("ndjson")) {
    return (await res.json().catch(() => ({ error: "Có lỗi xảy ra" }))) as SplitOutcome;
  }
  if (!res.body) return { error: "Trình duyệt không hỗ trợ đọc stream" };

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let outcome: SplitOutcome = { error: "Kết nối bị ngắt giữa chừng" };

  const handleLine = (line: string) => {
    if (!line.trim()) return;
    let ev: SplitEvent;
    try {
      ev = JSON.parse(line) as SplitEvent;
    } catch {
      return;
    }
    if (ev.type === "start" || ev.type === "progress") {
      onProgress({ done: ev.done ?? 0, total: ev.total ?? 0 });
    } else if (ev.type === "result" || ev.type === "error") {
      outcome = { result: ev.result, failed: ev.failed, players: ev.players, error: ev.error };
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    lines.forEach(handleLine);
  }
  handleLine(buffer);
  return outcome;
}

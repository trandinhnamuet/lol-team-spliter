import type { SplitJob } from "./types";

export interface SplitRequestBody {
  riotIds?: string[];
  eventId?: string;
  teamSize?: number;
  platform?: string;
  estimateUnranked?: boolean;
}

/** Thời gian chờ trước khi nối lại stream bị đứt giữa chừng. */
const RECONNECT_MS = 1500;

/**
 * Khởi động một lượt chia team chạy nền. Trả về id của job để điều hướng sang `/split/[id]`,
 * hoặc thông báo lỗi validate. Job đã chạy rồi thì không phụ thuộc vào tab này nữa.
 */
export async function startSplit(body: SplitRequestBody): Promise<{ id?: string; error?: string }> {
  try {
    const res = await fetch("/api/split", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
    if (!res.ok || !data.id) return { error: data.error ?? "Có lỗi xảy ra" };
    return { id: data.id };
  } catch {
    return { error: "Lỗi kết nối server" };
  }
}

interface JobEvent {
  type: "job" | "ping";
  job?: SplitJob;
}

/**
 * Theo dõi job qua stream NDJSON của `GET /api/split/[id]`, gọi onJob mỗi lần trạng thái đổi.
 * Stream đứt giữa chừng (mạng chập chờn, nginx cắt) mà job còn chạy thì tự nối lại — job nằm
 * trên server nên không mất gì.
 *
 * Trả về hàm huỷ theo dõi (gọi khi unmount).
 */
export function watchSplitJob(
  id: string,
  onJob: (job: SplitJob) => void,
  onMissing: (message: string) => void
): () => void {
  const ctrl = new AbortController();
  let stopped = false;
  let lastStatus: SplitJob["status"] | null = null;

  const handleLine = (line: string) => {
    if (!line.trim()) return;
    let ev: JobEvent;
    try {
      ev = JSON.parse(line) as JobEvent;
    } catch {
      return;
    }
    if (ev.type === "job" && ev.job) {
      lastStatus = ev.job.status;
      onJob(ev.job);
    }
  };

  async function run() {
    while (!stopped) {
      try {
        const res = await fetch(`/api/split/${id}`, { cache: "no-store", signal: ctrl.signal });
        if (res.status === 404) {
          onMissing("Không tìm thấy lượt chia team này (có thể đã quá cũ và bị dọn).");
          return;
        }
        if (!res.ok || !res.body) throw new Error("stream lỗi");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          lines.forEach(handleLine);
        }
        handleLine(buffer);
        // server chủ động đóng khi job kết thúc — chỉ nối lại nếu job vẫn đang chạy
        if (stopped || lastStatus !== "running") return;
      } catch {
        if (stopped) return;
      }
      await new Promise((r) => setTimeout(r, RECONNECT_MS));
    }
  }

  void run();
  return () => {
    stopped = true;
    ctrl.abort();
  };
}

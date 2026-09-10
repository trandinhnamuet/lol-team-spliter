import { NextResponse } from "next/server";
import { getSplitJob, subscribeSplitJob } from "@/lib/split-job";
import type { SplitJob } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 3600;

/**
 * Theo dõi một lượt chia team chạy nền. Trả stream NDJSON:
 *   {"type":"job","job":{…}}   — ngay lập tức (ảnh chụp hiện tại), rồi mỗi lần job đổi trạng thái
 *   {"type":"ping"}            — nhịp giữ kết nối mỗi 15s (nginx cắt stream im lặng quá 60s)
 * Stream đóng khi job kết thúc (done/error). Job không tồn tại → 404 JSON.
 *
 * Client ngắt giữa chừng chỉ huỷ stream này, không đụng tới job đang chạy.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const job = await getSplitJob(id);
  if (!job) {
    return NextResponse.json({ error: "Không tìm thấy lượt chia team này" }, { status: 404 });
  }

  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let unsubscribe = () => {};
      // nhịp giữ kết nối, bật ngay cả với job đã xong — close() ở ngay dưới dọn nó đi
      const heartbeat = setInterval(() => send({ type: "ping" }), 15000);

      function close() {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        req.signal.removeEventListener("abort", close);
        try {
          controller.close();
        } catch {
          /* stream đã đóng sẵn */
        }
      }

      function send(obj: unknown) {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        } catch {
          close(); // client đã ngắt
        }
      }

      cleanup = close;
      req.signal.addEventListener("abort", close);

      send({ type: "job", job });
      if (job.status !== "running") {
        close();
        return;
      }

      unsubscribe = subscribeSplitJob(id, (next: SplitJob) => {
        send({ type: "job", job: next });
        if (next.status !== "running") close();
      });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      // tắt buffering của nginx để tiến độ đến client ngay lập tức
      "X-Accel-Buffering": "no",
    },
  });
}

"use client";

import Link from "next/link";
import { use, useEffect, useRef, useState } from "react";
import HexCorners from "@/components/hex/HexCorners";
import MatchFoundModal from "@/components/hex/MatchFoundModal";
import SplitProgressBar from "@/components/hex/SplitProgress";
import TeamResults from "@/components/TeamResults";
import { watchSplitJob } from "@/lib/split-client";
import type { ResolvedPlayer, SplitJob } from "@/lib/types";

/**
 * Trang của một lượt chia team chạy nền. Bấm "chia team" ở trang chủ / trang sự kiện là
 * điều hướng tới đây, nên link trên thanh địa chỉ luôn trỏ đúng lượt đang chạy: đóng tab
 * rồi mở lại link này là xem tiếp được tiến trình, hoặc xem kết quả nếu đã xong.
 */
export default function SplitJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [job, setJob] = useState<SplitJob | null>(null);
  const [missing, setMissing] = useState("");
  const [showFound, setShowFound] = useState(false);
  const [copied, setCopied] = useState(false);
  const [jobUrl, setJobUrl] = useState("");
  const resultsRef = useRef<HTMLDivElement>(null);
  // Chỉ hiện popup "Hoàn thành chia team" cho người đang ngồi chờ, không hiện lại
  // mỗi lần ai đó mở lại link của một lượt đã xong từ trước.
  const watchedRunning = useRef(false);

  useEffect(() => {
    // đặt URL qua microtask để không setState đồng bộ trong effect
    void Promise.resolve().then(() => setJobUrl(window.location.href));
  }, [id]);

  useEffect(() => {
    return watchSplitJob(
      id,
      (next) => {
        setJob(next);
        if (next.status === "running") watchedRunning.current = true;
        else if (next.status === "done" && next.result && watchedRunning.current) {
          watchedRunning.current = false;
          setShowFound(true);
        }
      },
      setMissing
    );
  }, [id]);

  async function copyJobLink() {
    await navigator.clipboard.writeText(jobUrl || window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (missing) {
    return (
      <div className="space-y-4">
        <p className="text-blood-300">{missing}</p>
        <Link href="/" className="hex-btn">
          ⬡ Chia lượt mới
        </Link>
      </div>
    );
  }
  if (!job) {
    return (
      <p className="flex items-center gap-2.5 text-steel-100">
        <span className="hex-spinner" />
        Đang tải…
      </p>
    );
  }

  const failed: ResolvedPlayer[] = job.failed ?? (job.players ?? []).filter((p) => !p.ok);
  const running = job.status === "running";

  return (
    <div className="space-y-7">
      <div className="hex-reveal">
        <p className="hex-kicker">
          {job.source.kind === "event" ? "Chia team từ sự kiện" : "Lượt chia team"}
        </p>
        <h1 className="hex-h1 mt-1.5">
          {job.source.eventName ?? `${job.total} summoner · ${job.teamSize} người/đội`}
        </h1>
        <p className="mt-2 text-sm text-steel-100">
          Bắt đầu lúc {new Date(job.createdAt).toLocaleString("vi-VN")}
          {job.source.eventId && (
            <>
              {" · "}
              <Link href={`/event/${job.source.eventId}`} className="text-magic-300 hover:underline">
                Về trang sự kiện
              </Link>
            </>
          )}
        </p>
      </div>

      {running && (
        <div className="hex-panel hex-reveal relative space-y-3 p-4" style={{ animationDelay: "80ms" }}>
          <HexCorners />
          <SplitProgressBar progress={{ done: job.done, total: job.total, note: job.note }} />
          <p className="text-sm leading-relaxed text-steel-100">
            <span className="font-semibold text-gold-100">Cứ đóng tab thoải mái</span> — lượt chia
            này chạy trên server, không phụ thuộc trình duyệt. Xong là kết quả tự được lưu lại;
            quay lại link dưới đây bất cứ lúc nào để xem tiếp.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="hex-code min-w-0 flex-1 basis-64 truncate">{jobUrl || "…"}</code>
            <button onClick={copyJobLink} className="hex-btn">
              {copied ? <span className="text-magic-300">✓ Đã copy</span> : "Copy link"}
            </button>
          </div>
        </div>
      )}

      {job.status === "error" && (
        <div className="hex-alert hex-reveal space-y-2 p-4">
          <p className="text-sm font-semibold text-blood-300">{job.error}</p>
          <Link href={job.source.eventId ? `/event/${job.source.eventId}` : "/"} className="hex-btn">
            ⬡ Thử chia lại
          </Link>
        </div>
      )}

      {failed.length > 0 && (
        <div className="hex-alert hex-reveal p-4 text-sm">
          <p className="mb-1.5 font-semibold text-blood-300">
            Không xử lý được {failed.length} người (bị loại khỏi kết quả):
          </p>
          <ul className="list-inside list-disc space-y-0.5 text-gold-100/85">
            {failed.map((p, i) => (
              <li key={i}>
                {p.input} — {p.error}
              </li>
            ))}
          </ul>
        </div>
      )}

      {job.result && (
        <div ref={resultsRef} className="scroll-mt-28">
          <TeamResults
            result={job.result}
            failed={failed}
            allowSave={false}
            savedResultId={job.resultId}
          />
        </div>
      )}

      {job.status !== "running" && (
        <div className="hex-reveal flex flex-wrap gap-2">
          <Link href="/" className="hex-btn hex-btn-magic">
            ⬡ Chia lượt mới
          </Link>
          <Link href="/results" className="hex-btn">
            Xem các kết quả đã lưu
          </Link>
        </div>
      )}

      {showFound && job.result && (
        <MatchFoundModal
          subtitle={`${job.result.teams.length} đội · chênh lệch elo ${job.result.spread}`}
          onView={() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          onClose={() => setShowFound(false)}
        />
      )}
    </div>
  );
}

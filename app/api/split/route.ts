import { NextResponse } from "next/server";
import { isKnownRegion } from "@/lib/region";
import { normalizeRiotId } from "@/lib/riot";
import { startSplitJob, type SplitInput } from "@/lib/split-job";
import { getConfig, getEvent } from "@/lib/store";
import type { SplitJobSource } from "@/lib/types";

export const dynamic = "force-dynamic";

interface SplitRequest {
  riotIds?: string[];
  eventId?: string;
  /** Số người mỗi team, mặc định 5. */
  teamSize?: number;
  /** Khu vực/server dùng để tra rank — do client chọn, mặc định theo cấu hình server. */
  platform?: string;
  /** Ước lượng MMR cho người chưa rank qua lịch sử đấu (chậm hơn, tốn thêm request). */
  estimateUnranked?: boolean;
}

/**
 * Nhận danh sách Riot ID (hoặc eventId của link đăng ký) và khởi động một lượt chia team
 * chạy nền, trả về ngay `{ id }` — id của job.
 *
 * Việc tra rank chạy tách khỏi request này, nên đóng tab không dừng nó lại: job chạy tới khi
 * xong rồi tự lưu kết quả. Client chuyển sang `/split/[id]` để xem tiến trình và nối lại
 * bất cứ lúc nào qua `GET /api/split/[id]`.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as SplitRequest;
  const teamSize = Math.floor(Number(body.teamSize));
  if (body.teamSize !== undefined && (!Number.isFinite(teamSize) || teamSize < 1 || teamSize > 20)) {
    return NextResponse.json({ error: "Số người mỗi team phải từ 1 đến 20" }, { status: 400 });
  }
  const cfg = await getConfig();
  if (!cfg.riotApiKey) {
    return NextResponse.json({ error: "Chưa cấu hình Riot API key" }, { status: 503 });
  }
  if (body.platform !== undefined && !isKnownRegion(String(body.platform))) {
    return NextResponse.json({ error: "Khu vực không hợp lệ" }, { status: 400 });
  }
  const platform = body.platform?.toLowerCase() || cfg.platform;

  // Gom input: từ list dán tay hoặc từ sự kiện đăng ký
  let inputs: SplitInput[] = [];
  let source: SplitJobSource = { kind: "list" };
  if (body.eventId) {
    const event = await getEvent(body.eventId);
    if (!event) {
      return NextResponse.json({ error: "Không tìm thấy sự kiện" }, { status: 404 });
    }
    source = { kind: "event", eventId: event.id, eventName: event.name };
    inputs = event.players.map((p) => ({
      label: p.displayName ? `${p.displayName} (${p.riotId})` : p.riotId,
      riotId: p.riotId,
      puuid: p.puuid,
      gameName: p.gameName,
      tagLine: p.tagLine,
    }));
  } else if (Array.isArray(body.riotIds)) {
    inputs = body.riotIds
      .map((s) => normalizeRiotId(String(s)))
      .filter(Boolean)
      .map((riotId) => ({ label: riotId, riotId }));
  }

  if (inputs.length < 2) {
    return NextResponse.json({ error: "Cần ít nhất 2 người chơi" }, { status: 400 });
  }
  if (inputs.length > 100) {
    return NextResponse.json({ error: "Tối đa 100 người chơi mỗi lần" }, { status: 400 });
  }

  const job = await startSplitJob({
    inputs,
    cfg,
    platform,
    teamSize: body.teamSize !== undefined ? teamSize : undefined,
    estimateUnranked: Boolean(body.estimateUnranked),
    source,
  });

  return NextResponse.json({ id: job.id, total: job.total }, { status: 202 });
}

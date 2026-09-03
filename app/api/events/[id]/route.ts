import { NextResponse } from "next/server";
import { deleteEvent, getEvent, updateEvent } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const event = await getEvent(id);
  if (!event) {
    return NextResponse.json({ error: "Không tìm thấy sự kiện" }, { status: 404 });
  }
  return NextResponse.json({ event });
}

/** Đóng/mở đăng ký hoặc xoá người chơi khỏi danh sách. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    open?: boolean;
    removePuuid?: string;
  };
  const result = await updateEvent(id, (e) => ({
    ...e,
    open: typeof body.open === "boolean" ? body.open : e.open,
    players: body.removePuuid ? e.players.filter((p) => p.puuid !== body.removePuuid) : e.players,
  }));
  if (typeof result === "string") {
    return NextResponse.json({ error: result }, { status: 404 });
  }
  return NextResponse.json({ event: result });
}

/** Xoá hẳn sự kiện — mất luôn danh sách đã đăng ký, không hoàn lại được. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const removed = await deleteEvent(id);
  if (!removed) {
    return NextResponse.json({ error: "Không tìm thấy sự kiện" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

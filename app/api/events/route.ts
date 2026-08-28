import { NextResponse } from "next/server";
import { createEvent, listEvents } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const events = await listEvents();
  return NextResponse.json({
    events: events.map((e) => ({
      id: e.id,
      name: e.name,
      createdAt: e.createdAt,
      open: e.open,
      playerCount: e.players.length,
    })),
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { name?: string };
  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "Thiếu tên sự kiện" }, { status: 400 });
  }
  const event = await createEvent(name);
  return NextResponse.json({ event });
}

import { NextResponse } from "next/server";
import { getResult } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const saved = await getResult(id);
  if (!saved) {
    return NextResponse.json({ error: "Không tìm thấy kết quả" }, { status: 404 });
  }
  return NextResponse.json({ saved });
}

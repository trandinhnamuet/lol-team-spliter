import { NextResponse } from "next/server";
import { defaultEloMap } from "@/lib/elo";
import { getConfig, saveConfig } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const cfg = await getConfig();
  return NextResponse.json({ eloMap: cfg.eloMap, platform: cfg.platform });
}

export async function PUT(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    eloMap?: Record<string, number>;
    reset?: boolean;
  };
  if (body.reset) {
    const cfg = await saveConfig({ eloMap: defaultEloMap() });
    return NextResponse.json({ eloMap: cfg.eloMap });
  }
  if (!body.eloMap || typeof body.eloMap !== "object") {
    return NextResponse.json({ error: "Thiếu eloMap" }, { status: 400 });
  }
  const clean: Record<string, number> = {};
  for (const [k, v] of Object.entries(body.eloMap)) {
    const num = Number(v);
    if (!Number.isFinite(num) || num < 0) {
      return NextResponse.json({ error: `Giá trị elo không hợp lệ cho ${k}` }, { status: 400 });
    }
    clean[k] = Math.round(num);
  }
  const cfg = await saveConfig({ eloMap: { ...defaultEloMap(), ...clean } });
  return NextResponse.json({ eloMap: cfg.eloMap });
}

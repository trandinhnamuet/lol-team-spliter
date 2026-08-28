import { NextResponse } from "next/server";
import { checkKeyStatus } from "@/lib/riot";
import { getConfig, saveConfig } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Trạng thái key hiện tại (không bao giờ trả key ra client, chỉ trả 4 ký tự cuối). */
export async function GET() {
  const cfg = await getConfig();
  const status = await checkKeyStatus(cfg.riotApiKey, cfg.platform);
  return NextResponse.json({
    status,
    platform: cfg.platform,
    keyHint: cfg.riotApiKey ? `...${cfg.riotApiKey.slice(-4)}` : null,
  });
}

/** Nhập key mới: kiểm tra key hợp lệ trước khi lưu. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    apiKey?: string;
    platform?: string;
  };
  const apiKey = body.apiKey?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "Thiếu API key" }, { status: 400 });
  }
  const cfg = await getConfig();
  const platform = body.platform?.trim().toLowerCase() || cfg.platform;
  const status = await checkKeyStatus(apiKey, platform);
  if (status !== "valid") {
    return NextResponse.json(
      { error: "Key không hợp lệ hoặc đã hết hạn", status },
      { status: 400 }
    );
  }
  await saveConfig({ riotApiKey: apiKey, platform });
  return NextResponse.json({ status: "valid", keyHint: `...${apiKey.slice(-4)}` });
}

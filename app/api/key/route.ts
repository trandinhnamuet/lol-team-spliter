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

  // Key vừa tạo trên portal Riot thường mất vài giây mới kích hoạt (trong lúc đó trả 403),
  // nên thử lại vài nhịp trước khi kết luận là key hỏng.
  let status = await checkKeyStatus(apiKey, platform);
  for (let attempt = 0; attempt < 3 && status !== "valid"; attempt++) {
    await new Promise((r) => setTimeout(r, 2000));
    status = await checkKeyStatus(apiKey, platform);
  }

  if (status !== "valid") {
    return NextResponse.json(
      {
        error:
          status === "invalid"
            ? "Riot từ chối key này (401/403). Kiểm tra đã copy đủ chuỗi RGAPI-… chưa, và key mới tạo có thể cần vài giây để kích hoạt — thử lại sau ít giây."
            : "Không kết nối được tới Riot API để kiểm tra key. Thử lại sau ít giây.",
        status,
      },
      { status: 400 }
    );
  }

  await saveConfig({ riotApiKey: apiKey, platform });
  return NextResponse.json({ status: "valid", keyHint: `...${apiKey.slice(-4)}` });
}

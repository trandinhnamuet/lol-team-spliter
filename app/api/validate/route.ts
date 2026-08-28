import { NextResponse } from "next/server";
import { getAccountByRiotId, parseRiotId, RiotApiError } from "@/lib/riot";
import { getConfig } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Kiểm tra 1 Riot ID (Tên#TAG) có tồn tại không — dùng cho form đăng ký. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { riotId?: string };
  const parsed = parseRiotId(body.riotId ?? "");
  if (!parsed) {
    return NextResponse.json({
      valid: false,
      error: "Sai định dạng. Nhập dạng: TênInGame#TAG (ví dụ: Faker#KR1)",
    });
  }
  const cfg = await getConfig();
  if (!cfg.riotApiKey) {
    return NextResponse.json(
      { valid: false, error: "Server chưa cấu hình Riot API key" },
      { status: 503 }
    );
  }
  try {
    const account = await getAccountByRiotId(
      cfg.riotApiKey,
      cfg.platform,
      parsed.gameName,
      parsed.tagLine
    );
    if (!account) {
      return NextResponse.json({ valid: false, error: "Không tìm thấy tài khoản này" });
    }
    return NextResponse.json({
      valid: true,
      gameName: account.gameName,
      tagLine: account.tagLine,
    });
  } catch (e) {
    const msg = e instanceof RiotApiError ? e.message : "Lỗi khi gọi Riot API";
    const status = e instanceof RiotApiError && (e.status === 401 || e.status === 403) ? 503 : 502;
    return NextResponse.json({ valid: false, error: msg }, { status });
  }
}

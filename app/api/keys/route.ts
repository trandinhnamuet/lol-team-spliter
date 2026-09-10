import { NextResponse } from "next/server";
import { checkKeyStatus, getRankByPuuid, RiotApiError } from "@/lib/riot";
import { getLimiter, snapshotKeys } from "@/lib/riot-limiter";
import { isDbConfigured, query } from "@/lib/stats/db";
import { allRiotKeys, getConfig, saveConfig } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Thăm dò phạm vi key so với kho: gọi league-v4 với một PUUID đã có trong kho. Thành công → cùng
 * tài khoản Riot Developer (identity); 400 "Exception decrypting" → khác tài khoản, chỉ tải trận.
 * riotFetch tự đánh dấu vào limiter; hàm chỉ trả về nhãn để báo cho người dùng.
 */
async function probeScope(key: string): Promise<"identity" | "matches-only" | null> {
  if (!isDbConfigured()) return null;
  try {
    const rows = await query<{ puuid: string; platform: string }>(
      "SELECT puuid, platform FROM lol.players WHERE rank_fetched_at IS NOT NULL ORDER BY updated_at DESC LIMIT 1"
    );
    if (!rows[0]) return null;
    await getRankByPuuid(key, rows[0].platform, rows[0].puuid);
  } catch (e) {
    if (!(e instanceof RiotApiError && e.code === "decrypt")) return getLimiter(key).scope;
  }
  return getLimiter(key).scope;
}

/** Danh sách key (che, chỉ 4 ký tự cuối) + trạng thái rate limit từng key. */
export async function GET() {
  const cfg = await getConfig();
  return NextResponse.json({ keys: snapshotKeys(allRiotKeys(cfg), cfg.riotApiKey) });
}

/**
 * Thêm một hoặc nhiều key phụ (mỗi dòng một key). Key được kiểm tra với Riot trước khi lưu;
 * key trùng bị bỏ qua. Trả về danh sách key hợp lệ đã thêm và key bị từ chối.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { apiKeys?: string | string[] };
  const raw = Array.isArray(body.apiKeys) ? body.apiKeys : String(body.apiKeys ?? "").split(/[\s,;]+/);
  const candidates = Array.from(new Set(raw.map((k) => k.trim()).filter(Boolean)));
  if (candidates.length === 0) return NextResponse.json({ error: "Chưa nhập key nào" }, { status: 400 });
  if (candidates.length > 20) return NextResponse.json({ error: "Tối đa 20 key mỗi lần" }, { status: 400 });

  const cfg = await getConfig();
  const existing = new Set(allRiotKeys(cfg));
  const added: string[] = [];
  const addedScopes: { hint: string; scope: "identity" | "matches-only" | null }[] = [];
  const rejected: { hint: string; reason: string }[] = [];
  for (const key of candidates) {
    if (existing.has(key)) {
      rejected.push({ hint: `...${key.slice(-4)}`, reason: "Đã có trong danh sách" });
      continue;
    }
    getLimiter(key).reset();
    let status = await checkKeyStatus(key, cfg.platform);
    // key mới tạo có thể cần vài giây để kích hoạt
    for (let i = 0; i < 2 && status !== "valid"; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      status = await checkKeyStatus(key, cfg.platform);
    }
    if (status === "valid") {
      added.push(key);
      existing.add(key);
      addedScopes.push({ hint: `...${key.slice(-4)}`, scope: await probeScope(key) });
    } else {
      rejected.push({
        hint: `...${key.slice(-4)}`,
        reason: status === "invalid" ? "Riot từ chối (401/403)" : "Không kiểm tra được với Riot",
      });
    }
  }
  if (added.length > 0) {
    await saveConfig({ riotApiKeys: [...cfg.riotApiKeys, ...added] });
  }
  const next = await getConfig();
  return NextResponse.json({
    added: added.map((k) => `...${k.slice(-4)}`),
    addedScopes,
    rejected,
    keys: snapshotKeys(allRiotKeys(next), next.riotApiKey),
  });
}

/** Xoá key phụ theo 4 ký tự cuối (hint). Không xoá được key chính — đổi nó ở thanh trên cùng. */
export async function DELETE(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { hint?: string };
  const hint = String(body.hint ?? "").replace(/^\.+/, "");
  if (!hint) return NextResponse.json({ error: "Thiếu hint" }, { status: 400 });
  const cfg = await getConfig();
  const remaining = cfg.riotApiKeys.filter((k) => !k.endsWith(hint) || k === cfg.riotApiKey);
  if (remaining.length === cfg.riotApiKeys.length) {
    return NextResponse.json({ error: "Không tìm thấy key phụ này" }, { status: 404 });
  }
  const next = await saveConfig({ riotApiKeys: remaining });
  return NextResponse.json({ keys: snapshotKeys(allRiotKeys(next), next.riotApiKey) });
}

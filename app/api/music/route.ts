import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MUSIC_DIR = path.join(process.cwd(), "public", "music-theme");
const AUDIO_EXT = new Set([".mp3", ".ogg", ".m4a", ".wav"]);

/** Bỏ phần mở rộng, gộp " - " / "_" thành khoảng trắng đơn để làm tên hiển thị gọn hơn tên file gốc. */
function titleFromFilename(file: string): string {
  return path
    .basename(file, path.extname(file))
    .replace(/\s*-\s*/g, " ")
    .replace(/_+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Danh sách bài nhạc nền trong public/music-theme, dùng để client bốc ngẫu nhiên 1 bài. */
export async function GET() {
  let entries: string[];
  try {
    entries = await fs.readdir(MUSIC_DIR);
  } catch {
    return NextResponse.json({ tracks: [] });
  }
  const tracks = entries
    .filter((f) => AUDIO_EXT.has(path.extname(f).toLowerCase()))
    .sort()
    .map((file) => ({ file, title: titleFromFilename(file) }));
  return NextResponse.json({ tracks });
}

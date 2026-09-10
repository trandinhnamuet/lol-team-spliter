import { getDdragonVersion } from "./riot";

export interface ChampionMeta {
  /** Id dạng chữ dùng trong URL ảnh Data Dragon (Aatrox, MonkeyKing, FiddleSticks...). */
  id: string;
  /** Tên hiển thị (tiếng Việt từ Data Dragon vi_VN). */
  name: string;
  /** Chức danh — "Quỷ Kiếm Darkin". */
  title: string;
}

interface DdragonChampionFile {
  data: Record<string, { id: string; key: string; name: string; title: string }>;
}

// Cache theo tiến trình: danh sách tướng đổi ~2 tuần/lần theo patch.
let cache: { version: string; byKey: Map<number, ChampionMeta>; fetchedAt: number } | null = null;
const TTL_MS = 6 * 60 * 60 * 1000;

/** Map championId (số) → meta tướng, lấy từ Data Dragon (locale vi_VN, fallback en_US). */
export async function getChampionIndex(): Promise<{ version: string; byKey: Map<number, ChampionMeta> }> {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) return cache;
  const version = await getDdragonVersion();
  for (const locale of ["vi_VN", "en_US"]) {
    try {
      const res = await fetch(
        `https://ddragon.leagueoflegends.com/cdn/${version}/data/${locale}/champion.json`,
        { cache: "no-store" }
      );
      if (!res.ok) continue;
      const file = (await res.json()) as DdragonChampionFile;
      const byKey = new Map<number, ChampionMeta>();
      for (const c of Object.values(file.data)) {
        byKey.set(Number(c.key), { id: c.id, name: c.name, title: c.title });
      }
      if (byKey.size > 0) {
        cache = { version, byKey, fetchedAt: Date.now() };
        return cache;
      }
    } catch {
      /* thử locale tiếp theo / giữ cache cũ */
    }
  }
  if (cache) return cache;
  return { version, byKey: new Map() };
}

/** URL ảnh vuông của tướng trên CDN Data Dragon. */
export function championIconUrl(version: string, championIdSlug: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${championIdSlug}.png`;
}

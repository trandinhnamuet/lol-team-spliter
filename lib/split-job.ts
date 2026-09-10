import { promises as fs } from "fs";
import path from "path";
import { balanceTeams } from "./balance";
import { eloForLevel, eloForRank } from "./elo";
import { estimateEloFromMatches } from "./mmr-estimate";
import { beginForeground } from "./riot-priority";
import {
  getAccountByRiotId,
  getDdragonVersion,
  getRankByPuuid,
  getSummonerByPuuid,
  parseRiotId,
  profileIconUrl,
  RiotApiError,
} from "./riot";
import { saveResult } from "./store";
import type { AppConfig, ResolvedPlayer, SplitJob, SplitJobSource } from "./types";

/**
 * Sổ đăng ký các lượt chia team chạy nền.
 *
 * Route `POST /api/split` chỉ tạo job rồi trả id ngay; vòng lặp tra rank chạy tách khỏi request
 * nên đóng tab không ảnh hưởng gì — job vẫn chạy tới khi xong rồi tự lưu kết quả vào results.json.
 * Client theo dõi qua `GET /api/split/[id]` (stream NDJSON) và nối lại được bất cứ lúc nào từ
 * link `/split/[id]`.
 *
 * Trạng thái nằm trên globalThis (một tiến trình pm2 fork phục vụ mọi route) và được ghi xuống
 * data/jobs.json để sau khi server restart vẫn còn lịch sử — job đang chạy dở lúc restart bị
 * đánh dấu lỗi khi nạp lại, vì tiến trình cũ đã chết cùng vòng lặp của nó.
 */

const JOBS_FILE = path.join(process.cwd(), "data", "jobs.json");
/** Giữ tối đa bấy nhiêu job gần nhất (job đang chạy luôn được giữ). */
const MAX_JOBS = 100;
/** Tiến độ nhảy liên tục — gộp ghi đĩa lại, tránh ghi file sau mỗi người chơi. */
const PERSIST_THROTTLE_MS = 1500;

type Listener = (job: SplitJob) => void;

interface Entry {
  job: SplitJob;
  listeners: Set<Listener>;
}

interface Registry {
  jobs: Map<string, Entry>;
  loaded: Promise<void> | null;
  timer: ReturnType<typeof setTimeout> | null;
  writing: Promise<void>;
}

declare global {
  var __splitJobs: Registry | undefined;
}

function reg(): Registry {
  if (!globalThis.__splitJobs) {
    globalThis.__splitJobs = {
      jobs: new Map(),
      loaded: null,
      timer: null,
      writing: Promise.resolve(),
    };
  }
  return globalThis.__splitJobs;
}

async function loadFromDisk() {
  const r = reg();
  let saved: SplitJob[];
  try {
    saved = JSON.parse(await fs.readFile(JOBS_FILE, "utf-8")) as SplitJob[];
  } catch {
    return; // chưa có file (lần chạy đầu) hoặc file hỏng — coi như chưa có job nào
  }
  if (!Array.isArray(saved)) return;
  for (const job of saved) {
    // job đang chạy trong tiến trình này luôn thắng bản trên đĩa (bản đĩa có thể cũ hơn)
    if (!job?.id || r.jobs.has(job.id)) continue;
    r.jobs.set(job.id, {
      job:
        job.status === "running"
          ? {
              ...job,
              status: "error",
              error: "Server khởi động lại khi đang chia — hãy chia lại lượt mới.",
              finishedAt: new Date().toISOString(),
            }
          : job,
      listeners: new Set(),
    });
  }
}

async function ensureLoaded() {
  const r = reg();
  if (!r.loaded) r.loaded = loadFromDisk();
  await r.loaded;
}

async function persist() {
  const r = reg();
  const all = [...r.jobs.values()]
    .map((e) => e.job)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const kept = all.slice(-MAX_JOBS);
  const keptIds = new Set(kept.map((j) => j.id));
  for (const job of all) {
    if (job.status === "running" && !keptIds.has(job.id)) {
      kept.push(job); // không bao giờ dọn job đang chạy dở
      keptIds.add(job.id);
    }
  }
  for (const id of [...r.jobs.keys()]) if (!keptIds.has(id)) r.jobs.delete(id);

  // nối đuôi nhau để hai lượt ghi không xen kẽ trên cùng file tạm
  r.writing = r.writing
    .catch(() => {})
    .then(async () => {
      await fs.mkdir(path.dirname(JOBS_FILE), { recursive: true });
      const tmp = `${JOBS_FILE}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(kept, null, 2), "utf-8");
      await fs.rename(tmp, JOBS_FILE);
    })
    .catch(() => {
      /* mất lịch sử trên đĩa không đáng để làm hỏng lượt chia đang chạy */
    });
  await r.writing;
}

function schedulePersist(immediate = false) {
  const r = reg();
  if (immediate) {
    if (r.timer) {
      clearTimeout(r.timer);
      r.timer = null;
    }
    void persist();
    return;
  }
  if (r.timer) return;
  r.timer = setTimeout(() => {
    r.timer = null;
    void persist();
  }, PERSIST_THROTTLE_MS);
}

/** Cập nhật job, báo cho mọi client đang theo dõi rồi hẹn ghi đĩa. */
function update(id: string, patch: Partial<SplitJob>, persistNow = false) {
  const entry = reg().jobs.get(id);
  if (!entry) return;
  entry.job = { ...entry.job, ...patch };
  for (const fn of entry.listeners) {
    try {
      fn(entry.job);
    } catch {
      /* một client lỗi không được làm hỏng job */
    }
  }
  schedulePersist(persistNow);
}

export async function getSplitJob(id: string): Promise<SplitJob | null> {
  await ensureLoaded();
  return reg().jobs.get(id)?.job ?? null;
}

/** Theo dõi thay đổi của job. Trả về hàm huỷ theo dõi. */
export function subscribeSplitJob(id: string, fn: Listener): () => void {
  const entry = reg().jobs.get(id);
  if (!entry) return () => {};
  entry.listeners.add(fn);
  return () => {
    entry.listeners.delete(fn);
  };
}

export interface SplitInput {
  /** Nhãn hiển thị: "Tên hiển thị (Tên#TAG)" với người đăng ký, hoặc chính Riot ID. */
  label: string;
  riotId: string;
  puuid?: string;
  gameName?: string;
  tagLine?: string;
}

export interface StartSplitOptions {
  inputs: SplitInput[];
  cfg: AppConfig;
  platform: string;
  /** Không truyền thì dùng mặc định của balanceTeams. */
  teamSize?: number;
  estimateUnranked: boolean;
  source: SplitJobSource;
}

/**
 * Tạo job rồi chạy nền ngay, trả về job ở trạng thái "running" để route trả id cho client.
 * Cố ý không await vòng lặp — đó chính là điểm khiến job sống sót khi client ngắt kết nối.
 */
export async function startSplitJob(opts: StartSplitOptions): Promise<SplitJob> {
  await ensureLoaded();
  const job: SplitJob = {
    id: crypto.randomUUID().slice(0, 8),
    createdAt: new Date().toISOString(),
    status: "running",
    source: opts.source,
    teamSize: opts.teamSize ?? DEFAULT_JOB_TEAM_SIZE,
    platform: opts.platform,
    estimateUnranked: opts.estimateUnranked,
    done: 0,
    total: opts.inputs.length,
  };
  reg().jobs.set(job.id, { job, listeners: new Set() });
  schedulePersist(true);
  void runJob(job.id, opts);
  return job;
}

/** Chỉ để hiển thị trên trang job khi client không gửi teamSize. */
const DEFAULT_JOB_TEAM_SIZE = 5;

async function runJob(id: string, opts: StartSplitOptions) {
  const { inputs, cfg, platform } = opts;
  // Ưu tiên Riot API cho lượt chia team: crawler thống kê nền tạm ngừng gọi Riot cho tới khi xong
  const endForeground = beginForeground();
  let done = 0;
  const resolved: ResolvedPlayer[] = [];
  try {
    const ddVersion = await getDdragonVersion();
    // Cache tra rank người-cùng-trận khi ước lượng MMR, dùng chung cả job
    // (người chơi trong danh sách cũng được seed vào để khỏi tra lại).
    const leagueCache = new Map<string, number | null>();

    for (const input of inputs) {
      try {
        let puuid = input.puuid;
        let gameName: string | undefined = input.gameName;
        let tagLine: string | undefined = input.tagLine;

        if (!puuid) {
          const parsed = parseRiotId(input.riotId);
          if (!parsed) {
            resolved.push({ input: input.label, ok: false, error: "Sai định dạng Tên#TAG" });
            update(id, { done: ++done });
            continue;
          }
          const account = await getAccountByRiotId(
            cfg.riotApiKey,
            platform,
            parsed.gameName,
            parsed.tagLine
          );
          if (!account) {
            resolved.push({ input: input.label, ok: false, error: "Không tìm thấy tài khoản" });
            update(id, { done: ++done });
            continue;
          }
          puuid = account.puuid;
          gameName = account.gameName;
          tagLine = account.tagLine;
        }

        const rank = await getRankByPuuid(cfg.riotApiKey, platform, puuid);

        // Icon + cấp độ tài khoản: lấy trước vì cấp độ còn dùng làm fallback ước lượng
        let avatarUrl: string | undefined;
        let summonerLevel: number | undefined;
        try {
          const summoner = await getSummonerByPuuid(cfg.riotApiKey, platform, puuid);
          if (summoner) {
            avatarUrl = profileIconUrl(ddVersion, summoner.profileIconId);
            summonerLevel = summoner.summonerLevel;
          }
        } catch {
          /* bỏ qua — hiển thị không có avatar */
        }

        let elo = eloForRank(rank, cfg.eloMap);
        let eloEstimated: boolean | undefined;
        let eloSource: "match" | "level" | undefined;
        let estimateSamples: number | undefined;
        if (rank.tier !== "UNRANKED") {
          leagueCache.set(puuid, elo);
        } else if (opts.estimateUnranked) {
          // Chưa rank + bật ước lượng: tra lịch sử đấu để đoán MMR (chậm, có thể fail êm)
          update(id, { note: `Đang ước lượng MMR cho ${input.label}…` });
          const est = await estimateEloFromMatches({
            apiKey: cfg.riotApiKey,
            platform,
            puuid,
            eloMap: cfg.eloMap,
            leagueCache,
            label: input.label,
          });
          if (est) {
            elo = est.elo;
            eloEstimated = true;
            eloSource = "match";
            estimateSamples = est.samples;
          } else if (typeof summonerLevel === "number" && summonerLevel > 0) {
            // Không có lịch sử đấu dùng được → gán elo theo cấp độ tài khoản
            elo = eloForLevel(summonerLevel, cfg.eloMap);
            eloEstimated = true;
            eloSource = "level";
            console.log(
              `[mmr-estimate] ${input.label}: fallback theo cấp độ ${summonerLevel} → elo ${elo}`
            );
          }
        }

        resolved.push({
          input: input.label,
          ok: true,
          gameName,
          tagLine,
          puuid,
          rank,
          elo,
          avatarUrl,
          summonerLevel,
          eloEstimated,
          eloSource,
          estimateSamples,
        });
      } catch (e) {
        if (e instanceof RiotApiError && (e.status === 401 || e.status === 403)) {
          fail(id, "Riot API key hết hạn hoặc không hợp lệ. Vào Admin để nhập key mới.", resolved);
          return;
        }
        const msg = e instanceof RiotApiError ? e.message : "Lỗi khi gọi Riot API";
        resolved.push({ input: input.label, ok: false, error: msg });
      }
      update(id, { done: ++done, note: undefined });
    }

    const okPlayers = resolved.filter((p) => p.ok);
    const failed = resolved.filter((p) => !p.ok);
    if (okPlayers.length < 2) {
      fail(id, "Không đủ người chơi hợp lệ để chia team", resolved);
      return;
    }

    const result = { ...balanceTeams(okPlayers, opts.teamSize), platform };

    // Tự lưu ngay khi xong: người bấm chia có thể đã đóng tab từ lâu, kết quả vẫn phải còn lại.
    let resultId: string | undefined;
    try {
      resultId = (await saveResult(result, failed)).id;
    } catch {
      /* không lưu được thì kết quả vẫn nằm trong job */
    }

    update(
      id,
      {
        status: "done",
        finishedAt: new Date().toISOString(),
        done: inputs.length,
        note: undefined,
        players: resolved,
        failed,
        result,
        resultId,
      },
      true
    );
  } catch {
    fail(id, "Lỗi không xác định trên server", resolved);
  } finally {
    endForeground();
  }
}

function fail(id: string, error: string, players: ResolvedPlayer[]) {
  update(
    id,
    {
      status: "error",
      finishedAt: new Date().toISOString(),
      note: undefined,
      error,
      players,
      failed: players.filter((p) => !p.ok),
    },
    true
  );
}

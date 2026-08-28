import { promises as fs } from "fs";
import path from "path";
import { defaultEloMap } from "./elo";
import type { AppConfig, TournamentEvent } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const CONFIG_FILE = path.join(DATA_DIR, "config.json");
const EVENTS_FILE = path.join(DATA_DIR, "events.json");

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(file: string, value: unknown) {
  await ensureDir();
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), "utf-8");
  await fs.rename(tmp, file);
}

export async function getConfig(): Promise<AppConfig> {
  const fallback: AppConfig = {
    riotApiKey: process.env.RIOT_API_KEY ?? "",
    platform: "vn2",
    eloMap: defaultEloMap(),
  };
  const cfg = await readJson<Partial<AppConfig>>(CONFIG_FILE, {});
  return {
    riotApiKey: cfg.riotApiKey ?? fallback.riotApiKey,
    platform: cfg.platform ?? fallback.platform,
    // merge để rank mới (nếu Riot thêm) vẫn có giá trị mặc định
    eloMap: { ...fallback.eloMap, ...(cfg.eloMap ?? {}) },
  };
}

export async function saveConfig(patch: Partial<AppConfig>): Promise<AppConfig> {
  const current = await getConfig();
  const next: AppConfig = {
    riotApiKey: patch.riotApiKey ?? current.riotApiKey,
    platform: patch.platform ?? current.platform,
    eloMap: patch.eloMap ?? current.eloMap,
  };
  await writeJson(CONFIG_FILE, next);
  return next;
}

export async function listEvents(): Promise<TournamentEvent[]> {
  return readJson<TournamentEvent[]>(EVENTS_FILE, []);
}

export async function getEvent(id: string): Promise<TournamentEvent | null> {
  const events = await listEvents();
  return events.find((e) => e.id === id) ?? null;
}

export async function createEvent(name: string): Promise<TournamentEvent> {
  const events = await listEvents();
  const event: TournamentEvent = {
    id: crypto.randomUUID().slice(0, 8),
    name,
    createdAt: new Date().toISOString(),
    open: true,
    players: [],
  };
  events.push(event);
  await writeJson(EVENTS_FILE, events);
  return event;
}

export async function updateEvent(
  id: string,
  updater: (e: TournamentEvent) => TournamentEvent | string
): Promise<TournamentEvent | string> {
  const events = await listEvents();
  const idx = events.findIndex((e) => e.id === id);
  if (idx === -1) return "Không tìm thấy sự kiện";
  const result = updater(events[idx]);
  if (typeof result === "string") return result;
  events[idx] = result;
  await writeJson(EVENTS_FILE, events);
  return result;
}

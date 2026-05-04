import type { LeaderboardEntry, WeaponArchetypeId } from "../types";

const STORAGE_KEY = "voidline:leaderboard:v1";
const MAX_ENTRIES = 5;

interface LeaderboardStorage {
  daily: Record<string, LeaderboardEntry[]>;
  allTime: LeaderboardEntry[];
}

function emptyStorage(): LeaderboardStorage {
  return { daily: {}, allTime: [] };
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function getStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function load(storage: StorageLike | null = getStorage()): LeaderboardStorage {
  if (!storage) return emptyStorage();
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return emptyStorage();
  try {
    const parsed = JSON.parse(raw) as Partial<LeaderboardStorage>;
    return {
      daily: sanitizeDaily(parsed.daily),
      allTime: sanitizeList(parsed.allTime),
    };
  } catch {
    return emptyStorage();
  }
}

function save(data: LeaderboardStorage, storage: StorageLike | null = getStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

function sanitizeEntry(raw: unknown): LeaderboardEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<LeaderboardEntry>;
  if (typeof r.score !== "number" || typeof r.miniWave !== "number") return null;
  if (typeof r.elapsedSeconds !== "number") return null;
  if (typeof r.starterWeaponId !== "string") return null;
  if (typeof r.seed !== "string") return null;
  return {
    score: Math.max(0, Math.floor(r.score)),
    miniWave: Math.max(0, Math.floor(r.miniWave)),
    bossDefeated: Boolean(r.bossDefeated),
    starterWeaponId: r.starterWeaponId as WeaponArchetypeId,
    elapsedSeconds: Math.max(0, Math.floor(r.elapsedSeconds)),
    date: typeof r.date === "string" ? r.date : "",
    seed: r.seed,
  };
}

function sanitizeList(raw: unknown): LeaderboardEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(sanitizeEntry)
    .filter((entry): entry is LeaderboardEntry => entry !== null)
    .sort(compareEntries)
    .slice(0, MAX_ENTRIES);
}

function sanitizeDaily(raw: unknown): Record<string, LeaderboardEntry[]> {
  if (!raw || typeof raw !== "object") return {};
  const result: Record<string, LeaderboardEntry[]> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    result[key] = sanitizeList(value);
  }
  return result;
}

export function compareEntries(a: LeaderboardEntry, b: LeaderboardEntry): number {
  if (a.bossDefeated !== b.bossDefeated) return a.bossDefeated ? -1 : 1;
  if (a.score !== b.score) return b.score - a.score;
  return a.elapsedSeconds - b.elapsedSeconds;
}

export interface LeaderboardSubmitResult {
  dailyRank: number | null;
  allTimeRank: number | null;
  isPersonalDailyBest: boolean;
}

export function submitEntry(entry: LeaderboardEntry): LeaderboardSubmitResult {
  const data = load();
  const dailyKey = entry.seed;
  const dailyList = data.daily[dailyKey] ?? [];
  const previousBest = dailyList[0]?.score ?? -1;
  dailyList.push(entry);
  dailyList.sort(compareEntries);
  data.daily[dailyKey] = dailyList.slice(0, MAX_ENTRIES);
  data.allTime.push(entry);
  data.allTime.sort(compareEntries);
  data.allTime = data.allTime.slice(0, MAX_ENTRIES);
  save(data);
  const matches = (e: LeaderboardEntry): boolean =>
    e.score === entry.score &&
    e.elapsedSeconds === entry.elapsedSeconds &&
    e.starterWeaponId === entry.starterWeaponId &&
    e.bossDefeated === entry.bossDefeated &&
    e.date === entry.date;
  const dailyRank = data.daily[dailyKey]!.findIndex(matches);
  const allRank = data.allTime.findIndex(matches);
  return {
    dailyRank: dailyRank >= 0 ? dailyRank + 1 : null,
    allTimeRank: allRank >= 0 ? allRank + 1 : null,
    isPersonalDailyBest: entry.score > previousBest,
  };
}

export function getDailyLeaderboard(seed: string): LeaderboardEntry[] {
  return load().daily[seed] ?? [];
}

export function getAllTimeLeaderboard(): LeaderboardEntry[] {
  return load().allTime;
}

export function clearLeaderboard(storage: StorageLike | null = getStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(emptyStorage()));
  } catch {
    // ignore
  }
}

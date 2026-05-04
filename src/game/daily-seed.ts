export function getDailySeedString(date: Date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export type SeedSource = "server" | "offline";

export interface ResolvedDailySeed {
  date: string;
  seed: number;
  source: SeedSource;
}

const STORAGE_KEY_PREFIX = "voidline:seed:";
let cachedSeed: ResolvedDailySeed | null = null;

export function getCachedSeed(): ResolvedDailySeed | null {
  return cachedSeed;
}

function readStorage(date: string): number | null {
  try {
    const raw = window.localStorage.getItem(`${STORAGE_KEY_PREFIX}${date}`);
    if (!raw) return null;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return null;
    return parsed >>> 0;
  } catch {
    return null;
  }
}

function writeStorage(date: string, seed: number): void {
  try {
    window.localStorage.setItem(`${STORAGE_KEY_PREFIX}${date}`, String(seed >>> 0));
  } catch {
    /* ignore */
  }
}

export async function bootstrapDailySeed(
  fetcher: () => Promise<{ date: string; seed: number }>,
  timeoutMs = 2500,
): Promise<ResolvedDailySeed> {
  const offlineDate = getDailySeedString();
  try {
    const result = await Promise.race<{ date: string; seed: number }>([
      fetcher(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("seed fetch timeout")), timeoutMs)),
    ]);
    const seed = result.seed >>> 0;
    cachedSeed = { date: result.date, seed, source: "server" };
    writeStorage(result.date, seed);
    return cachedSeed;
  } catch {
    const stored = readStorage(offlineDate);
    if (stored != null) {
      cachedSeed = { date: offlineDate, seed: stored, source: "offline" };
      return cachedSeed;
    }
    cachedSeed = {
      date: offlineDate,
      seed: hashSeedString(offlineDate),
      source: "offline",
    };
    return cachedSeed;
  }
}

export function setCachedSeedForTest(value: ResolvedDailySeed | null): void {
  cachedSeed = value;
}

export function hashSeedString(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h || 1;
}

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface RngHandle {
  next(): number;
  range(min: number, max: number): number;
  pick<T>(list: readonly T[]): T;
  state(): number;
}

export function createRng(seed: number): RngHandle {
  let state = seed >>> 0;
  if (state === 0) state = 1;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range(min, max) {
      return min + (max - min) * next();
    },
    pick(list) {
      if (list.length === 0) throw new Error("pick() on empty list");
      const idx = Math.floor(next() * list.length);
      return list[Math.min(list.length - 1, idx)]!;
    },
    state() {
      return state;
    },
  };
}

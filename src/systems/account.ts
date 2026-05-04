import type {
  AccountProgress,
  AccountReward,
  AccountRunSummary,
} from "../types";
import { MINI_WAVE_COUNT } from "../game/balance";

const STORAGE_KEY = "voidline:metaProgress:v3";
const LEGACY_STORAGE_KEY = "voidline:metaProgress:v2";

interface AccountStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const accountProgress: AccountProgress = createDefaultAccountProgress();

function createDefaultAccountProgress(): AccountProgress {
  return {
    records: {
      bestMiniWave: 0,
      bestScore: 0,
      bestTimeSeconds: 0,
      bossKills: 0,
    },
    lastRunReward: null,
  };
}

function getStorage(): AccountStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function assign(next: AccountProgress): void {
  Object.assign(accountProgress, next);
}

function sanitize(raw: unknown): AccountProgress {
  const clean = createDefaultAccountProgress();
  if (!raw || typeof raw !== "object") return clean;
  const source = raw as Partial<AccountProgress>;
  clean.records = {
    bestMiniWave: Math.min(
      MINI_WAVE_COUNT,
      saneInt(source.records?.bestMiniWave, 0, 0),
    ),
    bestScore: saneInt(source.records?.bestScore, 0),
    bestTimeSeconds: saneInt(source.records?.bestTimeSeconds, 0),
    bossKills: saneInt(source.records?.bossKills, 0),
  };
  return clean;
}

function saneInt(value: unknown, fallback: number, min = 0): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(min, Math.floor(value))
    : fallback;
}

function migrateLegacy(storage: AccountStorage): AccountProgress | null {
  const raw = storage.getItem(LEGACY_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const clean = createDefaultAccountProgress();
    const records = (parsed.records ?? {}) as Record<string, unknown>;
    clean.records = {
      bestMiniWave: Math.min(MINI_WAVE_COUNT, saneInt(records.bestWave, 0, 0)),
      bestScore: saneInt(records.bestScore, 0),
      bestTimeSeconds: saneInt(records.bestTimeSeconds, 0),
      bossKills: 0,
    };
    return clean;
  } catch {
    return null;
  }
}

export function initializeAccountProgress(
  storage: AccountStorage | null = getStorage(),
): void {
  if (!storage) {
    assign(createDefaultAccountProgress());
    return;
  }
  const raw = storage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      assign(sanitize(JSON.parse(raw)));
      return;
    } catch {
      // fallthrough to legacy migration
    }
  }
  const legacy = migrateLegacy(storage);
  if (legacy) {
    assign(legacy);
    saveAccountProgress(storage);
    try {
      storage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      // ignore
    }
    return;
  }
  assign(createDefaultAccountProgress());
}

export function saveAccountProgress(
  storage: AccountStorage | null = getStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(accountProgress));
  } catch {
    // storage may be unavailable
  }
}

export function resetAccountProgress(
  storage: AccountStorage | null = getStorage(),
): void {
  assign(createDefaultAccountProgress());
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function recordRun(summary: AccountRunSummary): AccountReward {
  const newRecords: string[] = [];
  if (summary.miniWaveReached > accountProgress.records.bestMiniWave) {
    accountProgress.records.bestMiniWave = summary.miniWaveReached;
    newRecords.push("miniWave");
  }
  if (summary.score > accountProgress.records.bestScore) {
    accountProgress.records.bestScore = summary.score;
    newRecords.push("score");
  }
  if (summary.elapsedSeconds > accountProgress.records.bestTimeSeconds) {
    accountProgress.records.bestTimeSeconds = Math.floor(summary.elapsedSeconds);
    newRecords.push("time");
  }
  if (summary.bossDefeated) {
    accountProgress.records.bossKills += 1;
  }

  const reward: AccountReward = { newRecords, bossBonus: summary.bossDefeated };
  accountProgress.lastRunReward = reward;
  saveAccountProgress();
  return reward;
}

import {
  canPurchaseLevel,
  crystalYieldMultiplier,
  findMetaUpgrade,
  metaUpgradeCatalog,
  metaUpgradeLevel,
} from "../game/meta-upgrade-catalog";
import type {
  AccountProgress,
  AccountReward,
  AccountRunSummary,
  MetaUpgradeId,
} from "../types";

const STORAGE_KEY = "voidline:metaProgress:v2";

interface AccountStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const accountProgress: AccountProgress = createDefaultAccountProgress();

function createDefaultAccountProgress(): AccountProgress {
  return {
    crystals: 0,
    spentCrystals: 0,
    upgradeLevels: {},
    records: { bestWave: 1, bestScore: 0, bestTimeSeconds: 0 },
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
  clean.crystals = saneInt(source.crystals, 0);
  clean.spentCrystals = saneInt(source.spentCrystals, 0);
  clean.upgradeLevels = sanitizeLevels(source.upgradeLevels);
  clean.records = {
    bestWave: saneInt(source.records?.bestWave, 1, 1),
    bestScore: saneInt(source.records?.bestScore, 0),
    bestTimeSeconds: saneInt(source.records?.bestTimeSeconds, 0),
  };
  return clean;
}

function sanitizeLevels(raw: unknown): Partial<Record<MetaUpgradeId, number>> {
  if (!raw || typeof raw !== "object") return {};
  const result: Partial<Record<MetaUpgradeId, number>> = {};
  for (const upgrade of metaUpgradeCatalog) {
    const value = (raw as Record<string, unknown>)[upgrade.id];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    const clamped = Math.max(0, Math.min(upgrade.maxLevel, Math.floor(value)));
    if (clamped > 0) result[upgrade.id] = clamped;
  }
  return result;
}

function saneInt(value: unknown, fallback: number, min = 0): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(min, Math.floor(value))
    : fallback;
}

export function initializeAccountProgress(
  storage: AccountStorage | null = getStorage(),
): void {
  const raw = storage?.getItem(STORAGE_KEY) ?? null;
  if (!raw) {
    assign(createDefaultAccountProgress());
    return;
  }
  try {
    assign(sanitize(JSON.parse(raw)));
  } catch {
    assign(createDefaultAccountProgress());
  }
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

export function awardRunCrystals(summary: AccountRunSummary): AccountReward {
  const baseFromWave = (summary.wave - 1) * 18;
  const baseFromScore = Math.min(80, Math.floor(summary.score / 1500));
  const baseFromTime = Math.min(60, Math.floor(summary.elapsedSeconds / 12));
  let crystals = baseFromWave + baseFromScore + baseFromTime;
  crystals = Math.floor(crystals * crystalYieldMultiplier(accountProgress));

  const newRecords: string[] = [];
  if (summary.wave > accountProgress.records.bestWave) {
    accountProgress.records.bestWave = summary.wave;
    newRecords.push("wave");
  }
  if (summary.score > accountProgress.records.bestScore) {
    accountProgress.records.bestScore = summary.score;
    newRecords.push("score");
  }
  if (summary.elapsedSeconds > accountProgress.records.bestTimeSeconds) {
    accountProgress.records.bestTimeSeconds = Math.floor(summary.elapsedSeconds);
    newRecords.push("time");
  }

  accountProgress.crystals += crystals;
  const reward: AccountReward = { crystalsGained: crystals, newRecords };
  accountProgress.lastRunReward = reward;
  saveAccountProgress();
  return reward;
}

export function purchaseMetaUpgrade(id: MetaUpgradeId): { ok: true; level: number } | { ok: false; reason: string } {
  findMetaUpgrade(id);
  const result = canPurchaseLevel(accountProgress, id);
  if (!result.ok) return { ok: false, reason: result.reason };
  accountProgress.crystals -= result.cost;
  accountProgress.spentCrystals += result.cost;
  const next = metaUpgradeLevel(accountProgress, id) + 1;
  accountProgress.upgradeLevels[id] = next;
  saveAccountProgress();
  return { ok: true, level: next };
}

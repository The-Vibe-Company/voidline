import { unlockedRelics } from "../state";
import {
  defaultUnlockedRelicIds,
  relicUnlocksForBossStage,
} from "../game/relic-catalog";
import { markLoadoutDirty } from "../simulation/events";
import type { RelicChoice } from "../types";
import { applyRustRelic, draftRustRelics } from "../simulation/rust-engine";

const STORAGE_KEY = "voidline:unlockedRelics";

interface RelicStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function getStorage(): RelicStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function parseStoredRelics(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function initializeRelicUnlocks(storage: RelicStorage | null = getStorage()): void {
  unlockedRelics.clear();
  for (const id of defaultUnlockedRelicIds()) {
    unlockedRelics.add(id);
  }
  for (const id of parseStoredRelics(storage?.getItem(STORAGE_KEY) ?? null)) {
    unlockedRelics.add(id);
  }
}

export function saveRelicUnlocks(storage: RelicStorage | null = getStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify([...unlockedRelics].sort()));
  } catch {
    // Storage can be unavailable in private browsing or embedded test environments.
  }
}

export function resetRelicUnlocks(storage: RelicStorage | null = getStorage()): void {
  unlockedRelics.clear();
  for (const id of defaultUnlockedRelicIds()) {
    unlockedRelics.add(id);
  }
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {
    // Keep the in-memory reset even when storage is blocked.
  }
}

export function unlockRelicsForBossStage(
  stage: number,
  storage: RelicStorage | null = getStorage(),
): string[] {
  const newlyUnlocked: string[] = [];
  for (const id of relicUnlocksForBossStage(stage)) {
    if (unlockedRelics.has(id)) continue;
    unlockedRelics.add(id);
    newlyUnlocked.push(id);
  }
  if (newlyUnlocked.length > 0) {
    saveRelicUnlocks(storage);
  }
  return newlyUnlocked;
}

export function pickRelicChoices(count: number): RelicChoice[] {
  return draftRustRelics(count);
}

export function applyRelicChoice(choice: RelicChoice): void {
  applyRustRelic(choice);
  markLoadoutDirty();
}

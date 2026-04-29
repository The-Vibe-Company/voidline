import { ownedRelics, player, unlockedRelics } from "../state";
import { pulseText } from "../entities/particles";
import {
  applyRelic,
  defaultUnlockedRelicIds,
  pickChestRelics,
  relicUnlocksForBossWave,
} from "../game/relic-catalog";
import type { RelicChoice } from "../types";

const STORAGE_KEY = "voidline:unlockedRelics";

interface RelicStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
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

export function unlockRelicsForBossWave(
  wave: number,
  storage: RelicStorage | null = getStorage(),
): string[] {
  const newlyUnlocked: string[] = [];
  for (const id of relicUnlocksForBossWave(wave)) {
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
  return pickChestRelics(count, new Set(ownedRelics.keys()), unlockedRelics);
}

export function applyRelicChoice(choice: RelicChoice): void {
  const { relic } = choice;
  applyRelic(relic, player);

  const owned = ownedRelics.get(relic.id) ?? { relic, count: 0 };
  owned.count += 1;
  ownedRelics.set(relic.id, owned);

  pulseText(player.x, player.y - 48, relic.name, relic.color);
}

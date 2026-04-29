import {
  applyCrystalReward,
  createDefaultAccountProgress,
  emptyBreakdown,
  uniquePositiveNumbers,
} from "../game/account-progression";
import { applyCharacter, characterCatalog, findCharacter } from "../game/character-catalog";
import {
  canPurchaseShopItem,
  findShopItem,
  shopCatalog,
  unlockedBuildTags,
  unlockedTechnologyIds,
} from "../game/shop-catalog";
import { applyWeapon, findWeapon } from "../game/weapon-catalog";
import type {
  AccountProgress,
  AccountReward,
  AccountRunSummary,
  BuildTag,
  CharacterId,
  Player,
  ShopItemId,
  WeaponId,
} from "../types";

const STORAGE_KEY = "voidline:metaProgress:v1";
const LEGACY_STORAGE_KEY = "voidline:accountProgress:v1";

interface AccountStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const accountProgress: AccountProgress = createDefaultAccountProgress();

function getStorage(): AccountStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function assignAccountProgress(next: AccountProgress): void {
  Object.assign(accountProgress, next);
}

function parseStoredProgress(raw: string | null): AccountProgress {
  if (!raw) return createDefaultAccountProgress();
  try {
    return sanitizeAccountProgress(JSON.parse(raw));
  } catch {
    return createDefaultAccountProgress();
  }
}

function sanitizeAccountProgress(raw: unknown): AccountProgress {
  const clean = createDefaultAccountProgress();
  if (!raw || typeof raw !== "object") return clean;

  const source = raw as Partial<AccountProgress>;
  const legacySource = raw as Partial<AccountProgress> & {
    equippedWeaponId?: unknown;
    purchasedIds?: unknown;
    tokens?: unknown;
  };
  const shopIds = new Set(shopCatalog.map((item) => item.id));
  const characterIds = new Set(characterCatalog.map((character) => character.id));
  const weaponIds = new Set(["pulse", "scatter", "lance", "drone"] satisfies WeaponId[]);
  const purchasedCandidates = [
    ...(Array.isArray(source.purchasedUnlockIds) ? source.purchasedUnlockIds : []),
    ...(Array.isArray(legacySource.purchasedIds) ? legacySource.purchasedIds : []),
  ];
  const selectedWeaponCandidate =
    typeof source.selectedWeaponId === "string"
      ? source.selectedWeaponId
      : typeof legacySource.equippedWeaponId === "string"
        ? legacySource.equippedWeaponId
        : null;
  const crystalCandidate =
    typeof source.crystals === "number" ? source.crystals : legacySource.tokens;

  clean.crystals = saneInt(crystalCandidate, clean.crystals, 0);
  clean.spentCrystals = saneInt(source.spentCrystals, clean.spentCrystals, 0);
  clean.purchasedUnlockIds = [
    ...new Set(purchasedCandidates.filter((id): id is ShopItemId => shopIds.has(id))),
  ];
  clean.selectedCharacterId =
    typeof source.selectedCharacterId === "string" &&
    characterIds.has(source.selectedCharacterId as CharacterId) &&
    canUseCharacter(source.selectedCharacterId as CharacterId, clean)
      ? (source.selectedCharacterId as CharacterId)
      : "pilot";
  clean.selectedWeaponId =
    selectedWeaponCandidate &&
    weaponIds.has(selectedWeaponCandidate as WeaponId) &&
    canUseWeapon(selectedWeaponCandidate as WeaponId, clean)
      ? (selectedWeaponCandidate as WeaponId)
      : "pulse";
  clean.highestStageCleared = saneInt(source.highestStageCleared, clean.highestStageCleared, 0);
  clean.highestStartStageUnlocked = Math.max(
    saneInt(source.highestStartStageUnlocked, clean.highestStartStageUnlocked, 1),
    clean.highestStageCleared + 1,
  );
  clean.selectedStartStage = clampStartStage(
    saneInt(source.selectedStartStage, clean.selectedStartStage, 1),
    clean,
  );
  clean.records = {
    bestStage: saneInt(source.records?.bestStage, clean.records.bestStage, 1),
    bestTimeSeconds: saneInt(source.records?.bestTimeSeconds, clean.records.bestTimeSeconds, 0),
    bestScore: saneInt(source.records?.bestScore, clean.records.bestScore, 0),
    bestRunLevel: saneInt(source.records?.bestRunLevel, clean.records.bestRunLevel, 1),
    bossKills: saneInt(source.records?.bossKills, clean.records.bossKills, 0),
  };
  clean.records.bestStage = Math.max(
    clean.records.bestStage,
    clean.highestStageCleared + 1,
    clean.highestStartStageUnlocked,
  );
  clean.lastRunReward = cloneAccountReward(source.lastRunReward);
  return clean;
}

function cloneAccountReward(reward: AccountReward | null | undefined): AccountReward | null {
  return reward
    ? {
        ...reward,
        newRecords: [...reward.newRecords],
        breakdown: { ...reward.breakdown },
      }
    : null;
}

function saneInt(value: unknown, fallback: number, min: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(min, Math.floor(value))
    : fallback;
}

function clampStartStage(stage: number, progress: AccountProgress): number {
  return Math.max(1, Math.min(Math.floor(stage), progress.highestStartStageUnlocked));
}

function ownsUnlock(progress: AccountProgress, id: ShopItemId): boolean {
  return progress.purchasedUnlockIds.includes(id);
}

function canUseCharacter(id: CharacterId, progress: AccountProgress): boolean {
  if (id === "pilot") return true;
  const item = shopCatalog.find((candidate) => candidate.characterId === id);
  return item !== undefined && ownsUnlock(progress, item.id);
}

function canUseWeapon(id: WeaponId, progress: AccountProgress): boolean {
  if (id === "pulse") return true;
  const item = shopCatalog.find((candidate) => candidate.weaponId === id);
  return item !== undefined && ownsUnlock(progress, item.id);
}

export function initializeAccountProgress(storage: AccountStorage | null = getStorage()): void {
  const storedRaw = storage?.getItem(STORAGE_KEY) ?? null;
  const legacyRaw = storedRaw ? null : (storage?.getItem(LEGACY_STORAGE_KEY) ?? null);
  assignAccountProgress(parseStoredProgress(storedRaw ?? legacyRaw));
  if (!storedRaw && legacyRaw) saveAccountProgress(storage);
}

export function saveAccountProgress(storage: AccountStorage | null = getStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(accountProgress));
  } catch {
    // Storage can be unavailable in private browsing or embedded test environments.
  }
}

export function resetAccountProgress(storage: AccountStorage | null = getStorage()): void {
  assignAccountProgress(createDefaultAccountProgress());
  try {
    storage?.removeItem(STORAGE_KEY);
    storage?.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // Keep the in-memory reset even when storage is blocked.
  }
}

export function restoreAccountProgress(progress: AccountProgress): void {
  assignAccountProgress(sanitizeAccountProgress(progress));
}

export function currentAccountProgress(): AccountProgress {
  return {
    ...accountProgress,
    purchasedUnlockIds: [...accountProgress.purchasedUnlockIds],
    records: { ...accountProgress.records },
    lastRunReward: cloneAccountReward(accountProgress.lastRunReward),
  };
}

export function awardRunAccountProgress(
  summary: AccountRunSummary,
  storage?: AccountStorage | null,
): AccountReward {
  const reward = applyCrystalReward(accountProgress, {
    ...summary,
    bossStages: uniquePositiveNumbers(summary.bossStages),
  });
  saveAccountProgress(storage === undefined ? getStorage() : storage);
  return reward;
}

export function purchaseShopItem(
  id: ShopItemId,
  storage?: AccountStorage | null,
): { ok: true; reward: AccountReward } | { ok: false; reason: string } {
  const item = findShopItem(id);
  const canPurchase = canPurchaseShopItem(accountProgress, item);
  if (!canPurchase.ok) return { ok: false, reason: canPurchase.reason };

  accountProgress.crystals -= item.cost;
  accountProgress.spentCrystals += item.cost;
  accountProgress.purchasedUnlockIds.push(item.id);
  if (item.characterId) {
    accountProgress.selectedCharacterId = item.characterId;
  }
  if (item.weaponId) {
    accountProgress.selectedWeaponId = item.weaponId;
  }

  const reward: AccountReward = {
    source: "shop",
    crystalsGained: 0,
    newlyUnlockedStartStage: null,
    newRecords: [],
    breakdown: emptyBreakdown(),
  };
  saveAccountProgress(storage === undefined ? getStorage() : storage);
  return { ok: true, reward };
}

export function selectCharacter(
  characterId: CharacterId,
  storage?: AccountStorage | null,
): boolean {
  findCharacter(characterId);
  if (!canUseCharacter(characterId, accountProgress)) return false;
  accountProgress.selectedCharacterId = characterId;
  saveAccountProgress(storage === undefined ? getStorage() : storage);
  return true;
}

export function equipWeapon(
  weaponId: WeaponId,
  storage?: AccountStorage | null,
): boolean {
  findWeapon(weaponId);
  if (!canUseWeapon(weaponId, accountProgress)) return false;
  accountProgress.selectedWeaponId = weaponId;
  saveAccountProgress(storage === undefined ? getStorage() : storage);
  return true;
}

export function selectStartStage(
  stage: number,
  storage?: AccountStorage | null,
): boolean {
  const next = Math.floor(stage);
  if (next < 1 || next > accountProgress.highestStartStageUnlocked) return false;
  accountProgress.selectedStartStage = next;
  saveAccountProgress(storage === undefined ? getStorage() : storage);
  return true;
}

export function applySelectedLoadout(target: Player): void {
  applyCharacter(accountProgress.selectedCharacterId, target);
  applyWeapon(accountProgress.selectedWeaponId, target);
}

export function applyEquippedWeapon(target: Player): void {
  applySelectedLoadout(target);
}

export function currentUnlockedBuildTags(): Set<BuildTag> {
  const tags = unlockedBuildTags(accountProgress);
  for (const tag of findWeapon(accountProgress.selectedWeaponId).tags) {
    tags.add(tag);
  }
  return tags;
}

export function currentUnlockedTechnologyIds(): Set<string> {
  return unlockedTechnologyIds(accountProgress);
}

export function currentRarityRank(): number {
  return 0;
}

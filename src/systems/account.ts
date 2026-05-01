import {
  createDefaultAccountProgress,
  emptyBreakdown,
  uniquePositiveNumbers,
} from "../game/account-progression";
import { characterCatalog, findCharacter } from "../game/character-catalog";
import {
  bossBountyBonusFromMeta,
  canPurchaseLevel,
  findMetaUpgrade,
  metaUpgradeCatalog,
  metaUpgradeLevel,
  rarityProfileFromMeta,
  unlockedBuildTagsFromMeta,
  unlockedTechnologyIdsFromMeta,
  upgradeTierCapsFromMeta,
  type RarityProfile,
  type UpgradeTierCaps,
} from "../game/meta-upgrade-catalog";
import {
  canPurchaseShopItem,
  findShopItem,
  shopCatalog,
  STARTER_BUILD_TAGS,
  STARTER_TECHNOLOGY_IDS,
} from "../game/shop-catalog";
import { findWeapon } from "../game/weapon-catalog";
import { applyRustRunReward } from "../simulation/rust-engine";
import type {
  AccountProgress,
  AccountReward,
  AccountRunSummary,
  BuildTag,
  CharacterId,
  MetaUpgradeId,
  ShopItemId,
  WeaponId,
} from "../types";

const SHOP_ITEM_TO_META: Partial<Record<ShopItemId, MetaUpgradeId>> = {
  "weapon:scatter": "unique:weapon-scatter",
  "weapon:lance": "unique:weapon-lance",
  "weapon:drone": "unique:weapon-drone",
  "character:runner": "unique:char-runner",
  "character:tank": "unique:char-tank",
  "character:engineer": "unique:char-engineer",
};

const REFUND_SHOP_ITEMS: ReadonlyArray<{ id: ShopItemId; cost: number }> = [
  { id: "technology:heavy-caliber", cost: 80 },
  { id: "technology:kinetic-shield", cost: 70 },
  { id: "technology:crit-array", cost: 55 },
];

const REMOVED_META_UPGRADE_REFUNDS: ReadonlyArray<{ id: string; costs: readonly number[] }> = [
  { id: "unique:reroll", costs: [100] },
  { id: "category:attack", costs: [40, 75, 130, 220] },
  { id: "category:defense", costs: [40, 75, 130, 220] },
  { id: "category:salvage", costs: [40, 75, 130, 220] },
  { id: "category:tempo", costs: [40, 75, 130, 220] },
];

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
  clean.upgradeLevels = sanitizeUpgradeLevels(source.upgradeLevels);
  refundRemovedMetaUpgrades(clean, source.upgradeLevels);

  const legacyPurchases = [
    ...new Set(purchasedCandidates.filter((id): id is ShopItemId => shopIds.has(id))),
  ];
  migrateLegacyUnlocks(clean, legacyPurchases);

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
  clean.lastRunReward = cloneAccountReward(source.lastRunReward);
  return clean;
}

function sanitizeUpgradeLevels(
  raw: unknown,
): Partial<Record<MetaUpgradeId, number>> {
  if (!raw || typeof raw !== "object") return {};
  const result: Partial<Record<MetaUpgradeId, number>> = {};
  for (const upgrade of metaUpgradeCatalog) {
    const value = (raw as Record<string, unknown>)[upgrade.id];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    const clamped = Math.max(0, Math.min(upgrade.maxLevel, Math.floor(value)));
    if (clamped > (upgrade.baseLevel ?? 0)) result[upgrade.id] = clamped;
  }
  return result;
}

function migrateLegacyUnlocks(progress: AccountProgress, legacyIds: ShopItemId[]): void {
  if (legacyIds.length === 0) return;
  const seen = new Set(legacyIds);
  for (const [shopId, metaId] of Object.entries(SHOP_ITEM_TO_META) as ReadonlyArray<
    [ShopItemId, MetaUpgradeId]
  >) {
    if (!seen.has(shopId)) continue;
    progress.upgradeLevels[metaId] = Math.max(progress.upgradeLevels[metaId] ?? 0, 1);
  }
  for (const refund of REFUND_SHOP_ITEMS) {
    if (!seen.has(refund.id)) continue;
    progress.crystals += refund.cost;
    progress.spentCrystals = Math.max(0, progress.spentCrystals - refund.cost);
  }
}

function refundRemovedMetaUpgrades(
  progress: AccountProgress,
  upgradeLevels: unknown,
): void {
  if (!upgradeLevels || typeof upgradeLevels !== "object") return;
  const source = upgradeLevels as Record<string, unknown>;
  for (const refund of REMOVED_META_UPGRADE_REFUNDS) {
    const level = source[refund.id];
    if (typeof level !== "number" || !Number.isFinite(level) || level < 1) continue;
    const refunded = refund.costs
      .slice(0, Math.min(refund.costs.length, Math.floor(level)))
      .reduce((sum, cost) => sum + cost, 0);
    progress.crystals += refunded;
    progress.spentCrystals = Math.max(0, progress.spentCrystals - refunded);
  }
}

function hasRemovedMetaUpgrades(raw: string | null): boolean {
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as Partial<AccountProgress>;
    const levels = parsed.upgradeLevels;
    if (!levels || typeof levels !== "object") return false;
    return REMOVED_META_UPGRADE_REFUNDS.some((refund) => {
      const level = (levels as Record<string, unknown>)[refund.id];
      return typeof level === "number" && Number.isFinite(level) && level >= 1;
    });
  } catch {
    return false;
  }
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

function ownsMeta(progress: AccountProgress, id: MetaUpgradeId): boolean {
  return metaUpgradeLevel(progress, id) >= 1;
}

function canUseCharacter(id: CharacterId, progress: AccountProgress): boolean {
  if (id === "pilot") return true;
  const upgrade = metaUpgradeCatalog.find((candidate) => candidate.characterId === id);
  return upgrade !== undefined && ownsMeta(progress, upgrade.id);
}

function canUseWeapon(id: WeaponId, progress: AccountProgress): boolean {
  if (id === "pulse") return true;
  const upgrade = metaUpgradeCatalog.find((candidate) => candidate.weaponId === id);
  return upgrade !== undefined && ownsMeta(progress, upgrade.id);
}

export function initializeAccountProgress(storage: AccountStorage | null = getStorage()): void {
  const storedRaw = storage?.getItem(STORAGE_KEY) ?? null;
  const legacyRaw = storedRaw ? null : (storage?.getItem(LEGACY_STORAGE_KEY) ?? null);
  assignAccountProgress(parseStoredProgress(storedRaw ?? legacyRaw));
  if ((!storedRaw && legacyRaw) || hasRemovedMetaUpgrades(storedRaw)) saveAccountProgress(storage);
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
  const normalizedSummary = {
    ...summary,
    bossStages: uniquePositiveNumbers(summary.bossStages),
  };
  const rustResult = applyRustRunReward(accountProgress, normalizedSummary);
  const reward = applyRustRewardResult(rustResult);
  saveAccountProgress(storage === undefined ? getStorage() : storage);
  return reward;
}

function applyRustRewardResult(result: ReturnType<typeof applyRustRunReward>): AccountReward {
  accountProgress.crystals = result.progress.crystals;
  accountProgress.spentCrystals = result.progress.spentCrystals;
  accountProgress.upgradeLevels = result.progress.upgradeLevels;
  accountProgress.selectedCharacterId = result.progress.selectedCharacterId as CharacterId;
  accountProgress.selectedWeaponId = result.progress.selectedWeaponId as WeaponId;
  accountProgress.selectedStartStage = result.progress.selectedStartStage;
  accountProgress.highestStageCleared = result.progress.highestStageCleared;
  accountProgress.highestStartStageUnlocked = result.progress.highestStartStageUnlocked;
  accountProgress.records = result.progress.records;
  accountProgress.lastRunReward = result.reward;
  return result.reward;
}

export function purchaseMetaUpgradeLevel(
  id: MetaUpgradeId,
  storage?: AccountStorage | null,
): { ok: true; level: number; cost: number } | { ok: false; reason: string } {
  const upgrade = findMetaUpgrade(id);
  const result = canPurchaseLevel(accountProgress, id);
  if (!result.ok) return { ok: false, reason: result.reason };

  const nextLevel = metaUpgradeLevel(accountProgress, id) + 1;
  accountProgress.crystals -= result.cost;
  accountProgress.spentCrystals += result.cost;
  accountProgress.upgradeLevels[id] = nextLevel;
  if (upgrade.characterId && upgrade.kind === "unique") {
    accountProgress.selectedCharacterId = upgrade.characterId;
  }
  if (upgrade.weaponId && upgrade.kind === "unique") {
    accountProgress.selectedWeaponId = upgrade.weaponId;
  }

  saveAccountProgress(storage === undefined ? getStorage() : storage);
  return { ok: true, level: nextLevel, cost: result.cost };
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

export function currentUnlockedBuildTags(): Set<BuildTag> {
  const tags = new Set<BuildTag>(STARTER_BUILD_TAGS);
  for (const tag of unlockedBuildTagsFromMeta(accountProgress)) tags.add(tag);
  for (const tag of findWeapon(accountProgress.selectedWeaponId).tags) tags.add(tag);
  return tags;
}

export function currentUnlockedTechnologyIds(): Set<string> {
  const ids = new Set<string>(STARTER_TECHNOLOGY_IDS);
  for (const id of unlockedTechnologyIdsFromMeta(accountProgress)) ids.add(id);
  return ids;
}

export function currentRarityRank(): number {
  const profile = currentRarityProfile();
  if (profile.singularity > 0) return 3;
  if (profile.prototype > 0) return 2;
  if (profile.rare > 0) return 1;
  return 0;
}

export function currentRarityProfile(): RarityProfile {
  return rarityProfileFromMeta(accountProgress);
}

export function currentUpgradeTierCaps(): UpgradeTierCaps {
  return upgradeTierCapsFromMeta(accountProgress);
}

export function currentLevelUpChoiceCount(): number {
  const lvls = accountProgress.upgradeLevels;
  const hasExtra = (lvls["unique:extra-choice"] ?? 0) >= 1;
  return 3 + (hasExtra ? 1 : 0);
}

export function currentCrystalRewardMultiplier(): number {
  const contract = accountProgress.upgradeLevels["utility:crystal-contract"] ?? 0;
  return 1 + Math.max(0, Math.min(3, contract)) * 0.05;
}

export function currentBossBountyBonus(): number {
  return bossBountyBonusFromMeta(accountProgress);
}

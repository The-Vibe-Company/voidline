import {
  applyAccountXp,
  computeRunAccountXp,
  createDefaultAccountProgress,
  emptyBreakdown,
  totalAccountXpBreakdown,
  uniquePositiveWaves,
} from "../game/account-progression";
import { claimableChallengeTierRewards } from "../game/challenge-catalog";
import {
  canPurchaseShopItem,
  findShopItem,
  rarityRank,
  shopCatalog,
  unlockedBuildTags,
} from "../game/shop-catalog";
import { applyWeapon, findWeapon } from "../game/weapon-catalog";
import type {
  AccountProgress,
  AccountReward,
  AccountRunSummary,
  BuildTag,
  ChallengeProgress,
  Player,
  ShopItemId,
  WeaponId,
} from "../types";

const STORAGE_KEY = "voidline:accountProgress:v1";

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
  const shopIds = new Set(shopCatalog.map((item) => item.id));
  const weaponIds = new Set(["standard", "scatter", "lance"]);

  clean.level = saneInt(source.level, clean.level, 1);
  clean.xp = saneInt(source.xp, clean.xp, 0);
  clean.tokens = saneInt(source.tokens, clean.tokens, 0);
  clean.spentTokens = saneInt(source.spentTokens, clean.spentTokens, 0);
  clean.bestWave = saneInt(source.bestWave, clean.bestWave, 0);
  clean.bestRunLevel = saneInt(source.bestRunLevel, clean.bestRunLevel, 1);
  clean.purchasedIds = Array.isArray(source.purchasedIds)
    ? [...new Set(source.purchasedIds.filter((id): id is ShopItemId => shopIds.has(id)))]
    : [];
  clean.equippedWeaponId =
    typeof source.equippedWeaponId === "string" && weaponIds.has(source.equippedWeaponId)
      ? (source.equippedWeaponId as WeaponId)
      : "standard";
  clean.bossWavesDefeated = Array.isArray(source.bossWavesDefeated)
    ? uniquePositiveWaves(source.bossWavesDefeated)
    : [];
  clean.claimedChallengeTierIds = Array.isArray(source.claimedChallengeTierIds)
    ? [...new Set(source.claimedChallengeTierIds.filter((id) => typeof id === "string"))]
    : [];
  clean.lastRunReward = null;

  if (clean.equippedWeaponId !== "standard") {
    const weaponItem = shopCatalog.find((item) => item.weaponId === clean.equippedWeaponId);
    if (!weaponItem || !clean.purchasedIds.includes(weaponItem.id)) {
      clean.equippedWeaponId = "standard";
    }
  }

  return clean;
}

function cloneAccountReward(reward: AccountReward | null | undefined): AccountReward | null {
  return reward
    ? {
        ...reward,
        breakdown: { ...reward.breakdown },
      }
    : null;
}

function saneInt(value: unknown, fallback: number, min: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(min, Math.floor(value))
    : fallback;
}

export function initializeAccountProgress(storage: AccountStorage | null = getStorage()): void {
  assignAccountProgress(parseStoredProgress(storage?.getItem(STORAGE_KEY) ?? null));
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
  } catch {
    // Keep the in-memory reset even when storage is blocked.
  }
}

export function restoreAccountProgress(progress: AccountProgress): void {
  const restored = sanitizeAccountProgress(progress);
  restored.lastRunReward = cloneAccountReward(progress.lastRunReward);
  assignAccountProgress(restored);
}

export function currentAccountProgress(): AccountProgress {
  return {
    ...accountProgress,
    purchasedIds: [...accountProgress.purchasedIds],
    bossWavesDefeated: [...accountProgress.bossWavesDefeated],
    claimedChallengeTierIds: [...accountProgress.claimedChallengeTierIds],
    lastRunReward: accountProgress.lastRunReward
      ? {
          ...accountProgress.lastRunReward,
          breakdown: { ...accountProgress.lastRunReward.breakdown },
        }
      : null,
  };
}

export function awardRunAccountProgress(
  summary: AccountRunSummary,
  storage?: AccountStorage | null,
): AccountReward {
  const breakdown = computeRunAccountXp(accountProgress, summary);
  const xpGained = totalAccountXpBreakdown(breakdown);
  const reward = applyAccountXp(accountProgress, xpGained, "run", breakdown);
  accountProgress.bestWave = Math.max(accountProgress.bestWave, Math.floor(summary.wave));
  accountProgress.bestRunLevel = Math.max(
    accountProgress.bestRunLevel,
    Math.floor(summary.runLevel),
  );
  accountProgress.bossWavesDefeated = uniquePositiveWaves([
    ...accountProgress.bossWavesDefeated,
    ...summary.bossWaves,
  ]);
  saveAccountProgress(storage === undefined ? getStorage() : storage);
  return reward;
}

export function claimChallengeRewards(
  progress: ChallengeProgress,
  storage?: AccountStorage | null,
): AccountReward | null {
  const claimed = new Set(accountProgress.claimedChallengeTierIds);
  const rewards = claimableChallengeTierRewards(progress, claimed);
  if (rewards.length === 0) return null;

  const xpGained = rewards.reduce((sum, reward) => sum + reward.accountXp, 0);
  for (const reward of rewards) {
    accountProgress.claimedChallengeTierIds.push(reward.id);
  }
  const breakdown = { ...emptyBreakdown(), challengeXp: xpGained };
  const reward = applyAccountXp(accountProgress, xpGained, "challenge", breakdown);
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

  accountProgress.tokens -= item.cost;
  accountProgress.spentTokens += item.cost;
  accountProgress.purchasedIds.push(item.id);
  if (item.weaponId) {
    accountProgress.equippedWeaponId = item.weaponId;
  }

  const reward: AccountReward = {
    source: "shop",
    xpGained: 0,
    tokensGained: 0,
    levelsGained: 0,
    breakdown: emptyBreakdown(),
  };
  saveAccountProgress(storage === undefined ? getStorage() : storage);
  return { ok: true, reward };
}

export function equipWeapon(
  weaponId: WeaponId,
  storage?: AccountStorage | null,
): boolean {
  findWeapon(weaponId);
  if (weaponId !== "standard") {
    const item = shopCatalog.find((candidate) => candidate.weaponId === weaponId);
    if (!item || !accountProgress.purchasedIds.includes(item.id)) return false;
  }
  accountProgress.equippedWeaponId = weaponId;
  saveAccountProgress(storage === undefined ? getStorage() : storage);
  return true;
}

export function applyEquippedWeapon(target: Player): void {
  applyWeapon(accountProgress.equippedWeaponId, target);
}

export function currentUnlockedBuildTags(): Set<BuildTag> {
  return unlockedBuildTags(accountProgress);
}

export function currentRarityRank(): number {
  return rarityRank(accountProgress);
}

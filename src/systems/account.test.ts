import { beforeEach, describe, expect, it } from "vitest";
import { createDefaultAccountProgress } from "../game/account-progression";
import { createEmptyChallengeProgress } from "../game/challenge-catalog";
import {
  accountProgress,
  claimChallengeRewards,
  equipWeapon,
  initializeAccountProgress,
  purchaseShopItem,
  resetAccountProgress,
  restoreAccountProgress,
} from "./account";

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe("account persistence and shop", () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
    resetAccountProgress(storage);
  });

  it("loads default account progress", () => {
    initializeAccountProgress(storage);

    expect(accountProgress.level).toBe(1);
    expect(accountProgress.tokens).toBe(0);
    expect(accountProgress.equippedWeaponId).toBe("standard");
  });

  it("refuses purchases without enough tokens", () => {
    const result = purchaseShopItem("module:shield", storage);

    expect(result.ok).toBe(false);
    expect(accountProgress.purchasedIds).toHaveLength(0);
  });

  it("spends tokens and persists a valid purchase", () => {
    restoreAccountProgress({ ...createDefaultAccountProgress(), tokens: 1 });

    const result = purchaseShopItem("module:shield", storage);

    expect(result.ok).toBe(true);
    expect(accountProgress.tokens).toBe(0);
    expect(accountProgress.spentTokens).toBe(1);
    expect(accountProgress.purchasedIds).toContain("module:shield");
    expect(storage.getItem("voidline:accountProgress:v1")).toContain("module:shield");
  });

  it("keeps the last run reward visible after a shop purchase", () => {
    restoreAccountProgress({ ...createDefaultAccountProgress(), tokens: 1 });
    accountProgress.lastRunReward = {
      source: "run",
      xpGained: 140,
      tokensGained: 1,
      levelsGained: 1,
      breakdown: {
        runLevelXp: 40,
        waveXp: 60,
        bossXp: 0,
        firstBossXp: 0,
        recordXp: 40,
        challengeXp: 0,
      },
    };

    purchaseShopItem("module:shield", storage);

    expect(accountProgress.lastRunReward?.source).toBe("run");
    expect(accountProgress.lastRunReward?.xpGained).toBe(140);
  });

  it("requires rarity purchases in order", () => {
    restoreAccountProgress({ ...createDefaultAccountProgress(), tokens: 3 });

    expect(purchaseShopItem("rarity:2", storage).ok).toBe(false);
    expect(purchaseShopItem("rarity:1", storage).ok).toBe(true);
    expect(purchaseShopItem("rarity:2", storage).ok).toBe(true);
  });

  it("only equips purchased weapons", () => {
    expect(equipWeapon("lance", storage)).toBe(false);

    restoreAccountProgress({
      ...createDefaultAccountProgress(),
      tokens: 2,
      purchasedIds: ["weapon:lance"],
    });

    expect(equipWeapon("lance", storage)).toBe(true);
    expect(accountProgress.equippedWeaponId).toBe("lance");
  });

  it("claims challenge XP once", () => {
    const progress = createEmptyChallengeProgress();
    progress.bestWave = 5;

    const first = claimChallengeRewards(progress, storage);
    const second = claimChallengeRewards(progress, storage);

    expect(first?.xpGained).toBeGreaterThan(0);
    expect(second).toBeNull();
    expect(accountProgress.claimedChallengeTierIds).toEqual(["survivor:1"]);
  });
});

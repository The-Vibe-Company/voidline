import { beforeEach, describe, expect, it } from "vitest";
import { createDefaultAccountProgress } from "../game/account-progression";
import {
  accountProgress,
  equipWeapon,
  initializeAccountProgress,
  purchaseShopItem,
  resetAccountProgress,
  restoreAccountProgress,
  selectCharacter,
  selectStartStage,
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

describe("crystal persistence and unlock shop", () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
    resetAccountProgress(storage);
  });

  it("loads default meta progress", () => {
    initializeAccountProgress(storage);

    expect(accountProgress.crystals).toBe(0);
    expect(accountProgress.selectedCharacterId).toBe("pilot");
    expect(accountProgress.selectedWeaponId).toBe("pulse");
    expect(accountProgress.highestStartStageUnlocked).toBe(1);
  });

  it("preserves stored start-stage unlocks when loading storage", () => {
    storage.setItem(
      "voidline:metaProgress:v1",
      JSON.stringify({
        highestStageCleared: 0,
        highestStartStageUnlocked: 9,
        selectedStartStage: 9,
      }),
    );

    initializeAccountProgress(storage);

    expect(accountProgress.highestStartStageUnlocked).toBe(9);
    expect(accountProgress.selectedStartStage).toBe(9);
  });

  it("derives start-stage unlocks from cleared stages when storage is lower", () => {
    storage.setItem(
      "voidline:metaProgress:v1",
      JSON.stringify({
        highestStageCleared: 3,
        highestStartStageUnlocked: 1,
        selectedStartStage: 4,
      }),
    );

    initializeAccountProgress(storage);

    expect(accountProgress.highestStartStageUnlocked).toBe(4);
    expect(accountProgress.selectedStartStage).toBe(4);
  });

  it("keeps stored records consistent with unlocked start stages", () => {
    storage.setItem(
      "voidline:metaProgress:v1",
      JSON.stringify({
        highestStageCleared: 1,
        highestStartStageUnlocked: 2,
        records: { bestStage: 1 },
      }),
    );

    initializeAccountProgress(storage);

    expect(accountProgress.records.bestStage).toBe(2);
  });

  it("accepts legacy purchased ids when they still match shop unlocks", () => {
    storage.setItem(
      "voidline:metaProgress:v1",
      JSON.stringify({
        crystals: 100,
        purchasedIds: ["weapon:scatter"],
        selectedWeaponId: "scatter",
      }),
    );

    initializeAccountProgress(storage);

    expect(accountProgress.purchasedUnlockIds).toContain("weapon:scatter");
    expect(accountProgress.selectedWeaponId).toBe("scatter");
  });

  it("falls back to the previous account storage key when the crystal save is missing", () => {
    storage.setItem(
      "voidline:accountProgress:v1",
      JSON.stringify({
        tokens: 80,
        purchasedIds: ["weapon:scatter"],
        equippedWeaponId: "scatter",
      }),
    );

    initializeAccountProgress(storage);

    expect(accountProgress.crystals).toBe(80);
    expect(accountProgress.purchasedUnlockIds).toContain("weapon:scatter");
    expect(accountProgress.selectedWeaponId).toBe("scatter");
    expect(storage.getItem("voidline:metaProgress:v1")).toContain("weapon:scatter");
  });

  it("uses recoverable legacy tokens when a stored crystal balance is malformed", () => {
    storage.setItem(
      "voidline:metaProgress:v1",
      JSON.stringify({
        crystals: "broken",
        tokens: 80,
      }),
    );

    initializeAccountProgress(storage);

    expect(accountProgress.crystals).toBe(80);
  });

  it("clears legacy storage during reset so old saves are not reimported", () => {
    storage.setItem(
      "voidline:accountProgress:v1",
      JSON.stringify({
        tokens: 80,
      }),
    );

    resetAccountProgress(storage);
    initializeAccountProgress(storage);

    expect(accountProgress.crystals).toBe(0);
    expect(storage.getItem("voidline:accountProgress:v1")).toBeNull();
  });

  it("prefers the crystal save over legacy account storage", () => {
    storage.setItem(
      "voidline:accountProgress:v1",
      JSON.stringify({
        tokens: 80,
        purchasedIds: ["weapon:scatter"],
        equippedWeaponId: "scatter",
      }),
    );
    storage.setItem(
      "voidline:metaProgress:v1",
      JSON.stringify({
        crystals: 20,
      }),
    );

    initializeAccountProgress(storage);

    expect(accountProgress.crystals).toBe(20);
    expect(accountProgress.purchasedUnlockIds).not.toContain("weapon:scatter");
    expect(accountProgress.selectedWeaponId).toBe("pulse");
  });

  it("restores in-memory snapshots without dropping last run rewards", () => {
    restoreAccountProgress({
      ...createDefaultAccountProgress(),
      lastRunReward: {
        source: "run",
        crystalsGained: 120,
        newlyUnlockedStartStage: 2,
        newRecords: ["stage"],
        breakdown: {
          durationCrystals: 30,
          stageCrystals: 24,
          bossCrystals: 45,
          scoreCrystals: 9,
          recordCrystals: 12,
          startStageBonusCrystals: 0,
        },
      },
    });

    expect(accountProgress.lastRunReward?.source).toBe("run");
    expect(accountProgress.lastRunReward?.crystalsGained).toBe(120);
  });

  it("refuses purchases without enough crystals", () => {
    const result = purchaseShopItem("technology:crit-array", storage);

    expect(result.ok).toBe(false);
    expect(accountProgress.purchasedUnlockIds).toHaveLength(0);
  });

  it("spends crystals and persists a valid technology purchase", () => {
    restoreAccountProgress({ ...createDefaultAccountProgress(), crystals: 55 });

    const result = purchaseShopItem("technology:crit-array", storage);

    expect(result.ok).toBe(true);
    expect(accountProgress.crystals).toBe(0);
    expect(accountProgress.spentCrystals).toBe(55);
    expect(accountProgress.purchasedUnlockIds).toContain("technology:crit-array");
    expect(storage.getItem("voidline:metaProgress:v1")).toContain("technology:crit-array");
  });

  it("keeps the last run reward visible after a shop purchase", () => {
    restoreAccountProgress({ ...createDefaultAccountProgress(), crystals: 55 });
    accountProgress.lastRunReward = {
      source: "run",
      crystalsGained: 86,
      newlyUnlockedStartStage: null,
      newRecords: ["score"],
      breakdown: {
        durationCrystals: 20,
        stageCrystals: 18,
        bossCrystals: 0,
        scoreCrystals: 18,
        recordCrystals: 30,
        startStageBonusCrystals: 0,
      },
    };

    purchaseShopItem("technology:crit-array", storage);

    expect(accountProgress.lastRunReward?.source).toBe("run");
    expect(accountProgress.lastRunReward?.crystalsGained).toBe(86);
  });

  it("requires objective gates before crystal purchases", () => {
    restoreAccountProgress({ ...createDefaultAccountProgress(), crystals: 200 });

    expect(purchaseShopItem("weapon:lance", storage).ok).toBe(false);

    restoreAccountProgress({
      ...createDefaultAccountProgress(),
      crystals: 200,
      highestStageCleared: 1,
      highestStartStageUnlocked: 2,
      records: { ...createDefaultAccountProgress().records, bestStage: 2, bossKills: 1 },
    });

    expect(purchaseShopItem("weapon:lance", storage).ok).toBe(true);
  });

  it("only selects purchased characters and weapons", () => {
    expect(selectCharacter("tank", storage)).toBe(false);
    expect(equipWeapon("lance", storage)).toBe(false);

    restoreAccountProgress({
      ...createDefaultAccountProgress(),
      purchasedUnlockIds: ["character:tank", "weapon:lance"],
    });

    expect(selectCharacter("tank", storage)).toBe(true);
    expect(equipWeapon("lance", storage)).toBe(true);
    expect(accountProgress.selectedCharacterId).toBe("tank");
    expect(accountProgress.selectedWeaponId).toBe("lance");
  });

  it("selects only unlocked start stages", () => {
    expect(selectStartStage(2, storage)).toBe(false);

    restoreAccountProgress({
      ...createDefaultAccountProgress(),
      highestStageCleared: 1,
      highestStartStageUnlocked: 2,
    });

    expect(selectStartStage(2, storage)).toBe(true);
    expect(accountProgress.selectedStartStage).toBe(2);
  });
});

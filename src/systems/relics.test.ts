import { beforeEach, describe, expect, it } from "vitest";
import { createPlayerState, upgradeTiers } from "../game/balance";
import { findRelic } from "../game/relic-catalog";
import { findUpgrade } from "../game/upgrade-catalog";
import { ownedRelics, ownedUpgrades, player, unlockedRelics } from "../state";
import {
  applyRelicChoice,
  initializeRelicUnlocks,
  resetRelicUnlocks,
  unlockRelicsForBossWave,
} from "./relics";
import { resetAccountProgress } from "./account";

const tier = upgradeTiers[0]!;

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

describe("relic unlock persistence", () => {
  beforeEach(() => {
    Object.assign(player, createPlayerState());
    ownedRelics.clear();
    ownedUpgrades.clear();
    unlockedRelics.clear();
    resetAccountProgress(null);
  });

  it("loads default and stored relic unlocks", () => {
    const storage = new MemoryStorage();
    storage.setItem("voidline:unlockedRelics", JSON.stringify(["splitter-matrix"]));

    initializeRelicUnlocks(storage);

    expect(unlockedRelics.has("rail-focus")).toBe(true);
    expect(unlockedRelics.has("splitter-matrix")).toBe(true);
  });

  it("persists new boss milestone unlocks", () => {
    const storage = new MemoryStorage();

    initializeRelicUnlocks(storage);
    const unlocked = unlockRelicsForBossWave(10, storage);

    expect(unlocked).toEqual(["splitter-matrix"]);
    expect(storage.getItem("voidline:unlockedRelics")).toContain("splitter-matrix");
  });

  it("resets stored boss milestone unlocks to starter relics", () => {
    const storage = new MemoryStorage();

    initializeRelicUnlocks(storage);
    unlockRelicsForBossWave(10, storage);
    resetRelicUnlocks(storage);

    expect(unlockedRelics.has("rail-focus")).toBe(true);
    expect(unlockedRelics.has("splitter-matrix")).toBe(false);
    expect(storage.getItem("voidline:unlockedRelics")).toBeNull();
  });

  it("refreshes player traits after applying a relic choice", () => {
    ownedUpgrades.set("magnet-array:standard", {
      upgrade: findUpgrade("magnet-array"),
      tier,
      count: 1,
    });

    applyRelicChoice({ relic: findRelic("magnetized-map") });

    expect(ownedRelics.get("magnetized-map")?.count).toBe(1);
    expect(player.traits.magnetStorm).toBe(true);
  });
});

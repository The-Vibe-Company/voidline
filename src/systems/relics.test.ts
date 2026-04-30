import { beforeEach, describe, expect, it } from "vitest";
import { createPlayerState, upgradeTiers } from "../game/balance";
import { DEFAULT_RELIC_IDS, findRelic } from "../game/relic-catalog";
import { findUpgrade } from "../game/upgrade-catalog";
import { ownedRelics, ownedUpgrades, player, unlockedRelics } from "../state";
import { resetSimulation } from "../simulation/simulation";
import { applyUpgrade } from "./upgrades";
import {
  applyRelicChoice,
  initializeRelicUnlocks,
  pickRelicChoices,
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
    resetSimulation(7);
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
    applyUpgrade({
      upgrade: findUpgrade("magnet-array"),
      tier,
    });

    applyRelicChoice({ relic: findRelic("magnetized-map") });

    expect(ownedRelics.get("magnetized-map")?.count).toBe(1);
    expect(player.traits.magnetStorm).toBe(true);
  });

  it("bridges Rust fallback relic choices into TypeScript catalog records", () => {
    for (const relicId of DEFAULT_RELIC_IDS) {
      applyRelicChoice({ relic: findRelic(relicId) });
    }

    const choices = pickRelicChoices(1);

    expect(choices).toHaveLength(1);
    expect(choices[0]!.relic.id).toBe("field-repair");
  });
});

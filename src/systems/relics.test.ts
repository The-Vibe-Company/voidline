import { beforeEach, describe, expect, it } from "vitest";
import { unlockedRelics } from "../state";
import { initializeRelicUnlocks, unlockRelicsForBossWave } from "./relics";

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("relic unlock persistence", () => {
  beforeEach(() => {
    unlockedRelics.clear();
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
});

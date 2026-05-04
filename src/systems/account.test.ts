import { describe, expect, it } from "vitest";
import {
  accountProgress,
  initializeAccountProgress,
  recordRun,
  resetAccountProgress,
} from "./account";

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

describe("account v3", () => {
  it("default progress starts with zero records", () => {
    const storage = new MemoryStorage();
    initializeAccountProgress(storage);
    expect(accountProgress.records.bestMiniWave).toBe(0);
    expect(accountProgress.records.bestScore).toBe(0);
  });

  it("migrates legacy v2 storage records", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      "voidline:metaProgress:v2",
      JSON.stringify({
        crystals: 250,
        spentCrystals: 0,
        upgradeLevels: { "meta:max-hp": 2 },
        records: { bestWave: 7, bestScore: 12000, bestTimeSeconds: 320 },
      }),
    );
    resetAccountProgress(storage);
    initializeAccountProgress(storage);
    expect(accountProgress.records.bestMiniWave).toBe(7);
    expect(accountProgress.records.bestScore).toBe(12000);
    expect(storage.getItem("voidline:metaProgress:v2")).toBeNull();
    expect(storage.getItem("voidline:metaProgress:v3")).not.toBeNull();
  });

  it("recordRun bumps records and flags boss kills", () => {
    const storage = new MemoryStorage();
    resetAccountProgress(storage);
    initializeAccountProgress(storage);
    const reward = recordRun({
      miniWaveReached: 6,
      bossDefeated: true,
      elapsedSeconds: 90,
      score: 5000,
      kills: 60,
    });
    expect(reward.bossBonus).toBe(true);
    expect(accountProgress.records.bestScore).toBe(5000);
    expect(accountProgress.records.bossKills).toBe(1);
  });

  it("recordRun does not bump records when worse than current", () => {
    const storage = new MemoryStorage();
    resetAccountProgress(storage);
    initializeAccountProgress(storage);
    accountProgress.records.bestScore = 9999;
    const reward = recordRun({
      miniWaveReached: 1,
      bossDefeated: false,
      elapsedSeconds: 5,
      score: 100,
      kills: 1,
    });
    expect(reward.newRecords).not.toContain("score");
    expect(accountProgress.records.bestScore).toBe(9999);
  });
});

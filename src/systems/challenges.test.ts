import { beforeEach, describe, expect, it } from "vitest";
import {
  challengeProgress,
  initializeChallenges,
  incrementChallengeProgress,
  recordChallengeProgress,
  resetChallengeProgress,
} from "./challenges";

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

describe("challenge persistence", () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
    resetChallengeProgress(storage);
  });

  it("loads empty progress by default", () => {
    initializeChallenges(storage);

    expect(challengeProgress).toEqual({
      bestWave: 0,
      bossKills: 0,
      totalKills: 0,
      bestScore: 0,
      bestLevel: 0,
    });
  });

  it("restores stored progress", () => {
    storage.setItem(
      "voidline:challengeProgress",
      JSON.stringify({ bestWave: 12, bossKills: 2, totalKills: 155, bestScore: 8_500, bestLevel: 9 }),
    );

    initializeChallenges(storage);

    expect(challengeProgress.bestWave).toBe(12);
    expect(challengeProgress.bossKills).toBe(2);
    expect(challengeProgress.totalKills).toBe(155);
    expect(challengeProgress.bestScore).toBe(8_500);
    expect(challengeProgress.bestLevel).toBe(9);
  });

  it("ignores invalid stored JSON", () => {
    storage.setItem("voidline:challengeProgress", "{nope");

    initializeChallenges(storage);

    expect(challengeProgress.bestWave).toBe(0);
    expect(challengeProgress.totalKills).toBe(0);
  });

  it("saves after progress changes", () => {
    initializeChallenges(storage);

    recordChallengeProgress("bestScore", 2_500, storage);
    incrementChallengeProgress("totalKills", 3, storage);

    const stored = JSON.parse(storage.getItem("voidline:challengeProgress") ?? "{}");
    expect(stored.bestScore).toBe(2_500);
    expect(stored.totalKills).toBe(3);
  });

  it("keeps cumulative counters monotonic", () => {
    initializeChallenges(storage);
    incrementChallengeProgress("totalKills", 3, storage);
    incrementChallengeProgress("totalKills", -2, storage);
    incrementChallengeProgress("totalKills", 0.5, storage);

    expect(challengeProgress.totalKills).toBe(3);
  });

  it("resets stored and in-memory progress", () => {
    initializeChallenges(storage);
    recordChallengeProgress("bestWave", 15, storage);

    resetChallengeProgress(storage);

    expect(storage.getItem("voidline:challengeProgress")).toBeNull();
    expect(challengeProgress.bestWave).toBe(0);
  });
});

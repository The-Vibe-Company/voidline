import { describe, expect, it } from "vitest";
import {
  challengeCatalog,
  createEmptyChallengeProgress,
  totalUnlockedTiers,
  unlockedTierCount,
} from "./challenge-catalog";

describe("challenge catalog", () => {
  it("keeps challenge tiers sorted by threshold", () => {
    for (const challenge of challengeCatalog) {
      const thresholds = challenge.tiers.map((tier) => tier.threshold);
      expect(thresholds).toEqual([...thresholds].sort((a, b) => a - b));
    }
  });

  it("computes unlocked tiers from progress", () => {
    const progress = createEmptyChallengeProgress();
    progress.bestWave = 10;
    const survivor = challengeCatalog.find((challenge) => challenge.id === "survivor")!;

    expect(unlockedTierCount(survivor, progress)).toBe(2);
  });

  it("counts all unlocked objective tiers", () => {
    const progress = createEmptyChallengeProgress();
    progress.bestWave = 20;
    progress.bossKills = 3;
    progress.totalKills = 600;
    progress.bestScore = 20_000;
    progress.bestLevel = 15;

    expect(totalUnlockedTiers(progress)).toBe(16);
  });

  it("does not count tiers beyond the last threshold", () => {
    const capped = createEmptyChallengeProgress();
    capped.bestWave = 99;
    capped.bossKills = 99;
    capped.totalKills = 99_999;
    capped.bestScore = 999_999;
    capped.bestLevel = 99;

    const exact = createEmptyChallengeProgress();
    exact.bestWave = 20;
    exact.bossKills = 3;
    exact.totalKills = 600;
    exact.bestScore = 20_000;
    exact.bestLevel = 15;

    expect(totalUnlockedTiers(capped)).toBe(totalUnlockedTiers(exact));
  });
});

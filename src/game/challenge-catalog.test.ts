import { describe, expect, it } from "vitest";
import {
  challengeCatalog,
  createEmptyChallengeProgress,
  totalPermanentBonus,
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

  it("sums permanent bonuses from unlocked tiers", () => {
    const progress = createEmptyChallengeProgress();
    progress.bestWave = 20;
    progress.bossKills = 3;
    progress.totalKills = 600;
    progress.bestScore = 20_000;
    progress.bestLevel = 15;

    const bonus = totalPermanentBonus(progress);
    expect(bonus.speedPct).toBeCloseTo(0.15);
    expect(bonus.damagePct).toBeCloseTo(0.13);
    expect(bonus.fireRatePct).toBeCloseTo(0.12);
    expect(bonus.maxHpFlat).toBe(30);
    expect(bonus.pickupRadiusPct).toBeCloseTo(0.16);
  });

  it("does not grant bonuses beyond the last tier", () => {
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

    expect(totalPermanentBonus(capped)).toEqual(totalPermanentBonus(exact));
  });
});

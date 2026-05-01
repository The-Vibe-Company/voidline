import { describe, expect, it } from "vitest";
import {
  applyCrystalReward,
  computeRunCrystalBreakdown,
  createDefaultAccountProgress,
  totalCrystalBreakdown,
} from "./account-progression";

describe("crystal account progression", () => {
  it("turns stronger run results into more crystals", () => {
    const progress = createDefaultAccountProgress();
    const early = totalCrystalBreakdown(
      computeRunCrystalBreakdown(progress, {
        stage: 1,
        startStage: 1,
        elapsedSeconds: 72,
        runLevel: 2,
        score: 800,
        bossStages: [],
      }),
    );
    const clear = totalCrystalBreakdown(
      computeRunCrystalBreakdown(progress, {
        stage: 2,
        startStage: 1,
        elapsedSeconds: 640,
        runLevel: 9,
        score: 18_000,
        bossStages: [1],
      }),
    );

    expect(clear).toBeGreaterThan(early);
  });

  it("adds a crystal bonus when the run starts from stage two", () => {
    const progress = createDefaultAccountProgress();
    const base = computeRunCrystalBreakdown(progress, {
      stage: 2,
      startStage: 1,
      elapsedSeconds: 160,
      runLevel: 4,
      score: 4_000,
      bossStages: [],
    });
    const boosted = computeRunCrystalBreakdown(progress, {
      stage: 2,
      startStage: 2,
      elapsedSeconds: 160,
      runLevel: 4,
      score: 4_000,
      bossStages: [],
    });

    expect(boosted.startStageBonusCrystals).toBeGreaterThan(0);
    expect(totalCrystalBreakdown(boosted)).toBeGreaterThan(totalCrystalBreakdown(base));
  });

  it("unlocks the next start stage after a boss clear without spending crystals", () => {
    const progress = createDefaultAccountProgress();

    const reward = applyCrystalReward(progress, {
      stage: 2,
      startStage: 1,
      elapsedSeconds: 620,
      runLevel: 8,
      score: 12_000,
      bossStages: [1],
    });

    expect(progress.highestStageCleared).toBe(1);
    expect(progress.highestStartStageUnlocked).toBe(2);
    expect(progress.selectedStartStage).toBe(2);
    expect(reward.newlyUnlockedStartStage).toBe(2);
    expect(progress.crystals).toBe(reward.crystalsGained);
  });

  it("records records and boss kills once per awarded run", () => {
    const progress = createDefaultAccountProgress();

    const reward = applyCrystalReward(progress, {
      stage: 2,
      startStage: 1,
      elapsedSeconds: 620,
      runLevel: 8,
      score: 12_000,
      bossStages: [1, 1],
    });

    expect(progress.records.bestStage).toBe(2);
    expect(progress.records.bestTimeSeconds).toBe(620);
    expect(progress.records.bestScore).toBe(12_000);
    expect(progress.records.bossKills).toBe(1);
    expect(reward.newRecords).toEqual(expect.arrayContaining(["stage", "temps", "score"]));
  });

  it("derives stage records from the start stage and cleared bosses", () => {
    const progress = createDefaultAccountProgress();

    applyCrystalReward(progress, {
      stage: 3,
      startStage: 1,
      elapsedSeconds: 90,
      runLevel: 2,
      score: 1_000,
      bossStages: [],
    });

    expect(progress.records.bestStage).toBe(1);
    expect(progress.highestStartStageUnlocked).toBe(1);
  });

  it("adds the boss-bounty bonus to bossCrystals per unique boss kill", () => {
    const summary = {
      stage: 2,
      startStage: 1,
      elapsedSeconds: 600,
      runLevel: 8,
      score: 12_000,
      bossStages: [1, 2],
    } as const;

    const baseProgress = createDefaultAccountProgress();
    const base = computeRunCrystalBreakdown(baseProgress, summary);
    expect(base.bossCrystals).toBe(2 * 45);

    const boosted = createDefaultAccountProgress();
    boosted.upgradeLevels["utility:boss-bounty"] = 2;
    const withBounty = computeRunCrystalBreakdown(boosted, summary);
    expect(withBounty.bossCrystals).toBe(2 * (45 + 16));
  });
});

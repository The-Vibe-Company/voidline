import { describe, expect, it } from "vitest";
import {
  accountXpToNextLevel,
  applyAccountXp,
  computeRunAccountXp,
  createDefaultAccountProgress,
  tokenRewardForLevel,
  totalAccountXpBreakdown,
} from "./account-progression";

describe("account progression", () => {
  it("keeps account XP requirements monotonic", () => {
    let previous = accountXpToNextLevel(1);

    for (let level = 2; level <= 40; level += 1) {
      const next = accountXpToNextLevel(level);
      expect(next).toBeGreaterThan(previous);
      previous = next;
    }
  });

  it("only awards tokens on milestone levels", () => {
    expect(tokenRewardForLevel(1)).toBe(0);
    expect(tokenRewardForLevel(2)).toBe(1);
    expect(tokenRewardForLevel(4)).toBe(0);
    expect(tokenRewardForLevel(30)).toBe(1);
    expect(tokenRewardForLevel(40)).toBe(1);
    expect(tokenRewardForLevel(41)).toBe(0);
  });

  it("turns strong run results into more account XP", () => {
    const progress = createDefaultAccountProgress();
    const early = totalAccountXpBreakdown(
      computeRunAccountXp(progress, { wave: 3, runLevel: 2, score: 800, bossWaves: [] }),
    );
    const late = totalAccountXpBreakdown(
      computeRunAccountXp(progress, { wave: 12, runLevel: 8, score: 12_000, bossWaves: [10] }),
    );

    expect(late).toBeGreaterThan(early);
  });

  it("grants first-boss XP only for unseen boss waves", () => {
    const progress = createDefaultAccountProgress();
    progress.bossWavesDefeated = [10];

    const breakdown = computeRunAccountXp(progress, {
      wave: 22,
      runLevel: 11,
      score: 30_000,
      bossWaves: [10, 20],
    });

    expect(breakdown.bossXp).toBe(80);
    expect(breakdown.firstBossXp).toBe(85);
  });

  it("applies level-ups and token milestones once", () => {
    const progress = createDefaultAccountProgress();
    const target = accountXpToNextLevel(1) + accountXpToNextLevel(2);

    const reward = applyAccountXp(progress, target, "run");

    expect(progress.level).toBe(3);
    expect(progress.tokens).toBe(2);
    expect(reward.tokensGained).toBe(2);
  });
});

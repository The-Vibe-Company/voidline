import { describe, expect, it } from "vitest";
import {
  bossBalance,
  nextMiniBossMisses,
  shouldSpawnMiniBoss,
} from "./roguelike";

describe("roguelike wave cadence", () => {
  it("can spawn mini-bosses on former boss-wave milestones", () => {
    for (const wave of [10, 20, 30]) {
      expect(shouldSpawnMiniBoss(wave, bossBalance.miniBoss.guaranteeAfterEligibleWaves, 0)).toBe(
        true,
      );
    }
  });

  it("guarantees a mini-boss after enough eligible misses", () => {
    const guaranteedMisses = bossBalance.miniBoss.guaranteeAfterEligibleWaves - 1;

    expect(shouldSpawnMiniBoss(3, 0, 0.99)).toBe(false);
    expect(shouldSpawnMiniBoss(3, guaranteedMisses, 0.99)).toBe(true);
    expect(nextMiniBossMisses(3, 2, false)).toBe(3);
    expect(nextMiniBossMisses(3, 3, true)).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import {
  basePressureForStage,
  bossBalance,
  nextMiniBossMisses,
  pressureForStageElapsed,
  shouldSpawnMiniBossAtPressure,
} from "./roguelike";

describe("roguelike pressure cadence", () => {
  it("computes pressure only from stage and elapsed time", () => {
    expect(basePressureForStage(1)).toBe(1);
    expect(basePressureForStage(2)).toBe(1 + bossBalance.pressureOffsetPerStage);
    expect(pressureForStageElapsed(1, 0)).toBe(1);
    expect(pressureForStageElapsed(1, 179.9)).toBe(3);
    expect(pressureForStageElapsed(2, 360)).toBe(basePressureForStage(2) + 6);
  });

  it("can spawn mini-bosses on pressure milestones", () => {
    for (const pressure of [10, 20, 30]) {
      expect(
        shouldSpawnMiniBossAtPressure(
          pressure,
          bossBalance.miniBoss.guaranteeAfterEligiblePressures,
          0,
        ),
      ).toBe(true);
    }
  });

  it("guarantees a mini-boss after enough eligible misses", () => {
    const guaranteedMisses = bossBalance.miniBoss.guaranteeAfterEligiblePressures - 1;
    const eligiblePressure = bossBalance.miniBoss.startPressure;

    expect(shouldSpawnMiniBossAtPressure(eligiblePressure, 0, 0.99)).toBe(false);
    expect(shouldSpawnMiniBossAtPressure(eligiblePressure, guaranteedMisses, 0.99)).toBe(true);
    expect(nextMiniBossMisses(eligiblePressure, 2, false)).toBe(3);
    expect(nextMiniBossMisses(eligiblePressure, 3, true)).toBe(0);
  });
});

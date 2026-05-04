import { describe, expect, it } from "vitest";
import {
  BOSS_MINI_WAVE_INDEX,
  MINI_WAVE_COUNT,
  MINI_WAVE_DURATION,
  RUN_TOTAL_DURATION,
  enemyDamageScale,
  enemyHpScale,
  enemySpeedScale,
  findEnemyType,
  isBossMiniWave,
  miniWaveSpawnBudget,
} from "./balance";

describe("balance — 90s mini-wave format", () => {
  it("run total is 150 seconds", () => {
    expect(MINI_WAVE_COUNT).toBe(6);
    expect(MINI_WAVE_DURATION).toBe(25);
    expect(RUN_TOTAL_DURATION).toBe(150);
  });

  it("only the last mini-wave is the boss", () => {
    for (let i = 0; i < MINI_WAVE_COUNT - 1; i += 1) {
      expect(isBossMiniWave(i)).toBe(false);
    }
    expect(isBossMiniWave(BOSS_MINI_WAVE_INDEX)).toBe(true);
  });

  it("enemy scaling stays >= 1 baseline and finite", () => {
    for (let i = 0; i < MINI_WAVE_COUNT; i += 1) {
      expect(enemyHpScale(i)).toBeGreaterThanOrEqual(1);
      expect(enemyHpScale(i)).toBeLessThan(10);
      expect(enemySpeedScale(i)).toBeGreaterThanOrEqual(1);
      expect(enemySpeedScale(i)).toBeLessThanOrEqual(2);
      expect(enemyDamageScale(i)).toBeGreaterThanOrEqual(1);
      expect(enemyDamageScale(i)).toBeLessThanOrEqual(3);
    }
  });

  it("spawn budgets defined for each mini-wave", () => {
    for (let i = 0; i < MINI_WAVE_COUNT; i += 1) {
      expect(miniWaveSpawnBudget(i)).toBeGreaterThan(0);
    }
  });

  it("brute archetype still exists", () => {
    expect(findEnemyType("brute").id).toBe("brute");
  });
});

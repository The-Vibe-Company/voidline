import { describe, expect, it } from "vitest";
import {
  enemyDamageScale,
  enemyHpScale,
  enemySpeedScale,
  isBossWave,
  waveDuration,
  waveSpawnBudget,
} from "./balance";

describe("balance scaling", () => {
  it("waveDuration grows then caps at the max", () => {
    let last = waveDuration(1);
    for (let w = 2; w <= 30; w += 1) {
      const current = waveDuration(w);
      expect(current).toBeGreaterThanOrEqual(last);
      last = current;
    }
    expect(waveDuration(30)).toBeLessThanOrEqual(90);
    expect(waveDuration(30)).toBeGreaterThan(waveDuration(1));
  });

  it("isBossWave triggers every 5 waves", () => {
    expect(isBossWave(1)).toBe(false);
    expect(isBossWave(4)).toBe(false);
    expect(isBossWave(5)).toBe(true);
    expect(isBossWave(10)).toBe(true);
    expect(isBossWave(15)).toBe(true);
  });

  it("enemy scaling stays finite and >= 1 baseline", () => {
    for (let w = 1; w <= 30; w += 1) {
      expect(enemyHpScale(w)).toBeGreaterThanOrEqual(1);
      expect(enemyHpScale(w)).toBeLessThan(20);
      expect(enemySpeedScale(w)).toBeGreaterThanOrEqual(1);
      expect(enemySpeedScale(w)).toBeLessThanOrEqual(2);
      expect(enemyDamageScale(w)).toBeGreaterThanOrEqual(1);
      expect(enemyDamageScale(w)).toBeLessThanOrEqual(3);
    }
  });

  it("waveSpawnBudget grows with wave number", () => {
    expect(waveSpawnBudget(2)).toBeGreaterThan(waveSpawnBudget(1));
    expect(waveSpawnBudget(10)).toBeGreaterThan(waveSpawnBudget(2));
  });

  it("hp scaling stays moderate to keep mid-game playable", () => {
    expect(enemyHpScale(10)).toBeLessThan(2.5);
    expect(enemyHpScale(20)).toBeLessThan(4.0);
  });
});

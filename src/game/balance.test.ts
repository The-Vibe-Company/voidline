import { describe, expect, it } from "vitest";
import {
  boss,
  enemyDamageScale,
  enemyHpScale,
  enemySpeedScale,
  findEnemyType,
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
    expect(enemyHpScale(10)).toBeLessThan(3.0);
    expect(enemyHpScale(20)).toBeLessThan(5.0);
  });

  it("wave 5 boss is meaningfully tanky", () => {
    const bruteHp = findEnemyType("brute").hp;
    const w5BossHp = bruteHp * enemyHpScale(5) * boss.hpMultiplier;
    expect(w5BossHp).toBeGreaterThan(2000);
  });
});

import { describe, expect, it } from "vitest";
import {
  bossDamageAt,
  bossHpAt,
  bossSpeedAt,
  enemyDamageAt,
  enemyHpAt,
  enemySpeedAt,
  rarityProbabilitiesAt,
  rarityWeightsAt,
  spawnGapAt,
  spawnPackChanceAt,
  upgradeUnlocksAt,
  waveTargetAt,
  xpToNextLevelAt,
} from "./balance-curves";
import { balance } from "./balance";
import type { EnemyKind } from "../types";

const ENEMY_KINDS: readonly EnemyKind[] = ["scout", "hunter", "brute"];

describe("enemy stat curves", () => {
  it("are strictly monotonic in HP across waves 1..40", () => {
    for (const kind of ENEMY_KINDS) {
      let previous = enemyHpAt(1, kind);
      for (let wave = 2; wave <= 40; wave += 1) {
        const current = enemyHpAt(wave, kind);
        expect(current).toBeGreaterThan(previous);
        previous = current;
      }
    }
  });

  it("never decreases speed across waves and respects the speed cap", () => {
    for (const kind of ENEMY_KINDS) {
      let previous = enemySpeedAt(1, kind);
      for (let wave = 2; wave <= 60; wave += 1) {
        const current = enemySpeedAt(wave, kind);
        expect(current).toBeGreaterThanOrEqual(previous - 1e-6);
        previous = current;
      }
    }

    const scoutSpeedFar = enemySpeedAt(80, "scout");
    const scoutBase = balance.enemies.find((t) => t.id === "scout")!.speed;
    const speedCap =
      scoutBase * (1 + balance.enemy.speedScaleMax + balance.lateWave.speedScaleMax);
    expect(scoutSpeedFar).toBeLessThanOrEqual(speedCap + 1e-6);
  });

  it("starts boosting damage exactly at the late-wave boundary", () => {
    expect(enemyDamageAt(9, "scout")).toBeCloseTo(
      balance.enemies.find((t) => t.id === "scout")!.damage,
    );
    expect(enemyDamageAt(10, "scout")).toBeGreaterThan(enemyDamageAt(9, "scout"));
    expect(enemyDamageAt(20, "scout")).toBeGreaterThan(enemyDamageAt(10, "scout"));
  });
});

describe("boss stat curves", () => {
  it("scale strictly above the matching base enemy", () => {
    for (const wave of [1, 5, 10, 20]) {
      expect(bossHpAt(wave, "miniBoss")).toBeGreaterThan(enemyHpAt(wave, "scout"));
      expect(bossHpAt(wave, "boss")).toBeGreaterThan(bossHpAt(wave, "miniBoss"));
      expect(bossDamageAt(wave, "boss")).toBeGreaterThan(enemyDamageAt(wave, "scout"));
    }
  });

  it("apply the configured speed multiplier (boss < base, mini-boss < base)", () => {
    const wave = 12;
    const base = enemySpeedAt(wave, "scout");
    expect(bossSpeedAt(wave, "boss")).toBeCloseTo(
      base * balance.bosses.boss.speedMultiplier,
    );
    expect(bossSpeedAt(wave, "miniBoss")).toBeCloseTo(
      base * balance.bosses.miniBoss.speedMultiplier,
    );
  });
});

describe("rarity weights and probabilities", () => {
  it("sum to 1 across waves and ranks", () => {
    for (const wave of [1, 5, 10, 20, 40]) {
      for (const rank of [0, 1, 2, 3]) {
        const probs = rarityProbabilitiesAt(wave, rank);
        const total = probs.standard + probs.rare + probs.prototype + probs.singularity;
        expect(total).toBeCloseTo(1, 6);
      }
    }
  });

  it("never produces negative weights", () => {
    for (let wave = 1; wave <= 60; wave += 1) {
      for (const item of rarityWeightsAt(wave)) {
        expect(item.weight).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("makes singularity unlock exactly at the configured gate", () => {
    const unlockWave = balance.upgrade.gates.singularity.minWave;
    expect(rarityProbabilitiesAt(unlockWave - 1).singularity).toBe(0);
    expect(rarityProbabilitiesAt(unlockWave).singularity).toBeGreaterThan(0);
  });
});

describe("upgrade unlock gates", () => {
  it("exposes a clean boolean view of which tiers are accessible", () => {
    const protoUnlock = balance.upgrade.gates.prototype.minWave;
    const singularityUnlock = balance.upgrade.gates.singularity.minWave;

    expect(upgradeUnlocksAt(1).rare).toBe(true);
    expect(upgradeUnlocksAt(1).prototype).toBe(false);
    expect(upgradeUnlocksAt(1).singularity).toBe(false);
    expect(upgradeUnlocksAt(protoUnlock).prototype).toBe(true);
    expect(upgradeUnlocksAt(singularityUnlock).singularity).toBe(true);
  });
});

describe("rarity distribution stays within target bands across mid-game", () => {
  it("keeps each tier within healthy probability bands averaged over waves 5..15", () => {
    const startWave = 5;
    const endWave = 15;
    const totals: Record<"standard" | "rare" | "prototype" | "singularity", number> = {
      standard: 0,
      rare: 0,
      prototype: 0,
      singularity: 0,
    };
    for (let wave = startWave; wave <= endWave; wave += 1) {
      const probs = rarityProbabilitiesAt(wave);
      totals.standard += probs.standard;
      totals.rare += probs.rare;
      totals.prototype += probs.prototype;
      totals.singularity += probs.singularity;
    }
    const samples = endWave - startWave + 1;
    const avg = {
      standard: totals.standard / samples,
      rare: totals.rare / samples,
      prototype: totals.prototype / samples,
      singularity: totals.singularity / samples,
    };

    expect(avg.standard).toBeGreaterThanOrEqual(0.2);
    expect(avg.standard).toBeLessThanOrEqual(0.65);
    expect(avg.rare).toBeGreaterThanOrEqual(0.2);
    expect(avg.rare).toBeLessThanOrEqual(0.55);
    expect(avg.prototype).toBeGreaterThanOrEqual(0.05);
    expect(avg.prototype).toBeLessThanOrEqual(0.3);
    expect(avg.singularity).toBeGreaterThanOrEqual(0);
    expect(avg.singularity).toBeLessThanOrEqual(0.15);
  });
});

describe("wave & xp curves", () => {
  it("waveTargetAt and xpToNextLevelAt are strictly increasing", () => {
    let prevTarget = waveTargetAt(1);
    let prevXp = xpToNextLevelAt(1);
    for (let i = 2; i <= 40; i += 1) {
      const t = waveTargetAt(i);
      const x = xpToNextLevelAt(i);
      expect(t).toBeGreaterThan(prevTarget);
      expect(x).toBeGreaterThan(prevXp);
      prevTarget = t;
      prevXp = x;
    }
  });

  it("spawnGapAt is non-increasing and bounded by configured min/max", () => {
    let prev = spawnGapAt(1);
    for (let wave = 2; wave <= 60; wave += 1) {
      const gap = spawnGapAt(wave);
      expect(gap).toBeLessThanOrEqual(prev + 1e-6);
      expect(gap).toBeGreaterThanOrEqual(balance.lateWave.spawnGapMin);
      expect(gap).toBeLessThanOrEqual(balance.wave.spawnGapStart);
      prev = gap;
    }
  });

  it("spawnPackChanceAt grows monotonically toward late-wave cap", () => {
    let prev = spawnPackChanceAt(1);
    for (let wave = 2; wave <= 50; wave += 1) {
      const chance = spawnPackChanceAt(wave);
      expect(chance).toBeGreaterThanOrEqual(prev - 1e-9);
      expect(chance).toBeLessThanOrEqual(balance.lateWave.packChanceMax + 1e-6);
      prev = chance;
    }
  });
});

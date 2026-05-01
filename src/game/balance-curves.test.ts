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
  pressureTargetAt,
  xpToNextLevelAt,
} from "./balance-curves";
import { balance } from "./balance";
import type { EnemyKind } from "../types";

const ENEMY_KINDS: readonly EnemyKind[] = ["scout", "hunter", "brute"];

describe("enemy stat curves", () => {
  it("are strictly monotonic in HP across pressures 1..40", () => {
    for (const kind of ENEMY_KINDS) {
      let previous = enemyHpAt(1, kind);
      for (let pressure = 2; pressure <= 40; pressure += 1) {
        const current = enemyHpAt(pressure, kind);
        expect(current).toBeGreaterThan(previous);
        previous = current;
      }
    }
  });

  it("never decreases speed across pressures and respects the speed cap", () => {
    for (const kind of ENEMY_KINDS) {
      let previous = enemySpeedAt(1, kind);
      for (let pressure = 2; pressure <= 60; pressure += 1) {
        const current = enemySpeedAt(pressure, kind);
        expect(current).toBeGreaterThanOrEqual(previous - 1e-6);
        previous = current;
      }
    }

    const scoutSpeedFar = enemySpeedAt(80, "scout");
    const scoutBase = balance.enemies.find((t) => t.id === "scout")!.speed;
    const speedCap =
      scoutBase * (1 + balance.enemy.speedScaleMax + balance.latePressure.speedScaleMax);
    expect(scoutSpeedFar).toBeLessThanOrEqual(speedCap + 1e-6);
  });

  it("starts boosting damage exactly at the late-pressure boundary", () => {
    const startPressure = balance.latePressure.startPressure;
    const baseDamage = balance.enemies.find((t) => t.id === "scout")!.damage;
    expect(enemyDamageAt(startPressure - 1, "scout")).toBeCloseTo(baseDamage);
    expect(enemyDamageAt(startPressure, "scout")).toBeGreaterThan(baseDamage);
    expect(enemyDamageAt(startPressure + 5, "scout")).toBeGreaterThan(
      enemyDamageAt(startPressure, "scout"),
    );
  });
});

describe("boss stat curves", () => {
  it("scale strictly above the matching base enemy", () => {
    for (const pressure of [1, 5, 10, 20]) {
      expect(bossHpAt(pressure, "miniBoss")).toBeGreaterThan(enemyHpAt(pressure, "scout"));
      expect(bossHpAt(pressure, "boss")).toBeGreaterThan(bossHpAt(pressure, "miniBoss"));
      expect(bossDamageAt(pressure, "boss")).toBeGreaterThan(enemyDamageAt(pressure, "scout"));
    }
  });

  it("apply the configured speed multiplier (boss < base, mini-boss < base)", () => {
    const pressure = 12;
    const base = enemySpeedAt(pressure, "scout");
    expect(bossSpeedAt(pressure, "boss")).toBeCloseTo(
      base * balance.bosses.boss.speedMultiplier,
    );
    expect(bossSpeedAt(pressure, "miniBoss")).toBeCloseTo(
      base * balance.bosses.miniBoss.speedMultiplier,
    );
  });
});

describe("rarity weights and probabilities", () => {
  it("sum to 1 across pressures and ranks", () => {
    for (const pressure of [1, 5, 10, 20, 40]) {
      for (const rank of [0, 1, 2, 3]) {
        const probs = rarityProbabilitiesAt(pressure, rank);
        const total = probs.standard + probs.rare + probs.prototype + probs.singularity;
        expect(total).toBeCloseTo(1, 6);
      }
    }
  });

  it("never produces negative weights", () => {
    for (let pressure = 1; pressure <= 60; pressure += 1) {
      for (const item of rarityWeightsAt(pressure)) {
        expect(item.weight).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("makes singularity unlock exactly at the configured gate", () => {
    const unlockPressure = balance.upgrade.gates.singularity.minPressure;
    const fullRank = balance.upgrade.gates.singularity.minRank;
    expect(rarityProbabilitiesAt(unlockPressure - 1, fullRank).singularity).toBe(0);
    expect(rarityProbabilitiesAt(unlockPressure, fullRank).singularity).toBeGreaterThan(0);
  });

  it("hard-gates higher tiers behind rarity rank", () => {
    for (let pressure = 1; pressure <= 40; pressure += 1) {
      const r0 = rarityProbabilitiesAt(pressure, 0);
      expect(r0.standard).toBeCloseTo(1, 6);
      expect(r0.rare).toBe(0);
      expect(r0.prototype).toBe(0);
      expect(r0.singularity).toBe(0);

      const r1 = rarityProbabilitiesAt(pressure, 1);
      expect(r1.prototype).toBe(0);
      expect(r1.singularity).toBe(0);

      const r2 = rarityProbabilitiesAt(pressure, 2);
      expect(r2.singularity).toBe(0);
    }
  });

  it("rewards meta progression: prototype weight grows monotonically with rank past its gate", () => {
    const protoGate = balance.upgrade.gates.prototype.minPressure;
    const protoRank = balance.upgrade.gates.prototype.minRank;
    for (let pressure = protoGate + 2; pressure <= 30; pressure += 1) {
      let prev = 0;
      for (let rank = protoRank; rank <= 3; rank += 1) {
        const proto = rarityWeightsAt(pressure, rank).find((item) => item.tier.id === "prototype")!
          .weight;
        expect(proto).toBeGreaterThan(prev);
        prev = proto;
      }
    }
  });
});

describe("upgrade unlock gates", () => {
  it("exposes a clean boolean view of which tiers are accessible", () => {
    const protoUnlock = balance.upgrade.gates.prototype.minPressure;
    const singularityUnlock = balance.upgrade.gates.singularity.minPressure;

    expect(upgradeUnlocksAt(1).rare).toBe(true);
    expect(upgradeUnlocksAt(1).prototype).toBe(false);
    expect(upgradeUnlocksAt(1).singularity).toBe(false);
    expect(upgradeUnlocksAt(protoUnlock).prototype).toBe(true);
    expect(upgradeUnlocksAt(singularityUnlock).singularity).toBe(true);
  });
});

describe("rarity distribution stays within target bands across mid-game", () => {
  it("keeps each tier within healthy probability bands averaged over pressures 5..15 at full rank", () => {
    const startPressure = 5;
    const endPressure = 15;
    const totals: Record<"standard" | "rare" | "prototype" | "singularity", number> = {
      standard: 0,
      rare: 0,
      prototype: 0,
      singularity: 0,
    };
    for (let pressure = startPressure; pressure <= endPressure; pressure += 1) {
      const probs = rarityProbabilitiesAt(pressure, 3);
      totals.standard += probs.standard;
      totals.rare += probs.rare;
      totals.prototype += probs.prototype;
      totals.singularity += probs.singularity;
    }
    const samples = endPressure - startPressure + 1;
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
    expect(avg.singularity).toBeLessThanOrEqual(0.2);
  });
});

describe("pressure & xp curves", () => {
  it("pressureTargetAt and xpToNextLevelAt are strictly increasing", () => {
    let prevTarget = pressureTargetAt(1);
    let prevXp = xpToNextLevelAt(1);
    for (let i = 2; i <= 40; i += 1) {
      const t = pressureTargetAt(i);
      const x = xpToNextLevelAt(i);
      expect(t).toBeGreaterThan(prevTarget);
      expect(x).toBeGreaterThan(prevXp);
      prevTarget = t;
      prevXp = x;
    }
  });

  it("spawnGapAt is non-increasing and bounded by configured min/max", () => {
    let prev = spawnGapAt(1);
    for (let pressure = 2; pressure <= 60; pressure += 1) {
      const gap = spawnGapAt(pressure);
      expect(gap).toBeLessThanOrEqual(prev + 1e-6);
      expect(gap).toBeGreaterThanOrEqual(balance.latePressure.spawnGapMin);
      expect(gap).toBeLessThanOrEqual(balance.pressure.spawnGapStart);
      prev = gap;
    }
  });

  it("spawnPackChanceAt grows monotonically toward late-pressure cap", () => {
    let prev = spawnPackChanceAt(1);
    for (let pressure = 2; pressure <= 50; pressure += 1) {
      const chance = spawnPackChanceAt(pressure);
      expect(chance).toBeGreaterThanOrEqual(prev - 1e-9);
      expect(chance).toBeLessThanOrEqual(balance.latePressure.packChanceMax + 1e-6);
      prev = chance;
    }
  });
});

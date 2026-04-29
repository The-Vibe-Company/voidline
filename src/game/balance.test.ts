import { describe, expect, it } from "vitest";
import {
  balance,
  createPlayerState,
  enemyTypeWeights,
  experienceDropTotal,
  experienceOrbRadius,
  scaledEnemyStats,
  selectUpgradeTier,
  spawnGap,
  upgradeTierWeights,
  upgradeTiers,
  waveTarget,
  xpToNextLevel,
} from "./balance";
import { availableUpgradesForPlayer, findUpgrade } from "./upgrade-catalog";

function tier(id: string) {
  const found = upgradeTiers.find((item) => item.id === id);
  if (!found) throw new Error(`Missing tier ${id}`);
  return found;
}

describe("balance curves", () => {
  it("keeps XP and wave targets monotonic", () => {
    let previousXp = xpToNextLevel(1);
    let previousTarget = waveTarget(1);

    for (let level = 2; level <= 40; level += 1) {
      const nextXp = xpToNextLevel(level);
      expect(nextXp).toBeGreaterThan(previousXp);
      previousXp = nextXp;
    }

    for (let wave = 2; wave <= 40; wave += 1) {
      const nextTarget = waveTarget(wave);
      expect(nextTarget).toBeGreaterThan(previousTarget);
      previousTarget = nextTarget;
    }
  });

  it("keeps spawn gaps bounded", () => {
    let previousGap = spawnGap(1);

    for (let wave = 1; wave <= 80; wave += 1) {
      const gap = spawnGap(wave);
      expect(gap).toBeGreaterThanOrEqual(balance.wave.spawnGapMin);
      expect(gap).toBeLessThanOrEqual(balance.wave.spawnGapStart);
      expect(gap).toBeLessThanOrEqual(previousGap);
      previousGap = gap;
    }
  });

  it("keeps upgrade tier weights valid", () => {
    for (const wave of [1, 2, 5, 12, 40]) {
      const weights = upgradeTierWeights(wave);
      expect(weights.every((item) => item.weight >= 0)).toBe(true);
      expect(weights.reduce((sum, item) => sum + item.weight, 0)).toBeGreaterThan(0);
    }

    expect(upgradeTierWeights(4).find((item) => item.tier.id === "singularity")?.weight).toBe(0);
    expect(upgradeTierWeights(5).find((item) => item.tier.id === "singularity")?.weight).toBeGreaterThan(0);
    expect(selectUpgradeTier(1, 0).id).toBe("standard");
  });

  it("keeps enemy and XP formulas valid", () => {
    for (const wave of [1, 6, 20]) {
      const weights = enemyTypeWeights(wave);
      expect(weights.every((item) => item.weight >= 0)).toBe(true);
      expect(weights.reduce((sum, item) => sum + item.weight, 0)).toBeCloseTo(1);
    }

    const scout = balance.enemies[0]!;
    expect(scaledEnemyStats(scout, 10).hp).toBeGreaterThan(scout.hp);
    expect(scaledEnemyStats(scout, 10).speed).toBeGreaterThan(scout.speed);
    expect(experienceDropTotal(scout.score, 10)).toBeGreaterThan(
      experienceDropTotal(scout.score, 1),
    );
    expect(experienceOrbRadius(999)).toBe(
      balance.xp.orbRadiusBase + balance.xp.orbRadiusBonusMax,
    );
  });
});

describe("upgrade effects", () => {
  it("applies combat upgrades to an isolated player", () => {
    const target = createPlayerState();

    findUpgrade("twin-cannon").apply(tier("rare"), target);
    expect(target.projectileCount).toBe(3);

    findUpgrade("plasma-core").apply(tier("standard"), target);
    expect(target.fireRate).toBeCloseTo(3 * 1.22);

    findUpgrade("rail-slug").apply(tier("standard"), target);
    expect(target.damage).toBeCloseTo(24 * 1.26);
    expect(target.bulletSpeed).toBeCloseTo(610 * 1.055);
  });

  it("applies defensive and utility upgrades to an isolated player", () => {
    const target = createPlayerState({ hp: 40 });

    findUpgrade("kinetic-shield").apply(tier("standard"), target);
    expect(target.shieldMax).toBe(24);
    expect(target.shield).toBe(24);
    expect(target.shieldRegen).toBeCloseTo(2.4);

    findUpgrade("repair-bay").apply(tier("standard"), target);
    expect(target.maxHp).toBe(120);
    expect(target.hp).toBe(82);

    findUpgrade("magnet-array").apply(tier("standard"), target);
    expect(target.pickupRadius).toBeCloseTo(1.35);
  });

  it("respects upgrade caps", () => {
    const cappedChoicePlayer = createPlayerState({
      drones: balance.upgrade.caps.drones,
      projectileCount: balance.upgrade.caps.projectiles,
      pierce: balance.upgrade.caps.pierce,
    });
    const ids = availableUpgradesForPlayer(cappedChoicePlayer).map((upgrade) => upgrade.id);

    expect(ids).not.toContain("orbital-drone");
    expect(ids).not.toContain("twin-cannon");
    expect(ids).not.toContain("piercer");

    const critPlayer = createPlayerState({ critChance: 0.94 });
    findUpgrade("crit-array").apply(tier("singularity"), critPlayer);
    expect(critPlayer.critChance).toBe(balance.upgrade.caps.critChance);
  });
});

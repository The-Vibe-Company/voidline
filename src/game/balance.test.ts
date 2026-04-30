import { describe, expect, it } from "vitest";
import {
  balance,
  createPlayerState,
  enemyTypeWeights,
  experienceDropTotal,
  experienceOrbRadius,
  latePressure,
  scoreAward,
  scaledEnemyStats,
  selectUpgradeTier,
  spawnGap,
  spawnPackChance,
  upgradeTierWeights,
  upgradeTiers,
  pressureTarget,
  xpToNextLevel,
} from "./balance";
import { availableUpgradesForPlayer, findUpgrade } from "./upgrade-catalog";

function tier(id: string) {
  const found = upgradeTiers.find((item) => item.id === id);
  if (!found) throw new Error(`Missing tier ${id}`);
  return found;
}

describe("balance namespace integrity", () => {
  it("contains no NaN, Infinity, or negative numeric leaves", () => {
    const offenders: string[] = [];
    walk(balance, "balance", (path, value) => {
      if (typeof value !== "number") return;
      if (!Number.isFinite(value)) {
        offenders.push(`${path} = ${value}`);
        return;
      }
      if (value < 0) {
        offenders.push(`${path} = ${value} (negative)`);
      }
    });
    expect(offenders).toEqual([]);
  });

  it("exposes the new namespaces wired in Phase A", () => {
    expect(balance.bosses).toBeDefined();
    expect(balance.bosses.spawnOffsets.miniBoss.eligibleFromPressure).toBe(7);
    expect(balance.synergies.kineticRam.minSpeed).toBe(150);
    expect(balance.synergies.magnetStorm.threshold).toBe(24);
    expect(balance.powerups.heartHealRatio).toBe(0.5);
    expect(balance.powerups.dropChance.brute).toBeGreaterThan(balance.powerups.dropChance.scout);
    expect(balance.player.drone.fireInterval.minSwarm).toBeLessThan(
      balance.player.drone.fireInterval.min,
    );
    expect(balance.progression.relicUnlockStages).toEqual([1, 2, 3]);
  });
});

function walk(
  node: unknown,
  path: string,
  visit: (path: string, value: number) => void,
): void {
  if (node === null || node === undefined) return;
  if (typeof node === "number") {
    visit(path, node);
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((child, index) => walk(child, `${path}[${index}]`, visit));
    return;
  }
  if (typeof node === "object") {
    for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
      walk(child, `${path}.${key}`, visit);
    }
  }
}

describe("balance curves", () => {
  it("keeps XP and pressure targets monotonic", () => {
    let previousXp = xpToNextLevel(1);
    let previousTarget = pressureTarget(1);

    for (let level = 2; level <= 40; level += 1) {
      const nextXp = xpToNextLevel(level);
      expect(nextXp).toBeGreaterThan(previousXp);
      previousXp = nextXp;
    }

    for (let pressure = 2; pressure <= 40; pressure += 1) {
      const nextTarget = pressureTarget(pressure);
      expect(nextTarget).toBeGreaterThan(previousTarget);
      previousTarget = nextTarget;
    }
  });

  it("keeps spawn gaps bounded", () => {
    let previousGap = spawnGap(1);

    for (let pressure = 1; pressure <= 80; pressure += 1) {
      const gap = spawnGap(pressure);
      const minGap =
        latePressure(pressure) > 0
          ? balance.latePressure.spawnGapMin
          : balance.pressure.spawnGapMin;
      expect(gap).toBeGreaterThanOrEqual(minGap);
      expect(gap).toBeLessThanOrEqual(balance.pressure.spawnGapStart);
      expect(gap).toBeLessThanOrEqual(previousGap);
      previousGap = gap;
    }
  });

  it("front-loads the first pressure tempo", () => {
    expect(pressureTarget(1)).toBe(27);
    expect(spawnGap(1)).toBeCloseTo(0.385);
    expect(spawnPackChance(1)).toBeCloseTo(0.12);
    expect(balance.pressure.spawnTimerStart).toBeCloseTo(0.1);
  });

  it("ramps late-game pressure starting from balance.latePressure.startPressure", () => {
    const startPressure = balance.latePressure.startPressure;
    const scout = balance.enemies[0]!;
    const beforeStart = scaledEnemyStats(scout, startPressure - 1);
    const atStart = scaledEnemyStats(scout, startPressure);
    const pressure10 = scaledEnemyStats(scout, 10);
    const pressure40 = scaledEnemyStats(scout, 40);

    expect(latePressure(startPressure - 1)).toBe(0);
    expect(latePressure(startPressure)).toBe(1);
    expect(latePressure(20)).toBe(20 - startPressure + 1);

    expect(pressureTarget(startPressure) - pressureTarget(startPressure - 1)).toBeGreaterThan(0);
    expect(spawnGap(20)).toBe(balance.latePressure.spawnGapMin);
    expect(spawnPackChance(20)).toBeCloseTo(balance.latePressure.packChanceMax);

    expect(beforeStart.damage).toBe(scout.damage);
    expect(atStart.damage).toBeGreaterThan(scout.damage);
    expect(pressure10.hp).toBeGreaterThan(scout.hp);
    expect(pressure10.speed).toBeGreaterThan(scout.speed);
    expect(pressure10.damage).toBeGreaterThan(scout.damage);
    expect(pressure40.speed).toBeCloseTo(
      scout.speed * (1 + balance.enemy.speedScaleMax + balance.latePressure.speedScaleMax),
    );
    expect(pressure40.damage).toBeCloseTo(
      scout.damage * (1 + balance.latePressure.damageScaleMax),
    );
  });

  it("locks the early threat constants used by balance simulations", () => {
    const [scout, hunter, brute] = balance.enemies;

    expect(balance.player.resetInvulnerability).toBeCloseTo(0.2);
    expect(scout).toMatchObject({ hp: 42, speed: 132, damage: 25 });
    expect(hunter).toMatchObject({ hp: 64, speed: 112, damage: 29 });
    expect(brute).toMatchObject({ hp: 130, speed: 72, damage: 40 });
    expect(balance.enemy.hunterChancePerPressure).toBeCloseTo(0.07);
    expect(balance.enemy.bruteChancePerPressure).toBeCloseTo(0.05);
    expect(balance.enemy.bruteChanceOffsetPressure).toBe(2);
  });

  it("awards more visible score as pressures advance", () => {
    const baseScore = balance.enemies[0]!.score;

    expect(scoreAward(baseScore, 1)).toBe(47);
    expect(scoreAward(baseScore, 6)).toBe(65);
    expect(scoreAward(baseScore, 20)).toBe(114);
    expect(scoreAward(baseScore, 1)).toBeGreaterThan(baseScore);
    expect(scoreAward(baseScore, 6)).toBeGreaterThan(scoreAward(baseScore, 1));
    expect(scoreAward(baseScore, 20)).toBeGreaterThan(scoreAward(baseScore, 6));
  });

  it("keeps upgrade tier weights valid", () => {
    for (const pressure of [1, 2, 5, 12, 40]) {
      const weights = upgradeTierWeights(pressure);
      expect(weights.every((item) => item.weight >= 0)).toBe(true);
      expect(weights.reduce((sum, item) => sum + item.weight, 0)).toBeGreaterThan(0);
    }

    const singularityGate = balance.upgrade.gates.singularity.minPressure;
    expect(
      upgradeTierWeights(singularityGate - 1).find((item) => item.tier.id === "singularity")
        ?.weight,
    ).toBe(0);
    expect(
      upgradeTierWeights(singularityGate).find((item) => item.tier.id === "singularity")?.weight,
    ).toBeGreaterThan(0);
    expect(selectUpgradeTier(1, 0).id).toBe("standard");
  });

  it("lets account rarity ranks tilt tier odds without early singularities", () => {
    const basePressureFive = upgradeTierWeights(5, 0);
    const boostedPressureFive = upgradeTierWeights(5, 3);
    const baseRare = basePressureFive.find((item) => item.tier.id === "rare")!.weight;
    const boostedRare = boostedPressureFive.find((item) => item.tier.id === "rare")!.weight;

    expect(boostedRare).toBeGreaterThan(baseRare);
    const singularityGate = balance.upgrade.gates.singularity.minPressure;
    expect(
      upgradeTierWeights(singularityGate - 1, 3).find((item) => item.tier.id === "singularity")
        ?.weight,
    ).toBe(0);
  });

  it("keeps enemy and XP formulas valid", () => {
    for (const pressure of [1, 6, 20]) {
      const weights = enemyTypeWeights(pressure);
      expect(weights.every((item) => item.weight >= 0)).toBe(true);
      expect(weights.reduce((sum, item) => sum + item.weight, 0)).toBeCloseTo(1);
    }

    const scout = balance.enemies[0]!;
    expect(scaledEnemyStats(scout, 10).hp).toBeGreaterThan(scout.hp);
    expect(scaledEnemyStats(scout, 10).speed).toBeGreaterThan(scout.speed);
    expect(scaledEnemyStats(scout, 10).damage).toBeGreaterThan(scout.damage);
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
    const fireRateEffect = balance.upgrade.effects.fireRate;
    const damageEffect = balance.upgrade.effects.damage;
    const bulletSpeedEffect = balance.upgrade.effects.bulletSpeed;

    findUpgrade("twin-cannon").apply(tier("rare"), target);
    expect(target.projectileCount).toBe(3);

    findUpgrade("plasma-core").apply(tier("standard"), target);
    expect(target.fireRate).toBeCloseTo(3 * (1 + fireRateEffect));

    findUpgrade("rail-slug").apply(tier("standard"), target);
    expect(target.damage).toBeCloseTo(24 * (1 + damageEffect));
    expect(target.bulletSpeed).toBeCloseTo(610 * (1 + bulletSpeedEffect));
  });

  it("applies defensive and utility upgrades to an isolated player", () => {
    const target = createPlayerState({ hp: 40 });
    const shield = balance.upgrade.effects.shield;
    const regen = balance.upgrade.effects.shieldRegen;
    const maxHpBonus = balance.upgrade.effects.maxHp;
    const pickup = balance.upgrade.effects.pickupRadius;

    findUpgrade("kinetic-shield").apply(tier("standard"), target);
    expect(target.shieldMax).toBe(shield);
    expect(target.shield).toBe(shield);
    expect(target.shieldRegen).toBeCloseTo(regen);
    expect(target.maxHp).toBe(100 + maxHpBonus);
    expect(target.hp).toBe(40 + Math.round(maxHpBonus * 0.65));

    findUpgrade("magnet-array").apply(tier("standard"), target);
    expect(target.pickupRadius).toBeCloseTo(1 + pickup);
  });

  it("respects upgrade caps", () => {
    const cappedChoicePlayer = createPlayerState({
      drones: balance.upgrade.caps.drones,
      projectileCount: balance.upgrade.caps.projectiles,
      pierce: balance.upgrade.caps.pierce,
    });
    const allTechnologies = new Set([
      "twin-cannon",
      "plasma-core",
      "rail-slug",
      "ion-engine",
      "magnet-array",
      "kinetic-shield",
      "crit-array",
      "heavy-caliber",
    ]);
    const allTags = new Set(["cannon", "salvage", "magnet", "shield", "crit", "pierce", "drone"] as const);
    const ids = availableUpgradesForPlayer(
      cappedChoicePlayer,
      "lance",
      allTechnologies,
      undefined,
      allTags,
    ).map((upgrade) => upgrade.id);

    expect(ids).not.toContain("drone-uplink");
    expect(ids).not.toContain("twin-cannon");
    expect(ids).not.toContain("lance-capacitor");

    const critPlayer = createPlayerState({ critChance: 0.94 });
    findUpgrade("crit-array").apply(tier("singularity"), critPlayer);
    expect(critPlayer.critChance).toBe(balance.upgrade.caps.critChance);

    const nearCapPlayer = createPlayerState({
      drones: balance.upgrade.caps.drones - 1,
      projectileCount: balance.upgrade.caps.projectiles - 1,
      pierce: balance.upgrade.caps.pierce - 1,
    });
    findUpgrade("drone-uplink").apply(tier("singularity"), nearCapPlayer);
    findUpgrade("twin-cannon").apply(tier("singularity"), nearCapPlayer);
    findUpgrade("lance-capacitor").apply(tier("singularity"), nearCapPlayer);

    expect(nearCapPlayer.drones).toBe(balance.upgrade.caps.drones);
    expect(nearCapPlayer.projectileCount).toBe(balance.upgrade.caps.projectiles);
    expect(nearCapPlayer.pierce).toBe(balance.upgrade.caps.pierce);
  });
});

describe("multiplicative upgrade additivity", () => {
  it("stacks the same percentage upgrade additively across N applications", () => {
    const target = createPlayerState();
    const upgrade = findUpgrade("plasma-core");
    const standardTier = tier("standard");
    const effect = balance.upgrade.effects.fireRate;

    for (let n = 1; n <= 5; n += 1) {
      upgrade.apply(standardTier, target);
      const expectedAdditive = balance.player.stats.fireRate * (1 + n * effect);
      const wrongMultiplicative = balance.player.stats.fireRate * (1 + effect) ** n;
      expect(target.fireRate).toBeCloseTo(expectedAdditive);
      if (n >= 2) expect(target.fireRate).not.toBeCloseTo(wrongMultiplicative);
    }
  });

  it("sums contributions from different upgrades sharing the same stat", () => {
    const target = createPlayerState();
    findUpgrade("rail-slug").apply(tier("standard"), target);
    findUpgrade("lance-capacitor").apply(tier("standard"), target);

    const expected =
      balance.player.stats.damage *
      (1 + balance.upgrade.effects.damage + 0.18);
    expect(target.damage).toBeCloseTo(expected);
  });

  it("is order-independent for multiplicative upgrades (commutativity)", () => {
    const a = createPlayerState();
    const b = createPlayerState();
    findUpgrade("plasma-core").apply(tier("standard"), a);
    findUpgrade("plasma-core").apply(tier("prototype"), a);

    findUpgrade("plasma-core").apply(tier("prototype"), b);
    findUpgrade("plasma-core").apply(tier("standard"), b);

    expect(a.fireRate).toBeCloseTo(b.fireRate);
  });

  it("applies the additive rule to percentage technologies", () => {
    const cases = [
      { id: "plasma-core", stat: "fireRate", effect: balance.upgrade.effects.fireRate },
      { id: "ion-engine", stat: "speed", effect: balance.upgrade.effects.speed },
      { id: "magnet-array", stat: "pickupRadius", effect: balance.upgrade.effects.pickupRadius },
      { id: "heavy-caliber", stat: "bulletRadius", effect: balance.upgrade.effects.bulletRadius },
    ] as const;
    const t = tier("standard");

    for (const { id, stat, effect } of cases) {
      const target = createPlayerState();
      findUpgrade(id).apply(t, target);
      findUpgrade(id).apply(t, target);

      const expectedAdditive = balance.player.stats[stat] * (1 + 2 * effect);
      const wrongMultiplicative = balance.player.stats[stat] * (1 + effect) ** 2;
      expect(target[stat]).toBeCloseTo(expectedAdditive);
      expect(target[stat]).not.toBeCloseTo(wrongMultiplicative);
    }
  });
});

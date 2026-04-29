import { describe, expect, it } from "vitest";
import {
  balance,
  createPlayerState,
  enemyTypeWeights,
  experienceDropTotal,
  experienceOrbRadius,
  lateWavePressure,
  scoreAward,
  scaledEnemyStats,
  selectUpgradeTier,
  spawnGap,
  spawnPackChance,
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
      const minGap =
        lateWavePressure(wave) > 0
          ? balance.lateWave.spawnGapMin
          : balance.wave.spawnGapMin;
      expect(gap).toBeGreaterThanOrEqual(minGap);
      expect(gap).toBeLessThanOrEqual(balance.wave.spawnGapStart);
      expect(gap).toBeLessThanOrEqual(previousGap);
      previousGap = gap;
    }
  });

  it("front-loads the first wave tempo", () => {
    expect(waveTarget(1)).toBe(27);
    expect(waveTarget(10)).toBe(94);
    expect(spawnGap(1)).toBeCloseTo(0.39);
    expect(spawnGap(10)).toBeCloseTo(0.247);
    expect(spawnPackChance(1)).toBeCloseTo(0.12);
    expect(spawnPackChance(10)).toBeCloseTo(0.64);
    expect(balance.wave.spawnTimerStart).toBeCloseTo(0.1);
  });

  it("keeps the late-game pressure boundary at wave 10", () => {
    const scout = balance.enemies[0]!;
    const wave9 = scaledEnemyStats(scout, 9);
    const wave10 = scaledEnemyStats(scout, 10);
    const wave20 = scaledEnemyStats(scout, 20);
    const wave40 = scaledEnemyStats(scout, 40);

    expect(lateWavePressure(9)).toBe(0);
    expect(lateWavePressure(10)).toBe(1);
    expect(lateWavePressure(20)).toBe(11);

    expect(waveTarget(9)).toBe(81);
    expect(waveTarget(10)).toBe(94);
    expect(waveTarget(20)).toBe(236);
    expect(waveTarget(10) - waveTarget(9)).toBe(13);

    expect(spawnGap(9)).toBeCloseTo(0.27);
    expect(spawnGap(10)).toBeCloseTo(0.247);
    expect(spawnGap(20)).toBe(balance.lateWave.spawnGapMin);
    expect(spawnPackChance(9)).toBeCloseTo(balance.wave.packChanceMax);
    expect(spawnPackChance(10)).toBeCloseTo(0.64);
    expect(spawnPackChance(20)).toBeCloseTo(balance.lateWave.packChanceMax);

    expect(wave9.damage).toBe(scout.damage);
    expect(wave10.hp).toBeCloseTo(65.31);
    expect(wave10.speed).toBeCloseTo(163.416);
    expect(wave10.damage).toBeCloseTo(26);
    expect(wave20.hp).toBeCloseTo(109.41);
    expect(wave20.damage).toBeCloseTo(36);
    expect(wave40.speed).toBeCloseTo(
      scout.speed * (1 + balance.enemy.speedScaleMax + balance.lateWave.speedScaleMax),
    );
    expect(wave40.damage).toBeCloseTo(
      scout.damage * (1 + balance.lateWave.damageScaleMax),
    );
  });

  it("locks the early threat constants used by balance simulations", () => {
    const [scout, hunter, brute] = balance.enemies;

    expect(balance.player.resetInvulnerability).toBeCloseTo(0.2);
    expect(scout).toMatchObject({ hp: 42, speed: 132, damage: 25 });
    expect(hunter).toMatchObject({ hp: 64, speed: 112, damage: 29 });
    expect(brute).toMatchObject({ hp: 130, speed: 72, damage: 40 });
    expect(balance.enemy.hunterChancePerWave).toBeCloseTo(0.05);
    expect(balance.enemy.bruteChancePerWave).toBeCloseTo(0.05);
  });

  it("awards more visible score as waves advance", () => {
    const baseScore = balance.enemies[0]!.score;

    expect(scoreAward(baseScore, 1)).toBe(47);
    expect(scoreAward(baseScore, 6)).toBe(65);
    expect(scoreAward(baseScore, 20)).toBe(114);
    expect(scoreAward(baseScore, 1)).toBeGreaterThan(baseScore);
    expect(scoreAward(baseScore, 6)).toBeGreaterThan(scoreAward(baseScore, 1));
    expect(scoreAward(baseScore, 20)).toBeGreaterThan(scoreAward(baseScore, 6));
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

  it("lets account rarity ranks tilt tier odds without early singularities", () => {
    const baseWaveFive = upgradeTierWeights(5, 0);
    const boostedWaveFive = upgradeTierWeights(5, 3);
    const baseRare = baseWaveFive.find((item) => item.tier.id === "rare")!.weight;
    const boostedRare = boostedWaveFive.find((item) => item.tier.id === "rare")!.weight;

    expect(boostedRare).toBeGreaterThan(baseRare);
    expect(upgradeTierWeights(4, 3).find((item) => item.tier.id === "singularity")?.weight).toBe(0);
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

    const nearCapPlayer = createPlayerState({
      drones: balance.upgrade.caps.drones - 1,
      projectileCount: balance.upgrade.caps.projectiles - 1,
      pierce: balance.upgrade.caps.pierce - 1,
    });
    findUpgrade("orbital-drone").apply(tier("singularity"), nearCapPlayer);
    findUpgrade("twin-cannon").apply(tier("singularity"), nearCapPlayer);
    findUpgrade("piercer").apply(tier("singularity"), nearCapPlayer);

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
    findUpgrade("piercer").apply(tier("standard"), target);

    const expected =
      balance.player.stats.damage *
      (1 + balance.upgrade.effects.damage + balance.upgrade.effects.pierceDamage);
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

  it("applies the additive rule to all six percentage upgrades", () => {
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

export const bossBalance = {
  bossInterval: 10,
  boss: {
    hpMultiplier: 22,
    speedMultiplier: 0.54,
    damageMultiplier: 1.8,
    radiusMultiplier: 2.15,
    scoreMultiplier: 7,
    contactCooldown: 0.95,
  },
  miniBoss: {
    startWave: 3,
    spawnChance: 0.24,
    guaranteeAfterEligibleWaves: 4,
    hpMultiplier: 6.4,
    speedMultiplier: 0.74,
    damageMultiplier: 1.35,
    radiusMultiplier: 1.55,
    scoreMultiplier: 3.2,
    contactCooldown: 1.05,
  },
};

export function isBossWave(wave: number): boolean {
  return wave > 0 && wave % bossBalance.bossInterval === 0;
}

export function isMiniBossEligibleWave(wave: number): boolean {
  return wave >= bossBalance.miniBoss.startWave && !isBossWave(wave);
}

export function shouldSpawnMiniBoss(
  wave: number,
  eligibleMisses: number,
  roll: number,
): boolean {
  if (!isMiniBossEligibleWave(wave)) return false;
  if (eligibleMisses + 1 >= bossBalance.miniBoss.guaranteeAfterEligibleWaves) {
    return true;
  }
  return roll < bossBalance.miniBoss.spawnChance;
}

export function nextMiniBossMisses(
  wave: number,
  eligibleMisses: number,
  spawned: boolean,
): number {
  if (!isMiniBossEligibleWave(wave)) return eligibleMisses;
  return spawned ? 0 : eligibleMisses + 1;
}

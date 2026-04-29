export const bossBalance = {
  stageDurationSeconds: 600,
  waveOffsetPerStage: 9,
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

export function startingWaveForStage(stage: number): number {
  return 1 + Math.max(0, Math.floor(stage) - 1) * bossBalance.waveOffsetPerStage;
}

export function bossUnlockWaveForStage(stage: number): number {
  return Math.max(1, Math.floor(stage)) * 10;
}

export function isMiniBossEligibleWave(wave: number): boolean {
  return wave >= bossBalance.miniBoss.startWave;
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

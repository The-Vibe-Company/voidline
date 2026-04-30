import { bossBalance } from "./balance";

export { bossBalance };

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

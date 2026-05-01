import { bossBalance } from "./balance";

export { bossBalance };

export function basePressureForStage(stage: number): number {
  const stageOffset = Math.max(0, Math.floor(stage) - 1);
  if (stageOffset <= 1) {
    return 1 + stageOffset * bossBalance.pressureOffsetPerStage;
  }
  const postStage2Offset = Math.max(
    1,
    Math.round(bossBalance.pressureOffsetPerStage * bossBalance.postStage2PressureOffsetRatio),
  );
  return (
    1 +
    bossBalance.pressureOffsetPerStage +
    (stageOffset - 1) * postStage2Offset
  );
}

export function pressureForStageElapsed(stage: number, elapsedSeconds: number): number {
  const elapsedPressure = Math.floor(Math.max(0, elapsedSeconds) / 60);
  return basePressureForStage(stage) + elapsedPressure;
}

export function isMiniBossEligiblePressure(pressure: number): boolean {
  return pressure >= bossBalance.miniBoss.startPressure;
}

export function shouldSpawnMiniBossAtPressure(
  pressure: number,
  eligibleMisses: number,
  roll: number,
): boolean {
  if (!isMiniBossEligiblePressure(pressure)) return false;
  if (eligibleMisses + 1 >= bossBalance.miniBoss.guaranteeAfterEligiblePressures) {
    return true;
  }
  return roll < bossBalance.miniBoss.spawnChance;
}

export function nextMiniBossMisses(
  pressure: number,
  eligibleMisses: number,
  spawned: boolean,
): number {
  if (!isMiniBossEligiblePressure(pressure)) return eligibleMisses;
  return spawned ? 0 : eligibleMisses + 1;
}

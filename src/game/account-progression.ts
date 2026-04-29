import type {
  AccountProgress,
  AccountRecords,
  AccountReward,
  AccountRewardBreakdown,
  AccountRunSummary,
} from "../types";

export const STAGE_DURATION_SECONDS = 600;
export const START_STAGE_CRYSTAL_BONUS_PER_STAGE = 0.35;

export function createDefaultAccountProgress(): AccountProgress {
  return {
    crystals: 0,
    spentCrystals: 0,
    purchasedUnlockIds: [],
    selectedCharacterId: "pilot",
    selectedWeaponId: "pulse",
    selectedStartStage: 1,
    highestStageCleared: 0,
    highestStartStageUnlocked: 1,
    records: createDefaultAccountRecords(),
    lastRunReward: null,
  };
}

export function createDefaultAccountRecords(): AccountRecords {
  return {
    bestStage: 1,
    bestTimeSeconds: 0,
    bestScore: 0,
    bestRunLevel: 1,
    bossKills: 0,
  };
}

export function emptyBreakdown(): AccountRewardBreakdown {
  return {
    durationCrystals: 0,
    stageCrystals: 0,
    bossCrystals: 0,
    scoreCrystals: 0,
    recordCrystals: 0,
    startStageBonusCrystals: 0,
  };
}

export function computeRunCrystalBreakdown(
  progress: AccountProgress,
  summary: AccountRunSummary,
): AccountRewardBreakdown {
  const elapsedSeconds = Math.max(0, Math.floor(summary.elapsedSeconds));
  const stage = Math.max(1, Math.floor(summary.stage), highestReachedStageForSummary(summary));
  const runLevel = Math.max(1, Math.floor(summary.runLevel));
  const uniqueBossStages = uniquePositiveNumbers(summary.bossStages);
  const score = Math.max(0, Math.floor(summary.score));
  const startStage = Math.max(1, Math.floor(summary.startStage));

  const durationCrystals = Math.floor(elapsedSeconds / 12);
  const stageCrystals = stage * 12 + Math.max(0, runLevel - 1) * 2;
  const bossCrystals = uniqueBossStages.length * 45;
  const scoreCrystals = Math.min(45, Math.floor(score / 1_250));

  let recordCrystals = 0;
  if (stage > progress.records.bestStage) recordCrystals += 25;
  if (elapsedSeconds > progress.records.bestTimeSeconds) recordCrystals += 18;
  if (score > progress.records.bestScore) recordCrystals += 18;
  if (runLevel > progress.records.bestRunLevel) recordCrystals += 12;

  const base =
    durationCrystals + stageCrystals + bossCrystals + scoreCrystals + recordCrystals;
  const startStageBonusCrystals =
    startStage > 1
      ? Math.floor(base * (startStage - 1) * START_STAGE_CRYSTAL_BONUS_PER_STAGE)
      : 0;

  return {
    durationCrystals,
    stageCrystals,
    bossCrystals,
    scoreCrystals,
    recordCrystals,
    startStageBonusCrystals,
  };
}

export function totalCrystalBreakdown(breakdown: AccountRewardBreakdown): number {
  return (
    breakdown.durationCrystals +
    breakdown.stageCrystals +
    breakdown.bossCrystals +
    breakdown.scoreCrystals +
    breakdown.recordCrystals +
    breakdown.startStageBonusCrystals
  );
}

export function applyCrystalReward(
  progress: AccountProgress,
  summary: AccountRunSummary,
  breakdown: AccountRewardBreakdown = computeRunCrystalBreakdown(progress, summary),
): AccountReward {
  const crystalsGained = totalCrystalBreakdown(breakdown);
  const previousStartStage = progress.highestStartStageUnlocked;
  const previousRecords = { ...progress.records };
  const uniqueBossStages = uniquePositiveNumbers(summary.bossStages);
  const highestBossStage = uniqueBossStages.reduce((max, stage) => Math.max(max, stage), 0);
  const highestStageCleared = Math.max(progress.highestStageCleared, highestBossStage);
  const highestStageReached = highestReachedStageForSummary(summary);
  const highestStartStageUnlocked = Math.max(
    progress.highestStartStageUnlocked,
    1,
    highestStageCleared + 1,
  );

  progress.crystals += crystalsGained;
  progress.highestStageCleared = highestStageCleared;
  progress.highestStartStageUnlocked = highestStartStageUnlocked;
  progress.selectedStartStage =
    highestStartStageUnlocked > previousStartStage
      ? highestStartStageUnlocked
      : Math.min(progress.selectedStartStage, highestStartStageUnlocked);
  progress.records.bestStage = Math.max(progress.records.bestStage, highestStageReached);
  progress.records.bestTimeSeconds = Math.max(
    progress.records.bestTimeSeconds,
    Math.floor(summary.elapsedSeconds),
  );
  progress.records.bestScore = Math.max(progress.records.bestScore, Math.floor(summary.score));
  progress.records.bestRunLevel = Math.max(
    progress.records.bestRunLevel,
    Math.floor(summary.runLevel),
  );
  progress.records.bossKills += uniqueBossStages.length;

  const reward: AccountReward = {
    source: "run",
    crystalsGained,
    newlyUnlockedStartStage:
      progress.highestStartStageUnlocked > previousStartStage
        ? progress.highestStartStageUnlocked
        : null,
    newRecords: changedRecords(previousRecords, progress.records),
    breakdown,
  };
  progress.lastRunReward = reward;
  return reward;
}

export function uniquePositiveNumbers(values: readonly number[]): number[] {
  return [...new Set(values.map((value) => Math.floor(value)).filter((value) => value > 0))].sort(
    (a, b) => a - b,
  );
}

export function highestReachedStageForSummary(summary: AccountRunSummary): number {
  const startStage = Math.max(1, Math.floor(summary.startStage));
  const highestClearedStage = uniquePositiveNumbers(summary.bossStages).reduce(
    (max, stage) => Math.max(max, stage),
    0,
  );
  return Math.max(startStage, highestClearedStage + 1);
}

function changedRecords(previous: AccountRecords, next: AccountRecords): string[] {
  const records: string[] = [];
  if (next.bestStage > previous.bestStage) records.push("stage");
  if (next.bestTimeSeconds > previous.bestTimeSeconds) records.push("temps");
  if (next.bestScore > previous.bestScore) records.push("score");
  if (next.bestRunLevel > previous.bestRunLevel) records.push("niveau");
  return records;
}

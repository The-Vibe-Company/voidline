import type {
  AccountProgress,
  AccountReward,
  AccountRewardBreakdown,
  AccountRunSummary,
} from "../types";

export const TOKEN_MILESTONE_LEVELS = [2, 3, 5, 8, 12, 16, 20, 25, 30] as const;

export function createDefaultAccountProgress(): AccountProgress {
  return {
    level: 1,
    xp: 0,
    tokens: 0,
    spentTokens: 0,
    purchasedIds: [],
    equippedWeaponId: "standard",
    bestWave: 0,
    bestRunLevel: 1,
    bossWavesDefeated: [],
    claimedChallengeTierIds: [],
    lastRunReward: null,
  };
}

export function accountXpToNextLevel(level: number): number {
  const safeLevel = Math.max(1, Math.floor(level));
  return Math.round(95 + safeLevel * 34 + Math.pow(safeLevel, 1.38) * 18);
}

export function tokenRewardForLevel(level: number): number {
  if (TOKEN_MILESTONE_LEVELS.includes(level as (typeof TOKEN_MILESTONE_LEVELS)[number])) {
    return 1;
  }
  return level > 30 && level % 10 === 0 ? 1 : 0;
}

export function computeRunAccountXp(
  progress: AccountProgress,
  summary: AccountRunSummary,
): AccountRewardBreakdown {
  const wave = Math.max(1, Math.floor(summary.wave));
  const runLevel = Math.max(1, Math.floor(summary.runLevel));
  const bossWaves = uniquePositiveWaves(summary.bossWaves);
  const firstBossWaves = bossWaves.filter((wave) => !progress.bossWavesDefeated.includes(wave));
  const waveRecordGain =
    wave > progress.bestWave ? 55 + Math.max(0, wave - progress.bestWave) * 8 : 0;
  const levelRecordGain =
    runLevel > progress.bestRunLevel
      ? 35 + Math.max(0, runLevel - progress.bestRunLevel) * 7
      : 0;

  return {
    runLevelXp: runLevel * 8,
    waveXp: wave * 12,
    bossXp: bossWaves.length * 40,
    firstBossXp: firstBossWaves.length * 85,
    recordXp: waveRecordGain + levelRecordGain,
    challengeXp: 0,
  };
}

export function totalAccountXpBreakdown(breakdown: AccountRewardBreakdown): number {
  return (
    breakdown.runLevelXp +
    breakdown.waveXp +
    breakdown.bossXp +
    breakdown.firstBossXp +
    breakdown.recordXp +
    breakdown.challengeXp
  );
}

export function applyAccountXp(
  progress: AccountProgress,
  xpGained: number,
  source: AccountReward["source"],
  breakdown: AccountRewardBreakdown = emptyBreakdown(),
): AccountReward {
  const safeXp = Math.max(0, Math.floor(xpGained));
  let levelsGained = 0;
  let tokensGained = 0;
  progress.xp += safeXp;

  while (progress.xp >= accountXpToNextLevel(progress.level)) {
    progress.xp -= accountXpToNextLevel(progress.level);
    progress.level += 1;
    levelsGained += 1;
    const tokenReward = tokenRewardForLevel(progress.level);
    progress.tokens += tokenReward;
    tokensGained += tokenReward;
  }

  const reward: AccountReward = {
    source,
    xpGained: safeXp,
    tokensGained,
    levelsGained,
    breakdown,
  };
  progress.lastRunReward = reward;
  return reward;
}

export function emptyBreakdown(): AccountRewardBreakdown {
  return {
    runLevelXp: 0,
    waveXp: 0,
    bossXp: 0,
    firstBossXp: 0,
    recordXp: 0,
    challengeXp: 0,
  };
}

export function uniquePositiveWaves(waves: readonly number[]): number[] {
  return [...new Set(waves.map((wave) => Math.floor(wave)).filter((wave) => wave > 0))].sort(
    (a, b) => a - b,
  );
}

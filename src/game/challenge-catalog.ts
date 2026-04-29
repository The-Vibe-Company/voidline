import type { Challenge, ChallengeMetric, ChallengeProgress } from "../types";

export const challengeCatalog: Challenge[] = [
  {
    id: "survivor",
    icon: "RUN",
    name: "Survivant orbital",
    description: "Atteins des vagues clefs.",
    metric: "bestWave",
    unit: "vague",
    tiers: [
      { threshold: 5, accountXp: 70 },
      { threshold: 10, accountXp: 105 },
      { threshold: 15, accountXp: 150 },
      { threshold: 20, accountXp: 210 },
    ],
  },
  {
    id: "boss-hunter",
    icon: "BOS",
    name: "Chasseur de boss",
    description: "Detruis des boss de vague.",
    metric: "bossKills",
    unit: "boss",
    tiers: [
      { threshold: 1, accountXp: 120 },
      { threshold: 2, accountXp: 170 },
      { threshold: 3, accountXp: 230 },
    ],
  },
  {
    id: "reaper",
    icon: "KIL",
    name: "Moissonneur",
    description: "Cumule les eliminations.",
    metric: "totalKills",
    unit: "kills",
    tiers: [
      { threshold: 100, accountXp: 80 },
      { threshold: 300, accountXp: 145 },
      { threshold: 600, accountXp: 230 },
    ],
  },
  {
    id: "scorer",
    icon: "SCR",
    name: "Signal de score",
    description: "Bats tes records de score.",
    metric: "bestScore",
    unit: "score",
    tiers: [
      { threshold: 2_000, accountXp: 70 },
      { threshold: 8_000, accountXp: 130 },
      { threshold: 20_000, accountXp: 220 },
    ],
  },
  {
    id: "veteran",
    icon: "XP",
    name: "Veteran synchronise",
    description: "Atteins des niveaux eleves.",
    metric: "bestLevel",
    unit: "niveau",
    tiers: [
      { threshold: 5, accountXp: 80 },
      { threshold: 10, accountXp: 150 },
      { threshold: 15, accountXp: 240 },
    ],
  },
];

export function createEmptyChallengeProgress(): ChallengeProgress {
  return {
    bestWave: 0,
    bossKills: 0,
    totalKills: 0,
    bestScore: 0,
    bestLevel: 0,
  };
}

export function unlockedTierCount(challenge: Challenge, progress: ChallengeProgress): number {
  const value = progress[challenge.metric] ?? 0;
  return challenge.tiers.filter((tier) => value >= tier.threshold).length;
}

export function totalUnlockedTiers(progress: ChallengeProgress): number {
  return challengeCatalog.reduce(
    (total, challenge) => total + unlockedTierCount(challenge, progress),
    0,
  );
}

export interface ChallengeTierReward {
  id: string;
  challengeId: string;
  tierIndex: number;
  accountXp: number;
}

export function challengeTierId(challengeId: string, tierIndex: number): string {
  return `${challengeId}:${tierIndex + 1}`;
}

export function claimableChallengeTierRewards(
  progress: ChallengeProgress,
  claimedIds: ReadonlySet<string>,
): ChallengeTierReward[] {
  const rewards: ChallengeTierReward[] = [];
  for (const challenge of challengeCatalog) {
    const unlocked = unlockedTierCount(challenge, progress);
    for (let tierIndex = 0; tierIndex < unlocked; tierIndex += 1) {
      const id = challengeTierId(challenge.id, tierIndex);
      if (claimedIds.has(id)) continue;
      rewards.push({
        id,
        challengeId: challenge.id,
        tierIndex,
        accountXp: challenge.tiers[tierIndex]!.accountXp,
      });
    }
  }
  return rewards;
}

export function nextChallengeThreshold(
  challenge: Challenge,
  progress: ChallengeProgress,
): number | null {
  const value = progress[challenge.metric] ?? 0;
  return challenge.tiers.find((tier) => value < tier.threshold)?.threshold ?? null;
}

export function challengeValueLabel(metric: ChallengeMetric, value: number): string {
  if (metric === "bestScore") return Math.floor(value).toLocaleString("fr-FR");
  return String(Math.floor(value));
}

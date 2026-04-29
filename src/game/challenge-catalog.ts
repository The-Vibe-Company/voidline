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
      { threshold: 5 },
      { threshold: 10 },
      { threshold: 15 },
      { threshold: 20 },
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
      { threshold: 1 },
      { threshold: 2 },
      { threshold: 3 },
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
      { threshold: 100 },
      { threshold: 300 },
      { threshold: 600 },
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
      { threshold: 2_000 },
      { threshold: 8_000 },
      { threshold: 20_000 },
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
      { threshold: 5 },
      { threshold: 10 },
      { threshold: 15 },
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

export function challengeTierId(challengeId: string, tierIndex: number): string {
  return `${challengeId}:${tierIndex + 1}`;
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

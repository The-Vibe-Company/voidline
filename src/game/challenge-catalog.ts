import type { Challenge, ChallengeMetric, ChallengeProgress, PermanentBonus } from "../types";

export const challengeCatalog: Challenge[] = [
  {
    id: "survivor",
    icon: "RUN",
    name: "Survivant orbital",
    description: "Atteins des vagues clefs.",
    metric: "bestWave",
    unit: "vague",
    tiers: [
      { threshold: 5, bonus: { speedPct: 0.03 } },
      { threshold: 10, bonus: { speedPct: 0.03 } },
      { threshold: 15, bonus: { speedPct: 0.04 } },
      { threshold: 20, bonus: { speedPct: 0.05 } },
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
      { threshold: 1, bonus: { damagePct: 0.04 } },
      { threshold: 2, bonus: { damagePct: 0.04 } },
      { threshold: 3, bonus: { damagePct: 0.05 } },
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
      { threshold: 100, bonus: { fireRatePct: 0.03 } },
      { threshold: 300, bonus: { fireRatePct: 0.04 } },
      { threshold: 600, bonus: { fireRatePct: 0.05 } },
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
      { threshold: 2_000, bonus: { maxHpFlat: 10 } },
      { threshold: 8_000, bonus: { maxHpFlat: 10 } },
      { threshold: 20_000, bonus: { maxHpFlat: 10 } },
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
      { threshold: 5, bonus: { pickupRadiusPct: 0.05 } },
      { threshold: 10, bonus: { pickupRadiusPct: 0.05 } },
      { threshold: 15, bonus: { pickupRadiusPct: 0.06 } },
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

export function totalPermanentBonus(progress: ChallengeProgress): PermanentBonus {
  const total: PermanentBonus = {};
  for (const challenge of challengeCatalog) {
    const unlocked = unlockedTierCount(challenge, progress);
    for (const tier of challenge.tiers.slice(0, unlocked)) {
      addBonus(total, tier.bonus);
    }
  }
  return total;
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

function addBonus(target: PermanentBonus, source: PermanentBonus): void {
  target.fireRatePct = (target.fireRatePct ?? 0) + (source.fireRatePct ?? 0);
  target.damagePct = (target.damagePct ?? 0) + (source.damagePct ?? 0);
  target.speedPct = (target.speedPct ?? 0) + (source.speedPct ?? 0);
  target.pickupRadiusPct = (target.pickupRadiusPct ?? 0) + (source.pickupRadiusPct ?? 0);
  target.maxHpFlat = (target.maxHpFlat ?? 0) + (source.maxHpFlat ?? 0);
}

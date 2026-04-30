import { isUnlockRequirementMet } from "./shop-catalog";
import type {
  AccountProgress,
  BuildTag,
  MetaUpgrade,
  MetaUpgradeId,
} from "../types";

const CATEGORY_COSTS = [40, 75, 130, 220] as const;
const categoryCostAt = (level: number): number =>
  CATEGORY_COSTS[Math.max(0, Math.min(CATEGORY_COSTS.length - 1, level - 1))];

export const metaUpgradeCatalog: readonly MetaUpgrade[] = [
  {
    id: "unique:weapon-scatter",
    kind: "unique",
    name: "Scatter Cannon",
    description: "Salves larges, dégâts plus bas, très bon avec les critiques.",
    maxLevel: 1,
    costAt: () => 45,
    requirement: "available",
    weaponId: "scatter",
  },
  {
    id: "unique:weapon-lance",
    kind: "unique",
    name: "Rail Lance",
    description: "Tir lent et lourd, pénétration de base.",
    maxLevel: 1,
    costAt: () => 75,
    requirement: "reach-stage-2",
    weaponId: "lance",
  },
  {
    id: "unique:weapon-drone",
    kind: "unique",
    name: "Drone Core",
    description: "Un drone autonome dès le départ, faible burst initial.",
    maxLevel: 1,
    costAt: () => 95,
    requirement: "boss-kill",
    weaponId: "drone",
  },
  {
    id: "unique:char-runner",
    kind: "unique",
    name: "Runner",
    description: "Vaisseau rapide, fragile, pensé pour esquiver jusqu'au boss.",
    maxLevel: 1,
    costAt: () => 60,
    requirement: "reach-10m",
    characterId: "runner",
  },
  {
    id: "unique:char-tank",
    kind: "unique",
    name: "Tank",
    description: "Coque lourde et bouclier de départ, moins mobile.",
    maxLevel: 1,
    costAt: () => 90,
    requirement: "clear-stage-1",
    characterId: "tank",
  },
  {
    id: "unique:extra-choice",
    kind: "unique",
    name: "Banque tactique",
    description: "+1 choix à chaque level-up.",
    maxLevel: 1,
    costAt: () => 120,
    requirement: "available",
  },
  {
    id: "category:attack",
    kind: "category",
    name: "Attaque",
    description: "Augmente la qualité des upgrades offensifs.",
    tag: "cannon",
    technologyId: "heavy-caliber",
    maxLevel: 4,
    costAt: categoryCostAt,
    requirement: "available",
    levels: [
      { summary: "Débloque la tech Calibre et les rares offensifs." },
      { summary: "+25% chance de rare globale." },
      { summary: "Débloque les prototypes." },
      { summary: "Augmente la chance de singularité." },
    ],
  },
  {
    id: "category:defense",
    kind: "category",
    name: "Défense",
    description: "Renforce la coque et les builds défensifs.",
    tag: "shield",
    technologyId: "kinetic-shield",
    maxLevel: 4,
    costAt: categoryCostAt,
    requirement: "available",
    levels: [
      { summary: "Débloque la tech Bouclier et les rares défensifs." },
      { summary: "+1 charge de bouclier au départ." },
      { summary: "Débloque les prototypes." },
      { summary: "+0.5 régénération HP au départ." },
    ],
  },
  {
    id: "category:salvage",
    kind: "category",
    name: "Récolte",
    description: "Optimise la collecte d'XP et les récompenses de run.",
    tag: "salvage",
    maxLevel: 4,
    costAt: categoryCostAt,
    requirement: "available",
    levels: [
      { summary: "Débloque les rares de récolte." },
      { summary: "+10% multiplicateur de cristaux par run." },
      { summary: "+5% rayon de collecte." },
      { summary: "Débloque les prototypes." },
    ],
  },
  {
    id: "category:tempo",
    kind: "category",
    name: "Tempo",
    description: "Cadence, précision et flexibilité de build.",
    tag: "crit",
    technologyId: "crit-array",
    maxLevel: 4,
    costAt: categoryCostAt,
    requirement: "available",
    levels: [
      { summary: "Débloque la tech Critique et les rares de précision." },
      { summary: "+25% chance de rare globale." },
      { summary: "Débloque les prototypes." },
      { summary: "+1 choix au level-up." },
    ],
  },
];

const idIndex = new Map<MetaUpgradeId, MetaUpgrade>(
  metaUpgradeCatalog.map((upgrade) => [upgrade.id, upgrade]),
);

export function findMetaUpgrade(id: MetaUpgradeId): MetaUpgrade {
  const upgrade = idIndex.get(id);
  if (!upgrade) {
    throw new Error(`Unknown meta upgrade: ${id}`);
  }
  return upgrade;
}

export function metaUpgradeLevel(progress: AccountProgress, id: MetaUpgradeId): number {
  return Math.max(0, Math.min(findMetaUpgrade(id).maxLevel, progress.upgradeLevels[id] ?? 0));
}

export function nextLevelCost(progress: AccountProgress, id: MetaUpgradeId): number | null {
  const upgrade = findMetaUpgrade(id);
  const current = metaUpgradeLevel(progress, id);
  if (current >= upgrade.maxLevel) return null;
  return upgrade.costAt(current + 1);
}

export type MetaPurchaseError = "max-level" | "locked" | "crystals";

export type MetaUpgradeRecommendation =
  | {
      state: "purchase";
      upgrade: MetaUpgrade;
      level: number;
      cost: number;
      missing: 0;
    }
  | {
      state: "save";
      upgrade: MetaUpgrade;
      level: number;
      cost: number;
      missing: number;
    }
  | {
      state: "locked";
      upgrade: MetaUpgrade;
      level: number;
      cost: number;
      missing: 0;
    }
  | {
      state: "complete";
    };

export function isMetaUpgradeRevealed(
  progress: AccountProgress,
  upgrade: MetaUpgrade,
): boolean {
  return isUnlockRequirementMet(progress, upgrade.requirement);
}

export function canPurchaseLevel(
  progress: AccountProgress,
  id: MetaUpgradeId,
): { ok: true; cost: number } | { ok: false; reason: MetaPurchaseError } {
  const upgrade = findMetaUpgrade(id);
  const current = metaUpgradeLevel(progress, id);
  if (current >= upgrade.maxLevel) return { ok: false, reason: "max-level" };
  if (!isMetaUpgradeRevealed(progress, upgrade)) return { ok: false, reason: "locked" };
  const cost = upgrade.costAt(current + 1);
  if (progress.crystals < cost) return { ok: false, reason: "crystals" };
  return { ok: true, cost };
}

export function recommendMetaUpgrade(progress: AccountProgress): MetaUpgradeRecommendation {
  const pending = metaUpgradeCatalog
    .map((upgrade, index) => {
      const current = metaUpgradeLevel(progress, upgrade.id);
      const cost = current >= upgrade.maxLevel ? null : upgrade.costAt(current + 1);
      return {
        upgrade,
        index,
        level: current + 1,
        cost,
        revealed: isMetaUpgradeRevealed(progress, upgrade),
      };
    })
    .filter((entry) => entry.cost !== null);

  const revealed = pending.filter((entry) => entry.revealed);
  const affordable = cheapestMetaCandidate(
    revealed.filter((entry) => (entry.cost ?? Infinity) <= progress.crystals),
  );
  if (affordable) {
    return {
      state: "purchase",
      upgrade: affordable.upgrade,
      level: affordable.level,
      cost: affordable.cost ?? 0,
      missing: 0,
    };
  }

  const savingTarget = cheapestMetaCandidate(revealed);
  if (savingTarget) {
    const cost = savingTarget.cost ?? 0;
    return {
      state: "save",
      upgrade: savingTarget.upgrade,
      level: savingTarget.level,
      cost,
      missing: Math.max(0, cost - progress.crystals),
    };
  }

  const lockedTarget = pending.find((entry) => !entry.revealed);
  if (lockedTarget) {
    return {
      state: "locked",
      upgrade: lockedTarget.upgrade,
      level: lockedTarget.level,
      cost: lockedTarget.cost ?? 0,
      missing: 0,
    };
  }

  return { state: "complete" };
}

function cheapestMetaCandidate<T extends { cost: number | null; index: number }>(
  entries: readonly T[],
): T | undefined {
  return [...entries].sort(
    (a, b) => (a.cost ?? Infinity) - (b.cost ?? Infinity) || a.index - b.index,
  )[0];
}

export function unlockedTechnologyIdsFromMeta(progress: AccountProgress): Set<string> {
  const ids = new Set<string>();
  for (const upgrade of metaUpgradeCatalog) {
    if (!upgrade.technologyId) continue;
    if (metaUpgradeLevel(progress, upgrade.id) >= 1) {
      ids.add(upgrade.technologyId);
    }
  }
  return ids;
}

export function unlockedBuildTagsFromMeta(progress: AccountProgress): Set<BuildTag> {
  const tags = new Set<BuildTag>();
  for (const upgrade of metaUpgradeCatalog) {
    if (!upgrade.tag) continue;
    if (metaUpgradeLevel(progress, upgrade.id) >= 1) {
      tags.add(upgrade.tag);
    }
  }
  return tags;
}

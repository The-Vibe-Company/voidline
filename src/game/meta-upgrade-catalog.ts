import { isUnlockRequirementMet } from "./shop-catalog";
import type {
  AccountProgress,
  BuildTag,
  MetaUpgrade,
  MetaUpgradeId,
  TierId,
} from "../types";

const CARD_COSTS = [40, 85, 360, 460] as const;
const STARTER_CARD_COSTS = [0, 80, 320, 420] as const;
const RARE_SIGNAL_COSTS = [50, 105, 180] as const;
const PROTOTYPE_LAB_COSTS = [220, 420, 750] as const;
const SINGULARITY_CORE_COSTS = [120, 220, 360] as const;
const CRYSTAL_CONTRACT_COSTS = [65, 125, 210] as const;
const BOSS_BOUNTY_COSTS = [120, 240, 420] as const;

const BOSS_BOUNTY_PER_LEVEL = [0, 8, 16, 25] as const;

const costFrom = (costs: readonly number[]) => (level: number): number =>
  costs[Math.max(0, Math.min(costs.length - 1, level - 1))] ?? costs[costs.length - 1] ?? 0;

export const CARD_TIER_BY_LEVEL = [
  "standard",
  "rare",
  "prototype",
  "singularity",
] as const satisfies readonly TierId[];

export interface RarityProfile {
  rare: number;
  prototype: number;
  singularity: number;
}

export type UpgradeTierCaps = Partial<Record<string, TierId>>;

function cardLevels(name: string): ReadonlyArray<{ summary: string }> {
  return [
    { summary: `Débloque ${name} en Standard.` },
    { summary: `${name} peut apparaître en Rare.` },
    { summary: `${name} peut apparaître en Prototype.` },
    { summary: `${name} peut apparaître en Singularity.` },
  ];
}

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
    id: "unique:char-engineer",
    kind: "unique",
    name: "Ingénieur",
    description: "Pilote drone/récolte, fort en contrôle de zone mais moins explosif.",
    maxLevel: 1,
    costAt: () => 110,
    requirement: "boss-kill",
    characterId: "engineer",
  },
  {
    id: "unique:extra-choice",
    kind: "unique",
    name: "Banque tactique",
    description: "+1 choix à chaque level-up. Ne se cumule avec aucun autre bonus de choix.",
    maxLevel: 1,
    costAt: () => 120,
    requirement: "available",
  },
  {
    id: "card:plasma-core",
    kind: "card",
    name: "Carte cadence",
    description: "Débloque Technologie cadence et ses tiers supérieurs.",
    maxLevel: 4,
    baseLevel: 1,
    costAt: costFrom(STARTER_CARD_COSTS),
    requirement: "available",
    tag: "cannon",
    technologyId: "plasma-core",
    upgradeId: "plasma-core",
    levels: cardLevels("Technologie cadence"),
  },
  {
    id: "card:rail-slug",
    kind: "card",
    name: "Carte dégâts",
    description: "Débloque Technologie dégâts et ses tiers supérieurs.",
    maxLevel: 4,
    baseLevel: 1,
    costAt: costFrom(STARTER_CARD_COSTS),
    requirement: "available",
    tag: "cannon",
    technologyId: "rail-slug",
    upgradeId: "rail-slug",
    levels: cardLevels("Technologie dégâts"),
  },
  {
    id: "card:velocity-driver",
    kind: "card",
    name: "Carte vélocité",
    description: "Débloque Technologie vélocité et ses tiers supérieurs.",
    maxLevel: 4,
    baseLevel: 1,
    costAt: costFrom(STARTER_CARD_COSTS),
    requirement: "available",
    tag: "cannon",
    technologyId: "velocity-driver",
    upgradeId: "velocity-driver",
    levels: cardLevels("Technologie vélocité"),
  },
  {
    id: "card:ion-engine",
    kind: "card",
    name: "Carte moteurs",
    description: "Débloque Technologie moteurs et ses tiers supérieurs.",
    maxLevel: 4,
    baseLevel: 1,
    costAt: costFrom(STARTER_CARD_COSTS),
    requirement: "available",
    tag: "salvage",
    technologyId: "ion-engine",
    upgradeId: "ion-engine",
    levels: cardLevels("Technologie moteurs"),
  },
  {
    id: "card:magnet-array",
    kind: "card",
    name: "Carte aimant",
    description: "Débloque Technologie aimant et ses tiers supérieurs.",
    maxLevel: 4,
    baseLevel: 1,
    costAt: costFrom(STARTER_CARD_COSTS),
    requirement: "available",
    tag: "magnet",
    technologyId: "magnet-array",
    upgradeId: "magnet-array",
    levels: cardLevels("Technologie aimant"),
  },
  {
    id: "card:twin-cannon",
    kind: "card",
    name: "Carte salves",
    description: "Débloque le +1 tir, puis les tiers qui ajoutent plus de projectiles.",
    maxLevel: 4,
    costAt: costFrom(CARD_COSTS),
    requirement: "available",
    tag: "cannon",
    technologyId: "twin-cannon",
    upgradeId: "twin-cannon",
    levels: cardLevels("Technologie salves"),
  },
  {
    id: "card:kinetic-shield",
    kind: "card",
    name: "Carte bouclier",
    description: "Débloque Technologie défense et ses tiers supérieurs.",
    maxLevel: 4,
    costAt: costFrom(CARD_COSTS),
    requirement: "reach-10m",
    tag: "shield",
    technologyId: "kinetic-shield",
    upgradeId: "kinetic-shield",
    levels: cardLevels("Technologie défense"),
  },
  {
    id: "card:crit-array",
    kind: "card",
    name: "Carte critique",
    description: "Débloque les coups critiques et leurs tiers supérieurs.",
    maxLevel: 4,
    costAt: costFrom(CARD_COSTS),
    requirement: "available",
    tag: "crit",
    technologyId: "crit-array",
    upgradeId: "crit-array",
    levels: cardLevels("Technologie critique"),
  },
  {
    id: "card:heavy-caliber",
    kind: "card",
    name: "Carte calibre",
    description: "Débloque Technologie calibre et ses tiers supérieurs.",
    maxLevel: 4,
    costAt: costFrom(CARD_COSTS),
    requirement: "reach-stage-2",
    tag: "cannon",
    technologyId: "heavy-caliber",
    upgradeId: "heavy-caliber",
    levels: cardLevels("Technologie calibre"),
  },
  {
    id: "rarity:rare-signal",
    kind: "rarity",
    name: "Signal rare",
    description: "Autorise les cartes montées à proposer du Rare et augmente son apparition.",
    maxLevel: 3,
    costAt: costFrom(RARE_SIGNAL_COSTS),
    requirement: "available",
    rarityTier: "rare",
    levels: [
      { summary: "Débloque le tier Rare pour les cartes compatibles." },
      { summary: "Augmente encore la fréquence du Rare." },
      { summary: "Stabilise fortement les propositions Rare." },
    ],
  },
  {
    id: "rarity:prototype-lab",
    kind: "rarity",
    name: "Laboratoire prototype",
    description: "Autorise les cartes montées à proposer du Prototype.",
    maxLevel: 3,
    costAt: costFrom(PROTOTYPE_LAB_COSTS),
    requirement: "reach-stage-2",
    rarityTier: "prototype",
    levels: [
      { summary: "Débloque le tier Prototype pour les cartes compatibles." },
      { summary: "Augmente la fréquence du Prototype après sa gate." },
      { summary: "Rend les prototypes plus réguliers en mid-game." },
    ],
  },
  {
    id: "rarity:singularity-core",
    kind: "rarity",
    name: "Noyau singularité",
    description: "Autorise les cartes montées à proposer du Singularity.",
    maxLevel: 3,
    costAt: costFrom(SINGULARITY_CORE_COSTS),
    requirement: "clear-stage-2",
    rarityTier: "singularity",
    levels: [
      { summary: "Débloque le tier Singularity pour les cartes compatibles." },
      { summary: "Augmente la fréquence du Singularity en late game." },
      { summary: "Donne une vraie chance aux pics Singularity sans les garantir." },
    ],
  },
  {
    id: "utility:crystal-contract",
    kind: "utility",
    name: "Contrat cristal",
    description: "Augmente les cristaux gagnés sans ajouter de puissance directe.",
    maxLevel: 3,
    costAt: costFrom(CRYSTAL_CONTRACT_COSTS),
    requirement: "available",
    levels: [
      { summary: "+5% cristaux gagnés en fin de run." },
      { summary: "+10% cristaux gagnés en fin de run." },
      { summary: "+15% cristaux gagnés en fin de run." },
    ],
  },
  {
    id: "utility:boss-bounty",
    kind: "utility",
    name: "Prime de boss",
    description: "Cristaux supplémentaires à chaque boss tué dans la run.",
    maxLevel: 3,
    costAt: costFrom(BOSS_BOUNTY_COSTS),
    requirement: "boss-kill",
    levels: [
      { summary: "+8 cristaux par boss tué." },
      { summary: "+16 cristaux par boss tué." },
      { summary: "+25 cristaux par boss tué." },
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
  const upgrade = findMetaUpgrade(id);
  const base = upgrade.baseLevel ?? 0;
  const stored = progress.upgradeLevels[id] ?? 0;
  return Math.max(0, Math.min(upgrade.maxLevel, Math.max(base, stored)));
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

export function upgradeTierCapsFromMeta(progress: AccountProgress): UpgradeTierCaps {
  const caps: UpgradeTierCaps = {};
  for (const upgrade of metaUpgradeCatalog) {
    if (upgrade.kind !== "card" || !upgrade.upgradeId) continue;
    const cap = cardTierCapAtLevel(metaUpgradeLevel(progress, upgrade.id));
    if (cap) caps[upgrade.upgradeId] = cap;
  }
  return caps;
}

export function cardTierCapAtLevel(level: number): TierId | null {
  if (level <= 0) return null;
  return CARD_TIER_BY_LEVEL[Math.min(CARD_TIER_BY_LEVEL.length - 1, Math.floor(level) - 1)] ?? null;
}

export function rarityProfileFromMeta(progress: AccountProgress): RarityProfile {
  return {
    rare: metaUpgradeLevel(progress, "rarity:rare-signal"),
    prototype: metaUpgradeLevel(progress, "rarity:prototype-lab"),
    singularity: metaUpgradeLevel(progress, "rarity:singularity-core"),
  };
}

export function bossBountyBonusFromMeta(progress: AccountProgress): number {
  const level = metaUpgradeLevel(progress, "utility:boss-bounty");
  return BOSS_BOUNTY_PER_LEVEL[Math.max(0, Math.min(BOSS_BOUNTY_PER_LEVEL.length - 1, level))] ?? 0;
}

import type {
  AccountProgress,
  BuildTag,
  ShopItem,
  ShopItemId,
  UnlockRequirement,
} from "../types";

export const unlockPredicates: Record<UnlockRequirement, (progress: AccountProgress) => boolean> = {
  available: () => true,
  "reach-10m": (progress) => progress.records.bestTimeSeconds >= 600,
  "clear-stage-1": (progress) => progress.highestStageCleared >= 1,
  "clear-stage-2": (progress) => progress.highestStageCleared >= 2,
  "reach-stage-2": (progress) =>
    progress.records.bestStage >= 2 || progress.highestStartStageUnlocked >= 2,
  "boss-kill": (progress) => progress.records.bossKills > 0,
};

export function isUnlockRequirementMet(
  progress: AccountProgress,
  requirement: UnlockRequirement,
): boolean {
  return unlockPredicates[requirement](progress);
}

export const STARTER_TECHNOLOGY_IDS = [
  "plasma-core",
  "rail-slug",
  "ion-engine",
  "magnet-array",
] as const;

export const STARTER_BUILD_TAGS = ["cannon", "salvage", "magnet"] as const satisfies BuildTag[];

export const shopCatalog: readonly ShopItem[] = [
  {
    id: "character:runner",
    kind: "character",
    name: "Runner",
    description: "Vaisseau rapide, fragile, pense pour esquiver jusqu'au boss.",
    cost: 60,
    tags: ["salvage", "magnet"],
    requirement: "reach-10m",
    characterId: "runner",
  },
  {
    id: "character:tank",
    kind: "character",
    name: "Tank",
    description: "Coque lourde et bouclier de depart, moins mobile.",
    cost: 90,
    tags: ["shield", "salvage"],
    requirement: "clear-stage-1",
    characterId: "tank",
  },
  {
    id: "character:engineer",
    kind: "character",
    name: "Ingénieur",
    description: "Pilote drone/recolte, fort en controle de zone mais moins explosif.",
    cost: 110,
    tags: ["drone", "salvage", "magnet"],
    requirement: "boss-kill",
    characterId: "engineer",
  },
  {
    id: "weapon:scatter",
    kind: "weapon",
    name: "Scatter Cannon",
    description: "Salves larges, degats plus bas, tres bon avec les critiques.",
    cost: 45,
    tags: ["cannon", "crit"],
    requirement: "available",
    weaponId: "scatter",
  },
  {
    id: "weapon:lance",
    kind: "weapon",
    name: "Rail Lance",
    description: "Tir lent et lourd, penetration de base.",
    cost: 75,
    tags: ["pierce", "cannon"],
    requirement: "reach-stage-2",
    weaponId: "lance",
  },
  {
    id: "weapon:drone",
    kind: "weapon",
    name: "Drone Core",
    description: "Un drone autonome des le depart, faible burst initial.",
    cost: 95,
    tags: ["drone", "salvage"],
    requirement: "boss-kill",
    weaponId: "drone",
  },
  {
    id: "technology:kinetic-shield",
    kind: "technology",
    name: "Technologie bouclier",
    description: "Ajoute les choix defensifs et les synergies de coque.",
    cost: 70,
    tags: ["shield", "salvage"],
    requirement: "reach-10m",
    technologyId: "kinetic-shield",
  },
  {
    id: "technology:crit-array",
    kind: "technology",
    name: "Technologie critique",
    description: "Debloque les coups critiques pour les builds precision.",
    cost: 55,
    tags: ["crit"],
    requirement: "available",
    technologyId: "crit-array",
  },
  {
    id: "technology:heavy-caliber",
    kind: "technology",
    name: "Technologie calibre",
    description: "Augmente la taille des projectiles et stabilise les salves.",
    cost: 80,
    tags: ["cannon"],
    requirement: "reach-stage-2",
    technologyId: "heavy-caliber",
  },
];

export function findShopItem(id: ShopItemId): ShopItem {
  const item = shopCatalog.find((candidate) => candidate.id === id);
  if (!item) {
    throw new Error(`Unknown shop item: ${id}`);
  }
  return item;
}

export function purchasedSet(progress: AccountProgress): ReadonlySet<ShopItemId> {
  return new Set(progress.purchasedUnlockIds);
}

export function isShopItemRevealed(progress: AccountProgress, item: ShopItem): boolean {
  return isUnlockRequirementMet(progress, item.requirement);
}

export function canPurchaseShopItem(
  progress: AccountProgress,
  item: ShopItem,
): { ok: true } | { ok: false; reason: "owned" | "crystals" | "locked" } {
  if (progress.purchasedUnlockIds.includes(item.id)) {
    return { ok: false, reason: "owned" };
  }
  if (!isShopItemRevealed(progress, item)) {
    return { ok: false, reason: "locked" };
  }
  if (progress.crystals < item.cost) {
    return { ok: false, reason: "crystals" };
  }
  return { ok: true };
}

export function unlockedTechnologyIds(progress: AccountProgress): Set<string> {
  const ids = new Set<string>(STARTER_TECHNOLOGY_IDS);
  for (const id of progress.purchasedUnlockIds) {
    const item = shopCatalog.find((candidate) => candidate.id === id);
    if (item?.kind === "technology" && item.technologyId) {
      ids.add(item.technologyId);
    }
  }
  return ids;
}

export function unlockedBuildTags(progress: AccountProgress): Set<BuildTag> {
  const tags = new Set<BuildTag>(STARTER_BUILD_TAGS);
  for (const id of progress.purchasedUnlockIds) {
    const item = shopCatalog.find((candidate) => candidate.id === id);
    for (const tag of item?.tags ?? []) tags.add(tag);
  }
  return tags;
}

export function hasUnlockedTags(
  tags: readonly BuildTag[],
  unlockedTags: ReadonlySet<BuildTag>,
): boolean {
  return tags.every((tag) => unlockedTags.has(tag));
}

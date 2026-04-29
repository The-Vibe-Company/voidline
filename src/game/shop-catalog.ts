import type { AccountProgress, BuildTag, ShopItem, ShopItemId } from "../types";

export const STARTER_BUILD_TAGS = ["cannon", "salvage", "magnet"] as const satisfies BuildTag[];

export const shopCatalog: readonly ShopItem[] = [
  {
    id: "module:shield",
    kind: "module",
    name: "Module shield",
    description: "Debloque les upgrades et reliques de bouclier.",
    cost: 1,
    tags: ["shield", "salvage"],
    moduleTag: "shield",
  },
  {
    id: "module:pierce",
    kind: "module",
    name: "Module pierce",
    description: "Ouvre les builds penetration et chaines rail.",
    cost: 1,
    tags: ["pierce", "cannon"],
    moduleTag: "pierce",
  },
  {
    id: "module:drone",
    kind: "module",
    name: "Module drone",
    description: "Ajoute les tourelles orbitales au pool de run.",
    cost: 2,
    tags: ["drone"],
    moduleTag: "drone",
  },
  {
    id: "module:crit",
    kind: "module",
    name: "Module crit",
    description: "Debloque les builds critiques et orbites de precision.",
    cost: 2,
    tags: ["crit", "cannon"],
    moduleTag: "crit",
  },
  {
    id: "weapon:scatter",
    kind: "weapon",
    name: "Scatter Cannon",
    description: "Double depart de salve, impacts plus legers.",
    cost: 2,
    tags: ["cannon", "crit"],
    weaponId: "scatter",
  },
  {
    id: "weapon:lance",
    kind: "weapon",
    name: "Rail Lance",
    description: "Tir lent, lourd et perce-coque.",
    cost: 2,
    tags: ["pierce", "cannon"],
    weaponId: "lance",
  },
  {
    id: "rarity:1",
    kind: "rarity",
    name: "Signal rare I",
    description: "Ameliore legerement les chances de tiers rares.",
    cost: 1,
    tags: [],
    rarityRank: 1,
  },
  {
    id: "rarity:2",
    kind: "rarity",
    name: "Signal rare II",
    description: "Renforce les chances de prototypes.",
    cost: 2,
    tags: [],
    rarityRank: 2,
  },
  {
    id: "rarity:3",
    kind: "rarity",
    name: "Signal rare III",
    description: "Augmente les apparitions de singularites.",
    cost: 3,
    tags: [],
    rarityRank: 3,
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
  return new Set(progress.purchasedIds);
}

export function rarityRank(progress: AccountProgress): number {
  return progress.purchasedIds.reduce((rank, id) => {
    const item = shopCatalog.find((candidate) => candidate.id === id);
    return item?.kind === "rarity" ? Math.max(rank, item.rarityRank ?? 0) : rank;
  }, 0);
}

export function unlockedBuildTags(progress: AccountProgress): Set<BuildTag> {
  const tags = new Set<BuildTag>(STARTER_BUILD_TAGS);
  for (const id of progress.purchasedIds) {
    const item = shopCatalog.find((candidate) => candidate.id === id);
    if (item?.kind === "module" && item.moduleTag) {
      tags.add(item.moduleTag);
    }
  }
  return tags;
}

export function hasUnlockedTags(
  tags: readonly BuildTag[],
  unlockedTags: ReadonlySet<BuildTag>,
): boolean {
  return tags.every((tag) => unlockedTags.has(tag));
}

export function canPurchaseShopItem(
  progress: AccountProgress,
  item: ShopItem,
): { ok: true } | { ok: false; reason: "owned" | "tokens" | "sequence" } {
  if (progress.purchasedIds.includes(item.id)) {
    return { ok: false, reason: "owned" };
  }
  if (progress.tokens < item.cost) {
    return { ok: false, reason: "tokens" };
  }
  if (item.kind === "rarity" && (item.rarityRank ?? 0) !== rarityRank(progress) + 1) {
    return { ok: false, reason: "sequence" };
  }
  return { ok: true };
}

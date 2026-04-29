import type { BuildTag, ShopItem, ShopItemKind } from "../types";
import { shopCatalog } from "./shop-catalog";

export const ROUTES = [
  { key: "cannon", label: "CANNON", angle: -Math.PI / 2 },
  { key: "drone", label: "DRONE", angle: 0 },
  { key: "shield", label: "SHIELD", angle: Math.PI / 2 },
  { key: "magnet", label: "MAGNET", angle: Math.PI },
] as const;

export type RouteKey = (typeof ROUTES)[number]["key"];

const ROUTE_KEYS: readonly RouteKey[] = ["cannon", "drone", "shield", "magnet"];

const FALLBACK_TAG_TO_ROUTE: Partial<Record<BuildTag, RouteKey>> = {
  crit: "cannon",
  pierce: "cannon",
  salvage: "magnet",
};

export function getRouteForShopItem(item: ShopItem): RouteKey | null {
  for (const key of ROUTE_KEYS) {
    if (item.tags.includes(key)) return key;
  }
  for (const tag of item.tags) {
    const fallback = FALLBACK_TAG_TO_ROUTE[tag];
    if (fallback) return fallback;
  }
  return null;
}

export interface TreeNode {
  item: ShopItem;
  route: RouteKey;
  orbit: 1 | 2;
  branchIndex: number;
  branchCount: number;
}

const KIND_PRIORITY: Record<ShopItemKind, number> = {
  technology: 0,
  weapon: 1,
  character: 2,
};

function keystoneComparator(a: ShopItem, b: ShopItem): number {
  if (a.tags.length !== b.tags.length) return a.tags.length - b.tags.length;
  if (KIND_PRIORITY[a.kind] !== KIND_PRIORITY[b.kind]) {
    return KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind];
  }
  if (a.cost !== b.cost) return a.cost - b.cost;
  return a.id.localeCompare(b.id);
}

export function getNodesForRoute(
  route: RouteKey,
  catalog: readonly ShopItem[] = shopCatalog,
): TreeNode[] {
  const onRoute = catalog.filter((item) => getRouteForShopItem(item) === route);
  const direct = onRoute
    .filter((item) => item.tags.includes(route))
    .sort(keystoneComparator);
  const fallback = onRoute
    .filter((item) => !item.tags.includes(route))
    .sort(keystoneComparator);

  const ordered: ShopItem[] = direct.length > 0 ? [...direct, ...fallback] : [...fallback];
  if (ordered.length === 0) return [];

  const orbit2Count = Math.max(0, ordered.length - 1);
  return ordered.map((item, index) => {
    if (index === 0) {
      return { item, route, orbit: 1, branchIndex: 0, branchCount: 1 };
    }
    return {
      item,
      route,
      orbit: 2,
      branchIndex: index - 1,
      branchCount: orbit2Count,
    };
  });
}

export function getAllTreeNodes(
  catalog: readonly ShopItem[] = shopCatalog,
): TreeNode[] {
  return ROUTE_KEYS.flatMap((route) => getNodesForRoute(route, catalog));
}

export function getKeystoneId(
  route: RouteKey,
  catalog: readonly ShopItem[] = shopCatalog,
): string | null {
  const nodes = getNodesForRoute(route, catalog);
  return nodes.find((node) => node.orbit === 1)?.item.id ?? null;
}

export const ROUTE_BRIDGES: ReadonlyArray<readonly [RouteKey, RouteKey]> = [
  ["cannon", "drone"],
  ["shield", "magnet"],
];

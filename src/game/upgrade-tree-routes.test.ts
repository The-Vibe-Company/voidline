import { describe, expect, it } from "vitest";
import { shopCatalog } from "./shop-catalog";
import {
  ROUTES,
  ROUTE_BRIDGES,
  getAllTreeNodes,
  getKeystoneId,
  getNodesForRoute,
  getRouteForShopItem,
} from "./upgrade-tree-routes";

describe("upgrade-tree-routes", () => {
  it("maps every shop item to a route", () => {
    for (const item of shopCatalog) {
      expect(getRouteForShopItem(item), `item ${item.id}`).not.toBeNull();
    }
  });

  it("routes items with a direct route tag to that route", () => {
    expect(getRouteForShopItem(item("technology:heavy-caliber"))).toBe("cannon");
    expect(getRouteForShopItem(item("weapon:scatter"))).toBe("cannon");
    expect(getRouteForShopItem(item("weapon:lance"))).toBe("cannon");
    expect(getRouteForShopItem(item("weapon:drone"))).toBe("drone");
    expect(getRouteForShopItem(item("technology:kinetic-shield"))).toBe("shield");
    expect(getRouteForShopItem(item("character:tank"))).toBe("shield");
  });

  it("routes crit-only items to cannon and salvage+magnet to magnet", () => {
    expect(getRouteForShopItem(item("technology:crit-array"))).toBe("cannon");
    expect(getRouteForShopItem(item("character:runner"))).toBe("magnet");
  });

  it("picks heavy-caliber as the cannon keystone (purest cannon technology)", () => {
    expect(getKeystoneId("cannon")).toBe("technology:heavy-caliber");
  });

  it("picks kinetic-shield over tank as the shield keystone (technology beats character)", () => {
    expect(getKeystoneId("shield")).toBe("technology:kinetic-shield");
  });

  it("falls back to the only candidate when a route has a single direct member", () => {
    expect(getKeystoneId("drone")).toBe("weapon:drone");
    expect(getKeystoneId("magnet")).toBe("character:runner");
  });

  it("places non-keystone items on orbit 2", () => {
    const cannon = getNodesForRoute("cannon");
    const orbits = cannon.map((n) => `${n.item.id}:${n.orbit}`);
    expect(orbits).toContain("technology:heavy-caliber:1");
    expect(orbits).toContain("weapon:scatter:2");
    expect(orbits).toContain("weapon:lance:2");
    expect(orbits).toContain("technology:crit-array:2");
  });

  it("returns deterministic ordering on repeated calls", () => {
    const a = getNodesForRoute("cannon").map((n) => n.item.id);
    const b = getNodesForRoute("cannon").map((n) => n.item.id);
    expect(a).toEqual(b);
  });

  it("assigns branchIndex sequentially within each orbit", () => {
    for (const route of ROUTES) {
      const nodes = getNodesForRoute(route.key);
      const orbit2 = nodes.filter((n) => n.orbit === 2);
      orbit2.forEach((node, idx) => {
        expect(node.branchIndex).toBe(idx);
        expect(node.branchCount).toBe(orbit2.length);
      });
    }
  });

  it("includes every shop item exactly once across all routes", () => {
    const allIds = getAllTreeNodes().map((n) => n.item.id);
    const unique = new Set(allIds);
    expect(allIds).toHaveLength(shopCatalog.length);
    expect(unique.size).toBe(shopCatalog.length);
  });

  it("declares two diagonal bridges between adjacent routes", () => {
    expect(ROUTE_BRIDGES).toHaveLength(2);
    for (const [a, b] of ROUTE_BRIDGES) {
      expect(["cannon", "drone", "shield", "magnet"]).toContain(a);
      expect(["cannon", "drone", "shield", "magnet"]).toContain(b);
      expect(a).not.toBe(b);
    }
  });
});

function item(id: string) {
  const found = shopCatalog.find((entry) => entry.id === id);
  if (!found) throw new Error(`unknown item: ${id}`);
  return found;
}

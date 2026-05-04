import { describe, expect, it } from "vitest";
import {
  MAX_WEAPONS,
  acquireWeapon,
  canMergeWeapons,
  effectiveWeaponStats,
  findWeaponDef,
  makeStarterWeapon,
  mergeWeapons,
  playerLoadoutFull,
  playerOwnsWeapon,
  sellValue,
  sellWeapon,
  weaponCatalog,
} from "./weapon-catalog";
import { createPlayerBaseState } from "../state";

describe("weapon catalog", () => {
  it("each archetype has 4 tiers", () => {
    for (const def of weaponCatalog) {
      expect(def.tiers.length).toBe(4);
    }
  });

  it("damage and cost grow monotonically across tiers", () => {
    for (const def of weaponCatalog) {
      for (let t = 1; t < 4; t += 1) {
        expect(def.tiers[t]!.damage).toBeGreaterThanOrEqual(def.tiers[t - 1]!.damage);
        expect(def.tiers[t]!.cost).toBeGreaterThan(def.tiers[t - 1]!.cost);
      }
    }
  });

  it("pulse T1 mirrors original starter stats", () => {
    const def = findWeaponDef("pulse");
    expect(def.tiers[0]).toEqual(
      expect.objectContaining({
        damage: 24,
        fireRate: 1.6,
        projectileCount: 1,
        range: 240,
        bulletSpeed: 380,
        bulletLife: 0.65,
        bulletRadius: 1,
      }),
    );
  });

  it("starter weapon is pulse T1 with zero purchase cost", () => {
    const player = createPlayerBaseState();
    expect(player.weapons.length).toBe(1);
    expect(player.weapons[0]!.defId).toBe("pulse");
    expect(player.weapons[0]!.tier).toBe(1);
    expect(player.weapons[0]!.purchaseCost).toBe(0);
  });

  it("acquireWeapon adds to loadout when not owned", () => {
    const player = createPlayerBaseState();
    expect(acquireWeapon(player, "smg", 1, 25)).toBe(true);
    expect(playerOwnsWeapon(player, "smg")).toBe(true);
    expect(player.weapons.length).toBe(2);
    expect(player.weapons[1]!.purchaseCost).toBe(25);
  });

  it("acquireWeapon allows duplicates of the same archetype", () => {
    const player = createPlayerBaseState();
    expect(acquireWeapon(player, "pulse", 1, 25)).toBe(true);
    expect(acquireWeapon(player, "pulse", 1, 25)).toBe(true);
    const pulses = player.weapons.filter((w) => w.defId === "pulse");
    expect(pulses.length).toBe(3); // starter + 2 duplicates
  });

  it("acquireWeapon refuses when loadout full", () => {
    const player = createPlayerBaseState();
    const archetypes = ["smg", "shotgun", "sniper", "minigun", "railgun"] as const;
    for (const id of archetypes) acquireWeapon(player, id, 1);
    expect(player.weapons.length).toBe(MAX_WEAPONS);
    expect(playerLoadoutFull(player)).toBe(true);
    expect(acquireWeapon(player, "pulse", 1)).toBe(false);
  });

  it("mergeWeapons fuses two same-archetype same-tier weapons into tier+1", () => {
    const player = createPlayerBaseState();
    acquireWeapon(player, "smg", 1, 25);
    acquireWeapon(player, "smg", 1, 25);
    expect(player.weapons.length).toBe(3);
    const merged = mergeWeapons(player, 1, 2);
    expect(merged).not.toBeNull();
    expect(merged!.defId).toBe("smg");
    expect(merged!.tier).toBe(2);
    expect(merged!.purchaseCost).toBe(50);
    expect(player.weapons.length).toBe(2);
    expect(player.weapons.filter((w) => w.defId === "smg").length).toBe(1);
  });

  it("mergeWeapons rejects mismatched archetype, tier, or T4", () => {
    const player = createPlayerBaseState();
    acquireWeapon(player, "smg", 1, 25);
    acquireWeapon(player, "shotgun", 1, 30);
    expect(canMergeWeapons(player, 1, 2)).toBe(false);
    expect(mergeWeapons(player, 1, 2)).toBeNull();

    acquireWeapon(player, "sniper", 4, 300);
    acquireWeapon(player, "sniper", 4, 300);
    const sniperIdxs = player.weapons
      .map((w, i) => (w.defId === "sniper" ? i : -1))
      .filter((i) => i >= 0);
    expect(canMergeWeapons(player, sniperIdxs[0]!, sniperIdxs[1]!)).toBe(false);
    expect(mergeWeapons(player, sniperIdxs[0]!, sniperIdxs[1]!)).toBeNull();

    expect(canMergeWeapons(player, 1, 1)).toBe(false);
  });

  it("sellWeapon refunds floor(purchaseCost / 2) and removes the weapon", () => {
    const player = createPlayerBaseState();
    acquireWeapon(player, "smg", 1, 27);
    expect(player.weapons.length).toBe(2);
    expect(sellValue(player.weapons[1]!)).toBe(13);
    const refund = sellWeapon(player, 1);
    expect(refund).toBe(13);
    expect(player.weapons.length).toBe(1);
    expect(playerOwnsWeapon(player, "smg")).toBe(false);
  });

  it("sellWeapon refuses to remove the last weapon and keeps the starter equipped", () => {
    const player = createPlayerBaseState();
    expect(sellWeapon(player, 0)).toBe(0);
    expect(player.weapons.length).toBe(1);
    expect(player.weapons[0]!.defId).toBe("pulse");
  });

  it("effectiveWeaponStats stacks player bonuses on weapon base", () => {
    const player = createPlayerBaseState();
    player.damage = 10;
    player.fireRate = 0.5;
    player.range = 60;
    player.bulletSpeed = 1.2;
    const eff = effectiveWeaponStats(makeStarterWeapon(), player);
    expect(eff.damage).toBe(34);
    expect(eff.fireRate).toBeCloseTo(2.1, 5);
    expect(eff.range).toBe(300);
    expect(eff.bulletSpeed).toBeCloseTo(380 * 1.2, 5);
  });
});

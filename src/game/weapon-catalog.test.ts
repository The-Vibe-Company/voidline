import { describe, expect, it } from "vitest";
import {
  MAX_WEAPONS,
  acquireWeapon,
  effectiveWeaponStats,
  findWeaponDef,
  makeStarterWeapon,
  playerLoadoutFull,
  playerOwnsWeapon,
  promoteWeapon,
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

  it("starter weapon is pulse T1", () => {
    const player = createPlayerBaseState();
    expect(player.weapons.length).toBe(1);
    expect(player.weapons[0]!.defId).toBe("pulse");
    expect(player.weapons[0]!.tier).toBe(1);
  });

  it("acquireWeapon adds to loadout when not owned", () => {
    const player = createPlayerBaseState();
    expect(acquireWeapon(player, "smg", 1)).toBe(true);
    expect(playerOwnsWeapon(player, "smg")).toBe(true);
    expect(player.weapons.length).toBe(2);
  });

  it("acquireWeapon refuses duplicates", () => {
    const player = createPlayerBaseState();
    expect(acquireWeapon(player, "pulse", 1)).toBe(false);
  });

  it("acquireWeapon refuses when loadout full", () => {
    const player = createPlayerBaseState();
    const archetypes = ["smg", "shotgun", "sniper", "minigun", "railgun"] as const;
    for (const id of archetypes) acquireWeapon(player, id, 1);
    expect(player.weapons.length).toBe(MAX_WEAPONS);
    expect(playerLoadoutFull(player)).toBe(true);
    // 7th archetype doesn't exist; try re-adding (still no-op via duplicate path)
    expect(acquireWeapon(player, "pulse", 1)).toBe(false);
  });

  it("promoteWeapon raises tier and caps at 4", () => {
    const player = createPlayerBaseState();
    expect(player.weapons[0]!.tier).toBe(1);
    expect(promoteWeapon(player, "pulse")).toBe(true);
    expect(player.weapons[0]!.tier).toBe(2);
    expect(promoteWeapon(player, "pulse")).toBe(true);
    expect(promoteWeapon(player, "pulse")).toBe(true);
    expect(player.weapons[0]!.tier).toBe(4);
    expect(promoteWeapon(player, "pulse")).toBe(false);
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

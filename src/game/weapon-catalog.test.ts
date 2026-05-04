import { describe, expect, it } from "vitest";
import {
  effectiveWeaponStats,
  findWeaponDef,
  makeStarterWeapon,
  promoteWeapon,
  applyMutation,
  weaponBaseStats,
  weaponCatalog,
} from "./weapon-catalog";
import { mutationsFor } from "./mutation-catalog";
import { createPlayerBaseState } from "../state";

describe("weapon catalog", () => {
  it("each archetype has 4 base tiers", () => {
    for (const def of weaponCatalog) {
      expect(def.tiers.length).toBe(4);
    }
  });

  it("damage grows monotonically across tiers", () => {
    for (const def of weaponCatalog) {
      for (let t = 1; t < 4; t += 1) {
        expect(def.tiers[t]!.damage).toBeGreaterThanOrEqual(def.tiers[t - 1]!.damage);
      }
    }
  });

  it("each archetype has at least one mutation", () => {
    for (const def of weaponCatalog) {
      expect(mutationsFor(def.id).length).toBeGreaterThan(0);
    }
  });

  it("starter weapon defaults to pulse T1 with no mutation", () => {
    const player = createPlayerBaseState();
    expect(player.activeWeapon.defId).toBe("pulse");
    expect(player.activeWeapon.tier).toBe(1);
    expect(player.activeWeapon.mutationId).toBeNull();
  });

  it("promoteWeapon raises tier and caps at 4", () => {
    const weapon = makeStarterWeapon("pulse");
    expect(promoteWeapon(weapon)).toBe(true);
    expect(weapon.tier).toBe(2);
    expect(promoteWeapon(weapon)).toBe(true);
    expect(promoteWeapon(weapon)).toBe(true);
    expect(weapon.tier).toBe(4);
    expect(promoteWeapon(weapon)).toBe(false);
  });

  it("applyMutation assigns mutationId and bumps tier", () => {
    const weapon = makeStarterWeapon("pulse");
    const mutationId = mutationsFor("pulse")[0]!.id;
    expect(applyMutation(weapon, mutationId)).toBe(true);
    expect(weapon.mutationId).toBe(mutationId);
    expect(weapon.tier).toBeGreaterThan(1);
  });

  it("weaponBaseStats reads from mutation when set", () => {
    const weapon = makeStarterWeapon("pulse");
    const mutationId = mutationsFor("pulse")[0]!.id;
    applyMutation(weapon, mutationId);
    const baseStats = weaponBaseStats(weapon);
    const mutationStats = mutationsFor("pulse").find((m) => m.id === mutationId)!.stats;
    expect(baseStats.damage).toBe(mutationStats.damage);
  });

  it("effectiveWeaponStats stacks player bonuses on weapon base", () => {
    const player = createPlayerBaseState();
    player.damage = 10;
    player.fireRate = 0.5;
    player.range = 60;
    player.bulletSpeed = 1.2;
    const eff = effectiveWeaponStats(makeStarterWeapon(), player);
    const baseDamage = findWeaponDef("pulse").tiers[0]!.damage;
    expect(eff.damage).toBeCloseTo(baseDamage + 10, 5);
    expect(eff.range).toBeCloseTo(240 + 60, 5);
    expect(eff.bulletSpeed).toBeCloseTo(380 * 1.2, 5);
  });
});

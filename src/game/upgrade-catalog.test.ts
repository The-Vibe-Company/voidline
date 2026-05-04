import { describe, expect, it } from "vitest";
import {
  applyUpgradeToPlayer,
  findUpgrade,
  previewUpgradeOnPlayer,
  upgradeCatalog,
} from "./upgrade-catalog";
import { createPlayerBaseState } from "../state";
import { effectiveWeaponStats, makeStarterWeapon } from "./weapon-catalog";

describe("upgrade catalog", () => {
  it("findUpgrade resolves catalog entries", () => {
    for (const upgrade of upgradeCatalog) {
      expect(findUpgrade(upgrade.id)).toBe(upgrade);
    }
  });

  it("applies damage upgrade as a multiplier", () => {
    const player = createPlayerBaseState();
    const before = player.damageMul;
    applyUpgradeToPlayer(findUpgrade("damage-up"), player);
    expect(player.damageMul).toBeCloseTo(before + 0.15, 5);
  });

  it("applies fire-rate upgrade as a multiplier", () => {
    const player = createPlayerBaseState();
    const before = player.fireRateMul;
    applyUpgradeToPlayer(findUpgrade("fire-rate-up"), player);
    expect(player.fireRateMul).toBeCloseTo(before + 0.15, 5);
  });

  it("damage upgrade applies the same DPS gain across weapons", () => {
    const player1 = createPlayerBaseState();
    const player2 = createPlayerBaseState();
    applyUpgradeToPlayer(findUpgrade("damage-up"), player1);
    applyUpgradeToPlayer(findUpgrade("damage-up"), player2);
    const pulse1 = effectiveWeaponStats(makeStarterWeapon("pulse"), player1);
    const pulse0 = effectiveWeaponStats(makeStarterWeapon("pulse"), createPlayerBaseState());
    const minigun1 = effectiveWeaponStats(makeStarterWeapon("minigun"), player2);
    const minigun0 = effectiveWeaponStats(makeStarterWeapon("minigun"), createPlayerBaseState());
    const pulseGain = pulse1.damage / pulse0.damage;
    const minigunGain = minigun1.damage / minigun0.damage;
    expect(pulseGain).toBeCloseTo(minigunGain, 3);
  });

  it("max-hp upgrade heals up to the new cap", () => {
    const player = createPlayerBaseState();
    player.hp = 50;
    applyUpgradeToPlayer(findUpgrade("max-hp-up"), player);
    expect(player.maxHp).toBe(120);
    expect(player.hp).toBe(70);
  });

  it("crit chance is capped at 0.95", () => {
    const player = createPlayerBaseState();
    for (let i = 0; i < 12; i += 1) {
      applyUpgradeToPlayer(findUpgrade("crit-up"), player);
    }
    expect(player.critChance).toBeLessThanOrEqual(0.95);
  });

  it("bullet radius upgrade is multiplicative", () => {
    const player = createPlayerBaseState();
    applyUpgradeToPlayer(findUpgrade("bullet-radius-up"), player);
    expect(player.bulletRadius).toBeCloseTo(1.3, 5);
    applyUpgradeToPlayer(findUpgrade("bullet-radius-up"), player);
    expect(player.bulletRadius).toBeCloseTo(1.69, 5);
  });

  it("no upgrade references magnet/heal/bomb stats", () => {
    const banned = ["magnet", "pickupRadius", "heal", "bomb"];
    for (const upgrade of upgradeCatalog) {
      const text = `${upgrade.id} ${upgrade.name} ${upgrade.description}`;
      for (const keyword of banned) {
        expect(text.toLowerCase()).not.toContain(keyword);
      }
      for (const effect of upgrade.effects) {
        expect(effect.stat).not.toBe("pickupRadius" as never);
      }
    }
  });

  it("catalog drops the projectile/pierce flat-malus cards", () => {
    const ids = upgradeCatalog.map((u) => u.id);
    expect(ids).not.toContain("projectile-up");
    expect(ids).not.toContain("pierce-up");
  });

  it("damage upgrade scales the starter weapon damage by its multiplier", () => {
    const player = createPlayerBaseState();
    applyUpgradeToPlayer(findUpgrade("damage-up"), player);
    const eff = effectiveWeaponStats(makeStarterWeapon(), player);
    expect(eff.damage).toBeCloseTo(24 * 1.15, 3);
  });

  it("every upgrade exposes an icon asset path", () => {
    for (const upgrade of upgradeCatalog) {
      expect(upgrade.icon).toMatch(/^\/icons\/upgrades\/.+\.png$/);
    }
  });

  it("upgrade ids are unique", () => {
    const ids = upgradeCatalog.map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("previewUpgradeOnPlayer", () => {
  it("does not mutate the source player", () => {
    const player = createPlayerBaseState();
    const snapshot = { ...player };
    previewUpgradeOnPlayer(findUpgrade("damage-up"), player);
    expect(player).toEqual(snapshot);
  });

  it("returns before/after for a simple buff", () => {
    const player = createPlayerBaseState();
    const preview = previewUpgradeOnPlayer(findUpgrade("damage-up"), player);
    expect(preview).toHaveLength(1);
    expect(preview[0]).toMatchObject({
      stat: "damageMul",
      isMalus: false,
    });
    expect(preview[0]!.before).toBeCloseTo(player.damageMul, 5);
    expect(preview[0]!.after).toBeCloseTo(player.damageMul + 0.15, 5);
  });

  it("handles multiplicative effects", () => {
    const player = createPlayerBaseState();
    const preview = previewUpgradeOnPlayer(findUpgrade("bullet-radius-up"), player);
    expect(preview[0].before).toBeCloseTo(1, 5);
    expect(preview[0].after).toBeCloseTo(1.3, 5);
  });

  it("respects the crit cap of 0.95 in the preview", () => {
    const player = createPlayerBaseState();
    player.critChance = 0.92;
    const preview = previewUpgradeOnPlayer(findUpgrade("crit-up"), player);
    expect(preview[0].before).toBeCloseTo(0.92, 5);
    expect(preview[0].after).toBeCloseTo(0.95, 5);
  });
});

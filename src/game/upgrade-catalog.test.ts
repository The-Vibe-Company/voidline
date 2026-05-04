import { describe, expect, it } from "vitest";
import { applyUpgradeToPlayer, findUpgrade, upgradeCatalog } from "./upgrade-catalog";
import { createPlayerBaseState } from "../state";

describe("upgrade catalog", () => {
  it("findUpgrade resolves catalog entries", () => {
    for (const upgrade of upgradeCatalog) {
      expect(findUpgrade(upgrade.id)).toBe(upgrade);
    }
  });

  it("applies damage upgrade additively", () => {
    const player = createPlayerBaseState();
    const before = player.damage;
    applyUpgradeToPlayer(findUpgrade("damage-up"), player);
    expect(player.damage).toBe(before + 8);
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

  it("projectile upgrade carries a damage malus per CLAUDE.md rule", () => {
    const player = createPlayerBaseState();
    const before = { damage: player.damage, projectileCount: player.projectileCount };
    applyUpgradeToPlayer(findUpgrade("projectile-up"), player);
    expect(player.projectileCount).toBe(before.projectileCount + 1);
    expect(player.damage).toBe(before.damage - 3);
  });

  it("pierce upgrade carries a damage malus per CLAUDE.md rule", () => {
    const player = createPlayerBaseState();
    const before = { damage: player.damage, pierce: player.pierce };
    applyUpgradeToPlayer(findUpgrade("pierce-up"), player);
    expect(player.pierce).toBe(before.pierce + 1);
    expect(player.damage).toBe(before.damage - 2);
  });

  it("damage cannot drop below 1 even after stacked malus", () => {
    const player = createPlayerBaseState();
    player.damage = 2;
    applyUpgradeToPlayer(findUpgrade("projectile-up"), player);
    expect(player.damage).toBeGreaterThanOrEqual(1);
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

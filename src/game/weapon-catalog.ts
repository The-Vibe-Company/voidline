import type { Player, Weapon, WeaponId } from "../types";
import { balance, recomputeMultiplicativeStats } from "./balance";

export const weaponCatalog: readonly Weapon[] = [
  {
    id: "standard",
    name: "Standard",
    icon: "STD",
    description: "Salve stable, sans biais de build.",
    tags: ["cannon"],
    apply() {
      // Baseline ship state already represents the standard weapon.
    },
  },
  {
    id: "scatter",
    name: "Scatter Cannon",
    icon: "SCT",
    description: "Plus de projectiles, impacts plus legers.",
    tags: ["cannon", "crit"],
    apply(target) {
      target.projectileCount = Math.min(
        target.projectileCount + 1,
        balance.upgrade.caps.projectiles,
      );
      target.bonus.damagePct -= 0.16;
      target.bonus.bulletRadiusPct -= 0.08;
      recomputeMultiplicativeStats(target);
    },
  },
  {
    id: "lance",
    name: "Rail Lance",
    icon: "RLG",
    description: "Cadence basse, degats lourds et penetration de base.",
    tags: ["pierce", "cannon"],
    apply(target) {
      target.pierce = Math.max(target.pierce, 1);
      target.bonus.fireRatePct -= 0.34;
      target.bonus.damagePct += 0.48;
      target.bonus.bulletSpeedPct += 0.2;
      recomputeMultiplicativeStats(target);
    },
  },
];

export function findWeapon(id: WeaponId): Weapon {
  const weapon = weaponCatalog.find((candidate) => candidate.id === id);
  if (!weapon) {
    throw new Error(`Unknown weapon: ${id}`);
  }
  return weapon;
}

export function applyWeapon(id: WeaponId, target: Player): void {
  findWeapon(id).apply(target);
}

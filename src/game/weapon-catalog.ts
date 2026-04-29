import type { Player, Weapon, WeaponId } from "../types";
import { balance, recomputeMultiplicativeStats } from "./balance";

export const weaponCatalog: readonly Weapon[] = [
  {
    id: "pulse",
    name: "Pulse Rifle",
    icon: "PUL",
    description: "Arme standard, fiable, sans faiblesse majeure.",
    tags: ["cannon"],
    apply() {
      // Baseline ship state already represents the pulse rifle.
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
  {
    id: "drone",
    name: "Drone Core",
    icon: "DRN",
    description: "Un drone autonome des le depart, faible burst principal.",
    tags: ["drone", "salvage"],
    apply(target) {
      target.drones = Math.max(target.drones, 1);
      target.bonus.fireRatePct -= 0.12;
      target.bonus.damagePct -= 0.1;
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

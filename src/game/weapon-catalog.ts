import type { Player, Weapon, WeaponId } from "../types";
import { runEffects, type EffectOp } from "./effect-dsl";

type WeaponSpec = Omit<Weapon, "apply"> & { effects: readonly EffectOp[] };

function defineWeapon(spec: WeaponSpec): Weapon {
  return {
    ...spec,
    apply: (target) => runEffects(spec.effects, 1, target),
  };
}

export const weaponCatalog: readonly Weapon[] = [
  defineWeapon({
    id: "pulse",
    name: "Pulse Rifle",
    icon: "PUL",
    description: "Arme standard, fiable, sans faiblesse majeure.",
    tags: ["cannon"],
    effects: [],
  }),
  defineWeapon({
    id: "scatter",
    name: "Scatter Cannon",
    icon: "SCT",
    description: "Plus de projectiles, impacts plus legers.",
    tags: ["cannon", "crit"],
    effects: [
      { type: "addCapped", stat: "projectileCount", amount: 1, cap: "projectiles" },
      { type: "addPct", stat: "damage", amount: -0.16, scale: 1 },
      { type: "addPct", stat: "bulletRadius", amount: -0.08, scale: 1 },
    ],
  }),
  defineWeapon({
    id: "lance",
    name: "Rail Lance",
    icon: "RLG",
    description: "Cadence basse, degats lourds et penetration de base.",
    tags: ["pierce", "cannon"],
    effects: [
      { type: "setMin", stat: "pierce", value: 1 },
      { type: "addPct", stat: "fireRate", amount: -0.34, scale: 1 },
      { type: "addPct", stat: "damage", amount: 0.48, scale: 1 },
      { type: "addPct", stat: "bulletSpeed", amount: 0.2, scale: 1 },
    ],
  }),
  defineWeapon({
    id: "drone",
    name: "Drone Core",
    icon: "DRN",
    description: "Un drone autonome des le depart, faible burst principal.",
    tags: ["drone", "salvage"],
    effects: [
      { type: "setMin", stat: "drones", value: 1 },
      { type: "addPct", stat: "fireRate", amount: -0.12, scale: 1 },
      { type: "addPct", stat: "damage", amount: -0.1, scale: 1 },
    ],
  }),
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

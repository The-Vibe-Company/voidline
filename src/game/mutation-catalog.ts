import type { WeaponArchetypeId, WeaponMutation, WeaponTierStats } from "../types";

function stats(
  damage: number,
  fireRate: number,
  projectileCount: number,
  pierce: number,
  bulletSpeed: number,
  bulletLife: number,
  range: number,
  bulletRadius: number,
  spread: number,
  critChance: number,
): WeaponTierStats {
  return {
    damage,
    fireRate,
    projectileCount,
    pierce,
    bulletSpeed,
    bulletLife,
    range,
    bulletRadius,
    spread,
    critChance,
  };
}

export const mutationCatalog: Record<WeaponArchetypeId, readonly WeaponMutation[]> = {
  pulse: [
    {
      id: "pulse-storm",
      name: "Pulse Storm",
      description: "+3 projectiles, +30% cadence, traverse 2",
      stats: stats(58, 2.6, 4, 3, 460, 0.85, 340, 1.25, 0.18, 0.18),
    },
    {
      id: "pulse-cannon",
      name: "Pulse Cannon",
      description: "Projectile massif, traverse 5",
      stats: stats(160, 1.4, 1, 5, 520, 1.0, 380, 2.0, 0, 0.25),
    },
  ],
  smg: [
    {
      id: "smg-overdrive",
      name: "Overdrive",
      description: "Cadence x2, 50% crit",
      stats: stats(22, 12, 1, 1, 540, 0.6, 280, 1.05, 0.05, 0.5),
    },
    {
      id: "smg-twin",
      name: "Twin Barrels",
      description: "+1 projectile, +50% cadence",
      stats: stats(20, 9.5, 2, 1, 520, 0.6, 280, 1.0, 0.08, 0.25),
    },
  ],
  shotgun: [
    {
      id: "shotgun-flak",
      name: "Flak Storm",
      description: "+5 plombs, +50% pierce",
      stats: stats(14, 1.4, 14, 2, 460, 0.5, 240, 1.1, 0.6, 0.15),
    },
    {
      id: "shotgun-slug",
      name: "Slug",
      description: "1 projectile lourd, 4 pierce",
      stats: stats(120, 1.6, 1, 4, 580, 0.9, 320, 2.0, 0, 0.3),
    },
  ],
  sniper: [
    {
      id: "sniper-railshot",
      name: "Railshot",
      description: "Crit énorme, traverse 6",
      stats: stats(220, 0.85, 1, 6, 950, 1.6, 760, 1.0, 0, 0.45),
    },
    {
      id: "sniper-piercer",
      name: "Piercer",
      description: "+2 projectiles, traverse 5",
      stats: stats(140, 1.0, 3, 5, 850, 1.5, 700, 0.95, 0.05, 0.3),
    },
  ],
  minigun: [
    {
      id: "minigun-typhoon",
      name: "Typhoon",
      description: "Cadence x1.4, +1 projectile",
      stats: stats(20, 14, 2, 2, 520, 0.6, 300, 1.05, 0.16, 0.18),
    },
    {
      id: "minigun-incinerator",
      name: "Incinerator",
      description: "Calibre x2, traverse 3",
      stats: stats(30, 9, 1, 3, 480, 0.55, 280, 2.0, 0.1, 0.15),
    },
  ],
  railgun: [
    {
      id: "railgun-singularity",
      name: "Singularity",
      description: "Dégâts massifs, traverse 12",
      stats: stats(680, 0.55, 1, 12, 1200, 2.0, 880, 2.4, 0, 0.3),
    },
    {
      id: "railgun-twinrail",
      name: "Twin Rail",
      description: "+1 projectile, traverse 8",
      stats: stats(380, 0.6, 2, 8, 1100, 1.8, 820, 2.0, 0.05, 0.22),
    },
  ],
};

export function mutationsFor(weaponId: WeaponArchetypeId): readonly WeaponMutation[] {
  return mutationCatalog[weaponId];
}

export function findMutation(weaponId: WeaponArchetypeId, mutationId: string): WeaponMutation {
  const list = mutationsFor(weaponId);
  const found = list.find((m) => m.id === mutationId);
  if (!found) throw new Error(`Unknown mutation ${mutationId} for ${weaponId}`);
  return found;
}

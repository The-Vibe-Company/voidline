import type {
  Player,
  Weapon,
  WeaponArchetypeId,
  WeaponDef,
  WeaponTier,
  WeaponTierStats,
} from "../types";
import { findMutation } from "./mutation-catalog";

const WEAPON_ICON_BASE = "/icons/weapons";

function tier(
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

export const weaponCatalog: readonly WeaponDef[] = [
  {
    id: "pulse",
    name: "Pulse",
    icon: `${WEAPON_ICON_BASE}/pulse.png`,
    description: "Tir équilibré, mono-cible",
    tiers: [
      tier(24, 1.6, 1, 0, 380, 0.65, 240, 1.0, 0, 0),
      tier(34, 1.8, 1, 0, 400, 0.7, 260, 1.05, 0, 0.05),
      tier(48, 2.0, 1, 1, 420, 0.75, 280, 1.1, 0, 0.08),
      tier(72, 2.2, 1, 1, 450, 0.8, 320, 1.2, 0, 0.12),
    ],
  },
  {
    id: "smg",
    name: "SMG",
    icon: `${WEAPON_ICON_BASE}/smg.png`,
    description: "Rafale rapide, dégâts faibles",
    tiers: [
      tier(9, 4.5, 1, 0, 460, 0.5, 200, 0.85, 0.05, 0),
      tier(13, 5.0, 1, 0, 470, 0.5, 210, 0.9, 0.05, 0.05),
      tier(18, 5.6, 1, 0, 480, 0.55, 220, 0.95, 0.04, 0.08),
      tier(26, 6.4, 1, 1, 500, 0.55, 240, 1.0, 0.04, 0.12),
    ],
  },
  {
    id: "shotgun",
    name: "Shotgun",
    icon: `${WEAPON_ICON_BASE}/shotgun.png`,
    description: "Gerbe large, courte portée",
    tiers: [
      tier(6, 0.9, 5, 0, 360, 0.35, 160, 0.9, 0.5, 0),
      tier(8, 1.0, 6, 0, 370, 0.36, 170, 0.92, 0.52, 0),
      tier(11, 1.1, 7, 1, 380, 0.38, 180, 0.95, 0.54, 0.05),
      tier(15, 1.2, 9, 1, 400, 0.4, 200, 1.0, 0.55, 0.1),
    ],
  },
  {
    id: "sniper",
    name: "Sniper",
    icon: `${WEAPON_ICON_BASE}/sniper.png`,
    description: "Tir précis longue portée, perforant",
    tiers: [
      tier(55, 0.6, 1, 2, 700, 1.2, 520, 0.7, 0, 0.15),
      tier(80, 0.65, 1, 2, 720, 1.25, 560, 0.75, 0, 0.2),
      tier(115, 0.7, 1, 3, 750, 1.3, 600, 0.8, 0, 0.25),
      tier(170, 0.75, 1, 4, 800, 1.4, 660, 0.9, 0, 0.3),
    ],
  },
  {
    id: "minigun",
    name: "Minigun",
    icon: `${WEAPON_ICON_BASE}/minigun.png`,
    description: "Cadence très élevée, dispersion",
    tiers: [
      tier(5, 7.5, 1, 0, 420, 0.45, 220, 0.8, 0.18, 0),
      tier(7, 8.5, 1, 0, 430, 0.45, 230, 0.85, 0.16, 0.05),
      tier(10, 9.5, 1, 0, 440, 0.5, 240, 0.9, 0.14, 0.08),
      tier(15, 10.5, 1, 1, 460, 0.5, 260, 0.95, 0.12, 0.12),
    ],
  },
  {
    id: "railgun",
    name: "Railgun",
    icon: `${WEAPON_ICON_BASE}/railgun.png`,
    description: "Coup lourd, traverse les rangs",
    tiers: [
      tier(140, 0.35, 1, 4, 900, 1.5, 640, 1.4, 0, 0.1),
      tier(200, 0.4, 1, 5, 950, 1.55, 680, 1.5, 0, 0.12),
      tier(280, 0.45, 1, 6, 1000, 1.6, 720, 1.6, 0, 0.15),
      tier(420, 0.5, 1, 8, 1080, 1.7, 780, 1.8, 0, 0.2),
    ],
  },
];

export function findWeaponDef(id: WeaponArchetypeId): WeaponDef {
  const def = weaponCatalog.find((entry) => entry.id === id);
  if (!def) throw new Error(`Unknown weapon: ${id}`);
  return def;
}

export function weaponBaseStats(weapon: Weapon): WeaponTierStats {
  if (weapon.mutationId) {
    return findMutation(weapon.defId, weapon.mutationId).stats;
  }
  const def = findWeaponDef(weapon.defId);
  const idx = Math.min(4, Math.max(1, weapon.tier)) - 1;
  return def.tiers[idx]!;
}

export function canPromoteWeapon(weapon: Weapon): boolean {
  return weapon.tier < 4 && weapon.mutationId === null;
}

export function promoteWeapon(weapon: Weapon): boolean {
  if (!canPromoteWeapon(weapon)) return false;
  weapon.tier = (weapon.tier + 1) as WeaponTier;
  return true;
}

export function applyMutation(weapon: Weapon, mutationId: string): boolean {
  const mutation = findMutation(weapon.defId, mutationId);
  weapon.mutationId = mutation.id;
  weapon.tier = Math.min(8, weapon.tier + 1) as WeaponTier;
  return true;
}

export interface EffectiveWeaponStats {
  damage: number;
  fireRate: number;
  projectileCount: number;
  pierce: number;
  bulletSpeed: number;
  bulletLife: number;
  range: number;
  bulletRadius: number;
  spread: number;
  critChance: number;
}

export function effectiveWeaponStats(weapon: Weapon, player: Player): EffectiveWeaponStats {
  const base = weaponBaseStats(weapon);
  return {
    damage: Math.max(1, (base.damage + player.damage) * Math.max(0.1, player.damageMul)),
    fireRate: Math.max(0.05, (base.fireRate + player.fireRate) * Math.max(0.1, player.fireRateMul)),
    projectileCount: Math.max(1, Math.floor(base.projectileCount + player.projectileCount)),
    pierce: Math.max(0, base.pierce + player.pierce),
    bulletSpeed: base.bulletSpeed * Math.max(0.1, player.bulletSpeed),
    bulletLife: base.bulletLife * Math.max(0.1, player.bulletLife),
    range: Math.max(40, base.range + player.range),
    bulletRadius: base.bulletRadius * Math.max(0.1, player.bulletRadius),
    spread: base.spread,
    critChance: Math.min(0.95, Math.max(0, base.critChance + player.critChance)),
  };
}

export function makeStarterWeapon(defId: WeaponArchetypeId = "pulse"): Weapon {
  return {
    defId,
    tier: 1,
    mutationId: null,
    fireTimer: 0,
    aimAngle: -Math.PI / 2,
  };
}

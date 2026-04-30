import {
  balance,
  droneGain,
  maxHpGain,
  pierceGain,
  projectileGain,
  recomputeMultiplicativeStats,
  shieldGain,
  shieldRegenGain,
} from "./balance";
import { STARTER_BUILD_TAGS, STARTER_TECHNOLOGY_IDS, hasUnlockedTags } from "./shop-catalog";
import type { BuildTag, Player, Upgrade, WeaponId } from "../types";

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export const upgradePool: Upgrade[] = [
  {
    id: "twin-cannon",
    kind: "technology",
    icon: "II",
    name: "Technologie salves",
    description: "Elargit les tirs de l'arme active.",
    tags: ["cannon"],
    softCap: { stat: "projectileCount", max: balance.upgrade.caps.projectiles },
    effect(tier) {
      return `+${projectileGain(tier)} projectile${projectileGain(tier) > 1 ? "s" : ""} par salve`;
    },
    apply(tier, target) {
      target.projectileCount = Math.min(
        balance.upgrade.caps.projectiles,
        target.projectileCount + projectileGain(tier),
      );
    },
  },
  {
    id: "plasma-core",
    kind: "technology",
    icon: "Hz",
    name: "Technologie cadence",
    description: "Accorde le reacteur au rythme des canons.",
    tags: ["cannon"],
    effect(tier) {
      return `+${percent(balance.upgrade.effects.fireRate * tier.power)} cadence`;
    },
    apply(tier, target) {
      target.bonus.fireRatePct += balance.upgrade.effects.fireRate * tier.power;
      recomputeMultiplicativeStats(target);
    },
  },
  {
    id: "rail-slug",
    kind: "technology",
    icon: "DMG",
    name: "Technologie degats",
    description: "Charge les impacts avec une masse cinetique.",
    tags: ["cannon"],
    effect(tier) {
      return `+${percent(balance.upgrade.effects.damage * tier.power)} degats, +${percent(
        balance.upgrade.effects.bulletSpeed * tier.power,
      )} vitesse`;
    },
    apply(tier, target) {
      target.bonus.damagePct += balance.upgrade.effects.damage * tier.power;
      target.bonus.bulletSpeedPct += balance.upgrade.effects.bulletSpeed * tier.power;
      recomputeMultiplicativeStats(target);
    },
  },
  {
    id: "ion-engine",
    kind: "technology",
    icon: "SPD",
    name: "Technologie moteurs",
    description: "Rend les corrections de trajectoire plus nerveuses.",
    tags: ["salvage"],
    effect(tier) {
      return `+${percent(balance.upgrade.effects.speed * tier.power)} vitesse`;
    },
    apply(tier, target) {
      target.bonus.speedPct += balance.upgrade.effects.speed * tier.power;
      recomputeMultiplicativeStats(target);
    },
  },
  {
    id: "magnet-array",
    kind: "technology",
    icon: "MAG",
    name: "Technologie aimant",
    description: "Etend la portee d'attraction des fragments d'XP.",
    tags: ["magnet"],
    effect(tier) {
      return `+${percent(balance.upgrade.effects.pickupRadius * tier.power)} portee de ramassage`;
    },
    apply(tier, target) {
      target.bonus.pickupRadiusPct += balance.upgrade.effects.pickupRadius * tier.power;
      recomputeMultiplicativeStats(target);
    },
  },
  {
    id: "kinetic-shield",
    kind: "technology",
    icon: "SHD",
    name: "Technologie defense",
    description: "Ajoute une couche regenerante autour de la coque.",
    tags: ["shield", "salvage"],
    effect(tier) {
      return `+${shieldGain(tier)} bouclier, +${shieldRegenGain(tier).toFixed(1)}/s regen`;
    },
    apply(tier, target) {
      const shield = shieldGain(tier);
      target.shieldMax += shield;
      target.shield = Math.min(target.shieldMax, target.shield + shield);
      target.shieldRegen += shieldRegenGain(tier);
      target.maxHp += maxHpGain(tier);
      target.hp = Math.min(target.maxHp, target.hp + Math.round(maxHpGain(tier) * 0.65));
    },
  },
  {
    id: "crit-array",
    kind: "technology",
    icon: "X2",
    name: "Technologie critique",
    description: "Calibre les tirs pour des coups doubles aleatoires.",
    tags: ["crit"],
    effect(tier) {
      return `+${percent(balance.upgrade.effects.critChance * tier.power)} chance critique (x2 degats)`;
    },
    apply(tier, target) {
      target.critChance = Math.min(
        balance.upgrade.caps.critChance,
        target.critChance + balance.upgrade.effects.critChance * tier.power,
      );
    },
  },
  {
    id: "heavy-caliber",
    kind: "technology",
    icon: "CAL",
    name: "Technologie calibre",
    description: "Elargit les projectiles pour mieux toucher.",
    tags: ["cannon"],
    effect(tier) {
      return `+${percent(balance.upgrade.effects.bulletRadius * tier.power)} taille de projectile`;
    },
    apply(tier, target) {
      target.bonus.bulletRadiusPct += balance.upgrade.effects.bulletRadius * tier.power;
      recomputeMultiplicativeStats(target);
    },
  },
  {
    id: "pulse-overdrive",
    kind: "weapon",
    weaponId: "pulse",
    icon: "PUL",
    name: "Pulse overdrive",
    description: "Level-up du Pulse Rifle: cadence et degats stables.",
    tags: ["cannon"],
    effect(tier) {
      return `+${percent(0.15 * tier.power)} cadence, +${percent(0.12 * tier.power)} degats`;
    },
    apply(tier, target) {
      target.bonus.fireRatePct += 0.15 * tier.power;
      target.bonus.damagePct += 0.12 * tier.power;
      recomputeMultiplicativeStats(target);
    },
  },
  {
    id: "scatter-loader",
    kind: "weapon",
    weaponId: "scatter",
    icon: "SCT",
    name: "Scatter loader",
    description: "Level-up du Scatter: densifie la salve et compense les impacts.",
    tags: ["cannon", "crit"],
    softCap: { stat: "projectileCount", max: balance.upgrade.caps.projectiles },
    effect(tier) {
      return `+${projectileGain(tier)} projectile${projectileGain(tier) > 1 ? "s" : ""}, +${percent(
        0.08 * tier.power,
      )} degats`;
    },
    apply(tier, target) {
      target.projectileCount = Math.min(
        balance.upgrade.caps.projectiles,
        target.projectileCount + projectileGain(tier),
      );
      target.bonus.damagePct += 0.08 * tier.power;
      recomputeMultiplicativeStats(target);
    },
  },
  {
    id: "lance-capacitor",
    kind: "weapon",
    weaponId: "lance",
    icon: "RLG",
    name: "Lance capacitor",
    description: "Level-up du Rail Lance: penetration et charge de tir.",
    tags: ["pierce", "cannon"],
    softCap: { stat: "pierce", max: balance.upgrade.caps.pierce },
    effect(tier) {
      return `+${pierceGain(tier)} penetration, +${percent(0.18 * tier.power)} degats`;
    },
    apply(tier, target) {
      target.pierce = Math.min(balance.upgrade.caps.pierce, target.pierce + pierceGain(tier));
      target.bonus.damagePct += 0.18 * tier.power;
      recomputeMultiplicativeStats(target);
    },
  },
  {
    id: "drone-uplink",
    kind: "weapon",
    weaponId: "drone",
    icon: "DRN",
    name: "Drone uplink",
    description: "Level-up du Drone Core: ajoute des tourelles autonomes.",
    tags: ["drone", "salvage"],
    softCap: { stat: "drones", max: balance.upgrade.caps.drones },
    effect(tier) {
      return `+${droneGain(tier)} drone${droneGain(tier) > 1 ? "s" : ""} orbital${droneGain(tier) > 1 ? "s" : ""}`;
    },
    apply(tier, target) {
      target.drones = Math.min(balance.upgrade.caps.drones, target.drones + droneGain(tier));
    },
  },
];

export function findUpgrade(id: string): Upgrade {
  const upgrade = upgradePool.find((item) => item.id === id);
  if (!upgrade) {
    throw new Error(`Unknown upgrade: ${id}`);
  }
  return upgrade;
}

export function availableUpgradesForPlayer(
  target: Player,
  selectedWeaponId: WeaponId = "pulse",
  unlockedTechnologyIds: ReadonlySet<string> = new Set(STARTER_TECHNOLOGY_IDS),
  source: Upgrade[] | undefined = upgradePool,
  unlockedTags: ReadonlySet<BuildTag> = new Set(STARTER_BUILD_TAGS),
): Upgrade[] {
  return (source ?? upgradePool).filter((upgrade) => {
    if (upgrade.kind === "technology" && !unlockedTechnologyIds.has(upgrade.id)) {
      return false;
    }
    if (upgrade.kind === "weapon" && upgrade.weaponId !== selectedWeaponId) {
      return false;
    }
    if (!hasUnlockedTags(upgrade.tags, unlockedTags)) {
      return false;
    }
    if (upgrade.softCap && target[upgrade.softCap.stat] >= upgrade.softCap.max) {
      return false;
    }
    return true;
  });
}

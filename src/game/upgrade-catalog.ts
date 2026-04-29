import {
  balance,
  droneGain,
  healGain,
  maxHpGain,
  pierceGain,
  projectileGain,
  recomputeMultiplicativeStats,
  shieldGain,
  shieldRegenGain,
} from "./balance";
import { STARTER_BUILD_TAGS, hasUnlockedTags } from "./shop-catalog";
import type { BuildTag, Player, Upgrade } from "../types";

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export const upgradePool: Upgrade[] = [
  {
    id: "twin-cannon",
    icon: "II",
    name: "Canon jumele",
    description: "Elargit les salves principales.",
    tags: ["cannon"],
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
    icon: "Hz",
    name: "Coeur plasma",
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
    icon: "DMG",
    name: "Ogive railgun",
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
    icon: "SPD",
    name: "Moteurs ioniques",
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
    id: "kinetic-shield",
    icon: "SHD",
    name: "Ecran cinetique",
    description: "Ajoute une couche regenerante autour de la coque.",
    tags: ["shield"],
    effect(tier) {
      return `+${shieldGain(tier)} bouclier, +${shieldRegenGain(tier).toFixed(1)}/s regen`;
    },
    apply(tier, target) {
      const shield = shieldGain(tier);
      target.shieldMax += shield;
      target.shield = Math.min(target.shieldMax, target.shield + shield);
      target.shieldRegen += shieldRegenGain(tier);
    },
  },
  {
    id: "repair-bay",
    icon: "HP",
    name: "Baie de reparation",
    description: "Renforce la coque et injecte des nanoreparations.",
    tags: ["salvage"],
    effect(tier) {
      return `+${maxHpGain(tier)} integrite max, +${healGain(tier)} soin`;
    },
    apply(tier, target) {
      target.maxHp += maxHpGain(tier);
      target.hp = Math.min(target.maxHp, target.hp + healGain(tier));
    },
  },
  {
    id: "orbital-drone",
    icon: "O",
    name: "Drone orbital",
    description: "Deploie une tourelle autonome en orbite proche.",
    tags: ["drone"],
    effect(tier) {
      return `+${droneGain(tier)} drone${droneGain(tier) > 1 ? "s" : ""} orbital${droneGain(tier) > 1 ? "s" : ""}`;
    },
    apply(tier, target) {
      target.drones = Math.min(balance.upgrade.caps.drones, target.drones + droneGain(tier));
    },
  },
  {
    id: "piercer",
    icon: ">>",
    name: "Munition perce-coque",
    description: "Permet aux tirs de traverser les blindages.",
    tags: ["pierce", "cannon"],
    effect(tier) {
      return `+${pierceGain(tier)} penetration, +${percent(
        balance.upgrade.effects.pierceDamage * tier.power,
      )} degats`;
    },
    apply(tier, target) {
      target.pierce = Math.min(balance.upgrade.caps.pierce, target.pierce + pierceGain(tier));
      target.bonus.damagePct += balance.upgrade.effects.pierceDamage * tier.power;
      recomputeMultiplicativeStats(target);
    },
  },
  {
    id: "crit-array",
    icon: "X2",
    name: "Reseau critique",
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
    id: "vampire-coil",
    icon: "VMP",
    name: "Bobine vampire",
    description: "Convertit chaque elimination en regeneration de coque.",
    tags: ["salvage"],
    effect(tier) {
      return `+${(balance.upgrade.effects.lifesteal * tier.power).toFixed(1)} PV par kill`;
    },
    apply(tier, target) {
      target.lifesteal += balance.upgrade.effects.lifesteal * tier.power;
    },
  },
  {
    id: "magnet-array",
    icon: "MAG",
    name: "Aimant orbital",
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
    id: "heavy-caliber",
    icon: "CAL",
    name: "Calibre lourd",
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
  source: Upgrade[] | undefined = upgradePool,
  unlockedTags: ReadonlySet<BuildTag> = new Set(STARTER_BUILD_TAGS),
): Upgrade[] {
  return (source ?? upgradePool).filter((upgrade) => {
    if (!hasUnlockedTags(upgrade.tags, unlockedTags)) {
      return false;
    }
    if (upgrade.id === "orbital-drone" && target.drones >= balance.upgrade.caps.drones) {
      return false;
    }
    if (
      upgrade.id === "twin-cannon" &&
      target.projectileCount >= balance.upgrade.caps.projectiles
    ) {
      return false;
    }
    if (upgrade.id === "piercer" && target.pierce >= balance.upgrade.caps.pierce) {
      return false;
    }
    return true;
  });
}

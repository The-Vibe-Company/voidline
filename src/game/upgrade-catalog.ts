import {
  balance,
  droneGain,
  pierceGain,
  projectileGain,
  shieldGain,
  shieldRegenGain,
} from "./balance";
import { runEffects, type EffectOp } from "./effect-dsl";
import { STARTER_BUILD_TAGS, STARTER_TECHNOLOGY_IDS, hasUnlockedTags } from "./shop-catalog";
import type { BuildTag, Player, Upgrade, WeaponId } from "../types";

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

type UpgradeSpec = Omit<Upgrade, "apply"> & { effects: readonly EffectOp[] };

function defineUpgrade(spec: UpgradeSpec): Upgrade {
  return {
    ...spec,
    apply: (tier, target) => runEffects(spec.effects, tier.power, target),
  };
}

export const upgradePool: Upgrade[] = [
  defineUpgrade({
    id: "twin-cannon",
    kind: "technology",
    icon: "II",
    name: "Technologie salves",
    description: "Elargit les tirs de l'arme active.",
    tags: ["cannon"],
    softCap: { stat: "projectileCount", max: balance.upgrade.caps.projectiles },
    effects: [
      {
        type: "addCapped",
        stat: "projectileCount",
        amount: 1,
        cap: "projectiles",
        gainCurve: "stepped",
      },
    ],
    effect(tier) {
      return `+${projectileGain(tier)} projectile${projectileGain(tier) > 1 ? "s" : ""} par salve`;
    },
  }),
  defineUpgrade({
    id: "plasma-core",
    kind: "technology",
    icon: "Hz",
    name: "Technologie cadence",
    description: "Accorde le reacteur au rythme des canons.",
    tags: ["cannon"],
    effects: [{ type: "addPct", stat: "fireRate", amount: balance.upgrade.effects.fireRate }],
    effect(tier) {
      return `+${percent(balance.upgrade.effects.fireRate * tier.power)} cadence`;
    },
  }),
  defineUpgrade({
    id: "rail-slug",
    kind: "technology",
    icon: "DMG",
    name: "Technologie degats",
    description: "Charge les impacts avec une masse cinetique.",
    tags: ["cannon", "salvage"],
    effects: [
      { type: "addPct", stat: "damage", amount: balance.upgrade.effects.damage },
      { type: "addPct", stat: "bulletSpeed", amount: balance.upgrade.effects.bulletSpeed },
    ],
    effect(tier) {
      return `+${percent(balance.upgrade.effects.damage * tier.power)} degats, +${percent(
        balance.upgrade.effects.bulletSpeed * tier.power,
      )} vitesse`;
    },
  }),
  defineUpgrade({
    id: "ion-engine",
    kind: "technology",
    icon: "SPD",
    name: "Technologie moteurs",
    description: "Rend les corrections de trajectoire plus nerveuses.",
    tags: ["salvage"],
    effects: [{ type: "addPct", stat: "speed", amount: balance.upgrade.effects.speed }],
    effect(tier) {
      return `+${percent(balance.upgrade.effects.speed * tier.power)} vitesse`;
    },
  }),
  defineUpgrade({
    id: "magnet-array",
    kind: "technology",
    icon: "MAG",
    name: "Technologie aimant",
    description: "Etend la portee d'attraction des fragments d'XP.",
    tags: ["magnet"],
    effects: [
      { type: "addPct", stat: "pickupRadius", amount: balance.upgrade.effects.pickupRadius },
    ],
    effect(tier) {
      return `+${percent(balance.upgrade.effects.pickupRadius * tier.power)} portee de ramassage`;
    },
  }),
  defineUpgrade({
    id: "kinetic-shield",
    kind: "technology",
    icon: "SHD",
    name: "Technologie defense",
    description: "Ajoute une couche regenerante autour de la coque.",
    tags: ["shield", "salvage"],
    effects: [
      {
        type: "shieldGrant",
        shield: balance.upgrade.effects.shield,
        regen: balance.upgrade.effects.shieldRegen,
        maxHpBonus: balance.upgrade.effects.maxHp,
        healRatio: 0.65,
      },
    ],
    effect(tier) {
      return `+${shieldGain(tier)} bouclier, +${shieldRegenGain(tier).toFixed(1)}/s regen`;
    },
  }),
  defineUpgrade({
    id: "crit-array",
    kind: "technology",
    icon: "X2",
    name: "Technologie critique",
    description: "Calibre les tirs pour des coups doubles aleatoires.",
    tags: ["crit"],
    effects: [
      {
        type: "addCappedPct",
        stat: "critChance",
        amount: balance.upgrade.effects.critChance,
        cap: "critChance",
      },
    ],
    effect(tier) {
      return `+${percent(balance.upgrade.effects.critChance * tier.power)} chance critique (x2 degats)`;
    },
  }),
  defineUpgrade({
    id: "heavy-caliber",
    kind: "technology",
    icon: "CAL",
    name: "Technologie calibre",
    description: "Elargit les projectiles pour mieux toucher.",
    tags: ["cannon"],
    effects: [
      { type: "addPct", stat: "bulletRadius", amount: balance.upgrade.effects.bulletRadius },
    ],
    effect(tier) {
      return `+${percent(balance.upgrade.effects.bulletRadius * tier.power)} taille de projectile`;
    },
  }),
  defineUpgrade({
    id: "pulse-overdrive",
    kind: "weapon",
    weaponId: "pulse",
    icon: "PUL",
    name: "Pulse overdrive",
    description: "Level-up du Pulse Rifle: cadence et degats stables.",
    tags: ["cannon"],
    effects: [
      { type: "addPct", stat: "fireRate", amount: 0.15 },
      { type: "addPct", stat: "damage", amount: 0.12 },
    ],
    effect(tier) {
      return `+${percent(0.15 * tier.power)} cadence, +${percent(0.12 * tier.power)} degats`;
    },
  }),
  defineUpgrade({
    id: "scatter-loader",
    kind: "weapon",
    weaponId: "scatter",
    icon: "SCT",
    name: "Scatter loader",
    description: "Level-up du Scatter: densifie la salve et compense les impacts.",
    tags: ["cannon", "crit"],
    softCap: { stat: "projectileCount", max: balance.upgrade.caps.projectiles },
    effects: [
      {
        type: "addCapped",
        stat: "projectileCount",
        amount: 1,
        cap: "projectiles",
        gainCurve: "stepped",
      },
      { type: "addPct", stat: "damage", amount: 0.08 },
    ],
    effect(tier) {
      return `+${projectileGain(tier)} projectile${projectileGain(tier) > 1 ? "s" : ""}, +${percent(
        0.08 * tier.power,
      )} degats`;
    },
  }),
  defineUpgrade({
    id: "lance-capacitor",
    kind: "weapon",
    weaponId: "lance",
    icon: "RLG",
    name: "Lance capacitor",
    description: "Level-up du Rail Lance: penetration et charge de tir.",
    tags: ["pierce", "cannon"],
    softCap: { stat: "pierce", max: balance.upgrade.caps.pierce },
    effects: [
      { type: "addCapped", stat: "pierce", amount: 1, cap: "pierce", gainCurve: "stepped" },
      { type: "addPct", stat: "damage", amount: 0.18 },
    ],
    effect(tier) {
      return `+${pierceGain(tier)} penetration, +${percent(0.18 * tier.power)} degats`;
    },
  }),
  defineUpgrade({
    id: "drone-uplink",
    kind: "weapon",
    weaponId: "drone",
    icon: "DRN",
    name: "Drone uplink",
    description: "Level-up du Drone Core: ajoute des tourelles autonomes.",
    tags: ["drone", "salvage"],
    softCap: { stat: "drones", max: balance.upgrade.caps.drones },
    effects: [
      { type: "addCapped", stat: "drones", amount: 1, cap: "drones", gainCurve: "droneStepped" },
    ],
    effect(tier) {
      return `+${droneGain(tier)} drone${droneGain(tier) > 1 ? "s" : ""} orbital${droneGain(tier) > 1 ? "s" : ""}`;
    },
  }),
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

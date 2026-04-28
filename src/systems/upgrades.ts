import { ownedUpgrades, player, state } from "../state";
import { pulseText } from "../entities/particles";
import { percent, removeById, shuffle } from "../utils";
import type { Upgrade, UpgradeChoice, UpgradeTier } from "../types";

export const upgradeTiers: UpgradeTier[] = [
  {
    id: "standard",
    short: "T1",
    name: "Standard",
    power: 1,
    color: "#39d9ff",
    glow: "rgba(57, 217, 255, 0.22)",
  },
  {
    id: "rare",
    short: "T2",
    name: "Rare",
    power: 1.45,
    color: "#72ffb1",
    glow: "rgba(114, 255, 177, 0.25)",
  },
  {
    id: "prototype",
    short: "T3",
    name: "Prototype",
    power: 2.05,
    color: "#ffbf47",
    glow: "rgba(255, 191, 71, 0.28)",
  },
  {
    id: "singularity",
    short: "T4",
    name: "Singularity",
    power: 2.8,
    color: "#ff5a69",
    glow: "rgba(255, 90, 105, 0.3)",
  },
];

function steppedGain(tier: UpgradeTier): number {
  if (tier.power >= 2.75) return 3;
  if (tier.power >= 1.4) return 2;
  return 1;
}

function projectileGain(tier: UpgradeTier): number {
  return steppedGain(tier);
}

function droneGain(tier: UpgradeTier): number {
  return tier.power >= 2 ? 2 : 1;
}

function pierceGain(tier: UpgradeTier): number {
  return steppedGain(tier);
}

export const upgradePool: Upgrade[] = [
  {
    id: "twin-cannon",
    icon: "II",
    name: "Canon jumele",
    description: "Elargit les salves principales.",
    effect(tier) {
      return `+${projectileGain(tier)} projectile${projectileGain(tier) > 1 ? "s" : ""} par salve`;
    },
    apply(tier) {
      player.projectileCount += projectileGain(tier);
    },
  },
  {
    id: "plasma-core",
    icon: "Hz",
    name: "Coeur plasma",
    description: "Accorde le reacteur au rythme des canons.",
    effect(tier) {
      return `+${percent(0.22 * tier.power)} cadence`;
    },
    apply(tier) {
      player.fireRate *= 1 + 0.22 * tier.power;
    },
  },
  {
    id: "rail-slug",
    icon: "DMG",
    name: "Ogive railgun",
    description: "Charge les impacts avec une masse cinetique.",
    effect(tier) {
      return `+${percent(0.26 * tier.power)} degats, +${percent(0.055 * tier.power)} vitesse`;
    },
    apply(tier) {
      player.damage *= 1 + 0.26 * tier.power;
      player.bulletSpeed *= 1 + 0.055 * tier.power;
    },
  },
  {
    id: "ion-engine",
    icon: "SPD",
    name: "Moteurs ioniques",
    description: "Rend les corrections de trajectoire plus nerveuses.",
    effect(tier) {
      return `+${percent(0.13 * tier.power)} vitesse`;
    },
    apply(tier) {
      player.speed *= 1 + 0.13 * tier.power;
    },
  },
  {
    id: "kinetic-shield",
    icon: "SHD",
    name: "Ecran cinetique",
    description: "Ajoute une couche regenerante autour de la coque.",
    effect(tier) {
      return `+${Math.round(24 * tier.power)} bouclier, +${(2.4 * tier.power).toFixed(1)}/s regen`;
    },
    apply(tier) {
      const shieldGain = Math.round(24 * tier.power);
      player.shieldMax += shieldGain;
      player.shield = Math.min(player.shieldMax, player.shield + shieldGain);
      player.shieldRegen += 2.4 * tier.power;
    },
  },
  {
    id: "repair-bay",
    icon: "HP",
    name: "Baie de reparation",
    description: "Renforce la coque et injecte des nanoreparations.",
    effect(tier) {
      return `+${Math.round(20 * tier.power)} integrite max, +${Math.round(42 * tier.power)} soin`;
    },
    apply(tier) {
      player.maxHp += Math.round(20 * tier.power);
      player.hp = Math.min(player.maxHp, player.hp + Math.round(42 * tier.power));
    },
  },
  {
    id: "orbital-drone",
    icon: "O",
    name: "Drone orbital",
    description: "Deploie une tourelle autonome en orbite proche.",
    effect(tier) {
      return `+${droneGain(tier)} drone${droneGain(tier) > 1 ? "s" : ""} orbital${droneGain(tier) > 1 ? "s" : ""}`;
    },
    apply(tier) {
      player.drones += droneGain(tier);
    },
  },
  {
    id: "piercer",
    icon: ">>",
    name: "Munition perce-coque",
    description: "Permet aux tirs de traverser les blindages.",
    effect(tier) {
      return `+${pierceGain(tier)} penetration, +${percent(0.07 * tier.power)} degats`;
    },
    apply(tier) {
      player.pierce += pierceGain(tier);
      player.damage *= 1 + 0.07 * tier.power;
    },
  },
];

export function rollUpgradeTier(wave: number): UpgradeTier {
  const weights = [
    { tier: upgradeTiers[0]!, weight: Math.max(42, 100 - wave * 5.5) },
    { tier: upgradeTiers[1]!, weight: 18 + wave * 2.8 },
    { tier: upgradeTiers[2]!, weight: wave >= 2 ? 3 + wave * 1.45 : 1 },
    { tier: upgradeTiers[3]!, weight: wave >= 5 ? wave * 0.75 : 0 },
  ];
  const total = weights.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * total;

  for (const item of weights) {
    roll -= item.weight;
    if (roll <= 0) return item.tier;
  }

  return upgradeTiers[0]!;
}

export function pickUpgrades(count: number): UpgradeChoice[] {
  const weighted = [...upgradePool];
  if (player.drones >= 5) {
    removeById(weighted, "orbital-drone");
  }
  if (player.projectileCount >= 8) {
    removeById(weighted, "twin-cannon");
  }
  if (player.pierce >= 5) {
    removeById(weighted, "piercer");
  }

  shuffle(weighted);
  return weighted.slice(0, count).map((upgrade) => ({
    upgrade,
    tier: rollUpgradeTier(state.wave),
  }));
}

export function applyUpgrade(choice: UpgradeChoice): void {
  const { upgrade, tier } = choice;
  upgrade.apply(tier);

  const key = `${upgrade.id}:${tier.id}`;
  const owned = ownedUpgrades.get(key) ?? { upgrade, tier, count: 0 };
  owned.count += 1;
  ownedUpgrades.set(key, owned);

  pulseText(player.x, player.y - 42, `${upgrade.name} ${tier.short}`, tier.color);
  state.pendingUpgrades = Math.max(0, state.pendingUpgrades - 1);
}

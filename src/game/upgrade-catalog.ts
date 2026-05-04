import type { Player, Upgrade } from "../types";

const ICON_BASE = "/icons/upgrades";

export const upgradeCatalog: readonly Upgrade[] = [
  {
    id: "damage-up",
    name: "Calibre",
    icon: `${ICON_BASE}/damage-up.png`,
    description: "+8 dégâts",
    cost: 25,
    effects: [{ stat: "damage", amount: 8 }],
  },
  {
    id: "fire-rate-up",
    name: "Cadence",
    icon: `${ICON_BASE}/fire-rate-up.png`,
    description: "+0.5 tir/s",
    cost: 30,
    effects: [{ stat: "fireRate", amount: 0.5 }],
  },
  {
    id: "speed-up",
    name: "Boost",
    icon: `${ICON_BASE}/speed-up.png`,
    description: "+25 vitesse",
    cost: 25,
    effects: [{ stat: "speed", amount: 25 }],
  },
  {
    id: "max-hp-up",
    name: "Blindage",
    icon: `${ICON_BASE}/max-hp-up.png`,
    description: "+20 PV",
    cost: 35,
    effects: [{ stat: "maxHp", amount: 20 }],
  },
  {
    id: "projectile-up",
    name: "Salve",
    icon: `${ICON_BASE}/projectile-up.png`,
    description: "+1 projectile, −3 dégâts",
    cost: 90,
    effects: [
      { stat: "projectileCount", amount: 1 },
      { stat: "damage", amount: -3 },
    ],
  },
  {
    id: "pierce-up",
    name: "Perforation",
    icon: `${ICON_BASE}/pierce-up.png`,
    description: "+1 pénétration, −2 dégâts",
    cost: 60,
    effects: [
      { stat: "pierce", amount: 1 },
      { stat: "damage", amount: -2 },
    ],
  },
  {
    id: "bullet-radius-up",
    name: "Ogive",
    icon: `${ICON_BASE}/bullet-radius-up.png`,
    description: "+30% taille balle",
    cost: 40,
    effects: [{ stat: "bulletRadius", amount: 0.3 }],
  },
  {
    id: "crit-up",
    name: "Critique",
    icon: `${ICON_BASE}/crit-up.png`,
    description: "+10% crit (x2)",
    cost: 45,
    effects: [{ stat: "critChance", amount: 0.1 }],
  },
  {
    id: "bullet-speed-up",
    name: "Vélocité",
    icon: `${ICON_BASE}/bullet-speed-up.png`,
    description: "+12% vitesse balle",
    cost: 20,
    effects: [{ stat: "bulletSpeed", amount: 0.12 }],
  },
  {
    id: "range-up",
    name: "Portée",
    icon: `${ICON_BASE}/range-up.png`,
    description: "+60 portée",
    cost: 25,
    effects: [{ stat: "range", amount: 60 }],
  },
];

export function applyUpgradeToPlayer(upgrade: Upgrade, target: Player): void {
  for (const effect of upgrade.effects) {
    switch (effect.stat) {
      case "damage":
        target.damage = Math.max(1, target.damage + effect.amount);
        break;
      case "fireRate":
        target.fireRate += effect.amount;
        break;
      case "speed":
        target.speed += effect.amount;
        break;
      case "maxHp":
        target.maxHp += effect.amount;
        target.hp = Math.min(target.maxHp, target.hp + effect.amount);
        break;
      case "projectileCount":
        target.projectileCount += effect.amount;
        break;
      case "pierce":
        target.pierce += effect.amount;
        break;
      case "bulletRadius":
        target.bulletRadius *= 1 + effect.amount;
        break;
      case "critChance":
        target.critChance = Math.min(0.95, target.critChance + effect.amount);
        break;
      case "bulletSpeed":
        target.bulletSpeed *= 1 + effect.amount;
        break;
      case "range":
        target.range += effect.amount;
        break;
    }
  }
}

export function findUpgrade(id: string): Upgrade {
  const upgrade = upgradeCatalog.find((entry) => entry.id === id);
  if (!upgrade) throw new Error(`Unknown upgrade: ${id}`);
  return upgrade;
}

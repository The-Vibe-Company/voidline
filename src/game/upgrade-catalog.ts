import type { Player, Upgrade } from "../types";

export const upgradeCatalog: readonly Upgrade[] = [
  {
    id: "damage-up",
    name: "Calibre +",
    icon: "DMG",
    description: "+8 dégâts par tir.",
    cost: 25,
    effects: [{ stat: "damage", amount: 8 }],
  },
  {
    id: "fire-rate-up",
    name: "Cadence +",
    icon: "Hz",
    description: "+0.5 tir/s.",
    cost: 30,
    effects: [{ stat: "fireRate", amount: 0.5 }],
  },
  {
    id: "speed-up",
    name: "Moteur +",
    icon: "SPD",
    description: "+25 vitesse de déplacement.",
    cost: 25,
    effects: [{ stat: "speed", amount: 25 }],
  },
  {
    id: "max-hp-up",
    name: "Coque +",
    icon: "HP",
    description: "+20 PV max.",
    cost: 35,
    effects: [{ stat: "maxHp", amount: 20 }],
  },
  {
    id: "projectile-up",
    name: "Salve +",
    icon: "II",
    description: "+1 projectile par tir.",
    cost: 90,
    effects: [{ stat: "projectileCount", amount: 1 }],
  },
  {
    id: "pierce-up",
    name: "Pénétration +",
    icon: "PRC",
    description: "+1 pénétration par projectile.",
    cost: 60,
    effects: [{ stat: "pierce", amount: 1 }],
  },
  {
    id: "bullet-radius-up",
    name: "Calibre lourd",
    icon: "CAL",
    description: "+30% taille de projectile.",
    cost: 40,
    effects: [{ stat: "bulletRadius", amount: 0.3 }],
  },
  {
    id: "crit-up",
    name: "Critique +",
    icon: "X2",
    description: "+10% chance critique (x2 dégâts).",
    cost: 45,
    effects: [{ stat: "critChance", amount: 0.1 }],
  },
  {
    id: "bullet-speed-up",
    name: "Vélocité +",
    icon: "VEL",
    description: "+12% vitesse de projectile.",
    cost: 20,
    effects: [{ stat: "bulletSpeed", amount: 0.12 }],
  },
  {
    id: "range-up",
    name: "Portée +",
    icon: "RNG",
    description: "+60 portée d'auto-tir.",
    cost: 25,
    effects: [{ stat: "range", amount: 60 }],
  },
];

export function applyUpgradeToPlayer(upgrade: Upgrade, target: Player): void {
  for (const effect of upgrade.effects) {
    switch (effect.stat) {
      case "damage":
        target.damage += effect.amount;
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

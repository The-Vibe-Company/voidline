import type { Player, Upgrade, UpgradeStat } from "../types";

const ICON_BASE = "/icons/upgrades";

export const upgradeCatalog: readonly Upgrade[] = [
  {
    id: "damage-up",
    name: "Calibre",
    icon: `${ICON_BASE}/damage-up.png`,
    description: "+15% dégâts",
    cost: 30,
    effects: [{ stat: "damageMul", amount: 0.15 }],
  },
  {
    id: "fire-rate-up",
    name: "Cadence",
    icon: `${ICON_BASE}/fire-rate-up.png`,
    description: "+15% cadence",
    cost: 30,
    effects: [{ stat: "fireRateMul", amount: 0.15 }],
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
        target.damage += effect.amount;
        break;
      case "damageMul":
        target.damageMul += effect.amount;
        break;
      case "fireRate":
        target.fireRate += effect.amount;
        break;
      case "fireRateMul":
        target.fireRateMul += effect.amount;
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

const STAT_LABELS: Record<UpgradeStat, string> = {
  damage: "Dégâts",
  damageMul: "Dégâts",
  fireRate: "Cadence",
  fireRateMul: "Cadence",
  speed: "Vitesse",
  maxHp: "Coque",
  projectileCount: "Salve",
  pierce: "Pierce",
  bulletRadius: "Calibre",
  critChance: "Crit",
  bulletSpeed: "Vélocité",
  range: "Portée",
};

export interface UpgradePreviewEntry {
  stat: UpgradeStat;
  label: string;
  before: number;
  after: number;
  isMalus: boolean;
}

function clonePlayerStats(player: Player): Player {
  return { ...player };
}

export function statValue(player: Player, stat: UpgradeStat): number {
  switch (stat) {
    case "damage":
      return player.damage;
    case "damageMul":
      return player.damageMul;
    case "fireRate":
      return player.fireRate;
    case "fireRateMul":
      return player.fireRateMul;
    case "speed":
      return player.speed;
    case "maxHp":
      return player.maxHp;
    case "projectileCount":
      return player.projectileCount;
    case "pierce":
      return player.pierce;
    case "bulletRadius":
      return player.bulletRadius;
    case "critChance":
      return player.critChance;
    case "bulletSpeed":
      return player.bulletSpeed;
    case "range":
      return player.range;
  }
}

export function previewUpgradeOnPlayer(
  upgrade: Upgrade,
  player: Player,
): UpgradePreviewEntry[] {
  const clone = clonePlayerStats(player);
  const entries: UpgradePreviewEntry[] = [];
  for (const effect of upgrade.effects) {
    const before = statValue(clone, effect.stat);
    applyUpgradeToPlayer({ ...upgrade, effects: [effect] }, clone);
    const after = statValue(clone, effect.stat);
    entries.push({
      stat: effect.stat,
      label: STAT_LABELS[effect.stat],
      before,
      after,
      isMalus: effect.amount < 0,
    });
  }
  return entries;
}

export function statLabel(stat: UpgradeStat): string {
  return STAT_LABELS[stat];
}

import type { AccountProgress, MetaUpgrade, MetaUpgradeId, Player } from "../types";

const META_ICON_BASE = "/icons/upgrades";

export const metaUpgradeCatalog: readonly MetaUpgrade[] = [
  {
    id: "meta:max-hp",
    name: "Coque",
    icon: `${META_ICON_BASE}/meta-max-hp.png`,
    description: "+10 PV / niv.",
    maxLevel: 5,
    costAt: (level) => 30 + level * 25,
  },
  {
    id: "meta:damage",
    name: "Munitions",
    icon: `${META_ICON_BASE}/meta-damage.png`,
    description: "+3 dégâts / niv.",
    maxLevel: 5,
    costAt: (level) => 30 + level * 30,
  },
  {
    id: "meta:fire-rate",
    name: "Cadence",
    icon: `${META_ICON_BASE}/meta-fire-rate.png`,
    description: "+0.2 tir/s / niv.",
    maxLevel: 5,
    costAt: (level) => 30 + level * 35,
  },
  {
    id: "meta:speed",
    name: "Moteur",
    icon: `${META_ICON_BASE}/meta-speed.png`,
    description: "+10 vitesse / niv.",
    maxLevel: 5,
    costAt: (level) => 25 + level * 25,
  },
  {
    id: "meta:crystal-yield",
    name: "Récolte",
    icon: `${META_ICON_BASE}/meta-crystal-yield.png`,
    description: "+5% cristaux / niv.",
    maxLevel: 5,
    costAt: (level) => 40 + level * 40,
  },
];

export function findMetaUpgrade(id: MetaUpgradeId): MetaUpgrade {
  const upgrade = metaUpgradeCatalog.find((entry) => entry.id === id);
  if (!upgrade) throw new Error(`Unknown meta upgrade: ${id}`);
  return upgrade;
}

export function metaUpgradeLevel(progress: AccountProgress, id: MetaUpgradeId): number {
  return progress.upgradeLevels[id] ?? 0;
}

export function applyMetaUpgradesToPlayer(progress: AccountProgress, target: Player): void {
  const hpLevel = metaUpgradeLevel(progress, "meta:max-hp");
  if (hpLevel > 0) {
    const bonus = hpLevel * 10;
    target.maxHp += bonus;
    target.hp = target.maxHp;
  }
  const damageLevel = metaUpgradeLevel(progress, "meta:damage");
  if (damageLevel > 0) {
    target.damage += damageLevel * 3;
  }
  const fireRateLevel = metaUpgradeLevel(progress, "meta:fire-rate");
  if (fireRateLevel > 0) {
    target.fireRate += fireRateLevel * 0.2;
  }
  const speedLevel = metaUpgradeLevel(progress, "meta:speed");
  if (speedLevel > 0) {
    target.speed += speedLevel * 10;
  }
}

export function crystalYieldMultiplier(progress: AccountProgress): number {
  const level = metaUpgradeLevel(progress, "meta:crystal-yield");
  return 1 + level * 0.05;
}

export function canPurchaseLevel(
  progress: AccountProgress,
  id: MetaUpgradeId,
): { ok: true; cost: number } | { ok: false; reason: "max-level" | "crystals" } {
  const upgrade = findMetaUpgrade(id);
  const level = metaUpgradeLevel(progress, id);
  if (level >= upgrade.maxLevel) return { ok: false, reason: "max-level" };
  const cost = upgrade.costAt(level);
  if (progress.crystals < cost) return { ok: false, reason: "crystals" };
  return { ok: true, cost };
}

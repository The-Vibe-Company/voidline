import {
  balance,
  enemyTypes,
  experienceDropTotal,
  experienceOrbRadius,
  latePressure,
  scaledEnemyStats,
  spawnGap,
  spawnPackChance,
  upgradeTierWeights,
  type RarityWeightProfile,
  pressureTarget,
  xpToNextLevel,
} from "./balance";
import type { BossDef, EnemyKind, EnemyType, TierId, UpgradeTier } from "../types";

const enemyTypeByKind = new Map<EnemyKind, EnemyType>(
  enemyTypes.map((type) => [type.id, type]),
);

function getEnemyType(kind: EnemyKind): EnemyType {
  const type = enemyTypeByKind.get(kind);
  if (!type) throw new Error(`Unknown enemy kind: ${kind}`);
  return type;
}

export function enemyHpAt(pressure: number, kind: EnemyKind): number {
  return scaledEnemyStats(getEnemyType(kind), pressure).hp;
}

export function enemyDamageAt(pressure: number, kind: EnemyKind): number {
  return scaledEnemyStats(getEnemyType(kind), pressure).damage;
}

export function enemySpeedAt(pressure: number, kind: EnemyKind): number {
  return scaledEnemyStats(getEnemyType(kind), pressure).speed;
}

export type BossRole = "miniBoss" | "boss";

function bossTuning(role: BossRole) {
  return role === "boss" ? balance.bosses.boss : balance.bosses.miniBoss;
}

export function bossHpAt(pressure: number, role: BossRole, kind: EnemyKind = "scout"): number {
  return enemyHpAt(pressure, kind) * bossTuning(role).hpMultiplier;
}

export function bossDamageAt(pressure: number, role: BossRole, kind: EnemyKind = "scout"): number {
  return enemyDamageAt(pressure, kind) * bossTuning(role).damageMultiplier;
}

export function bossSpeedAt(pressure: number, role: BossRole, kind: EnemyKind = "scout"): number {
  return enemySpeedAt(pressure, kind) * bossTuning(role).speedMultiplier;
}

export function bossStatsAt(def: BossDef, stage: number): BossDef["stats"] {
  const stageOffset = Math.max(0, Math.floor(stage) - 1);
  const cfg = balance.bosses.stageScaling;
  if (stageOffset === 0 || (cfg.hpPerStage === 0 && cfg.damagePerStage === 0 && cfg.speedPerStage === 0)) {
    return def.stats;
  }
  const scaledOffset = bossStageScaleOffset(stageOffset);
  return {
    ...def.stats,
    hpMultiplier: def.stats.hpMultiplier * (1 + cfg.hpPerStage * scaledOffset),
    damageMultiplier: def.stats.damageMultiplier * (1 + cfg.damagePerStage * scaledOffset),
    speedMultiplier: def.stats.speedMultiplier * (1 + cfg.speedPerStage * scaledOffset),
  };
}

function bossStageScaleOffset(stageOffset: number): number {
  if (stageOffset <= 1) return stageOffset;
  const cfg = balance.bosses.stageScaling;
  return cfg.postStage2HpOffsetBase + (stageOffset - 2) * cfg.postStage2HpOffsetPerStage;
}

export interface WeightedTier {
  tier: UpgradeTier;
  weight: number;
}

export function rarityWeightsAt(
  pressure: number,
  rarity: number | RarityWeightProfile = 0,
): WeightedTier[] {
  return upgradeTierWeights(pressure, rarity);
}

export type RarityShare = Record<TierId, number>;

export function rarityProbabilitiesAt(
  pressure: number,
  rarity: number | RarityWeightProfile = 0,
): RarityShare {
  const weights = rarityWeightsAt(pressure, rarity);
  const total = weights.reduce((sum, item) => sum + Math.max(0, item.weight), 0);
  const out: Partial<RarityShare> = {};
  for (const item of weights) {
    out[item.tier.id] = total > 0 ? Math.max(0, item.weight) / total : 0;
  }
  return {
    standard: out.standard ?? 0,
    rare: out.rare ?? 0,
    prototype: out.prototype ?? 0,
    singularity: out.singularity ?? 0,
  };
}

export interface UpgradeUnlockState {
  rare: boolean;
  prototype: boolean;
  singularity: boolean;
}

export function upgradeUnlocksAt(pressure: number): UpgradeUnlockState {
  const gates = balance.upgrade.gates;
  return {
    rare: pressure >= gates.rare.minPressure,
    prototype: pressure >= gates.prototype.minPressure,
    singularity: pressure >= gates.singularity.minPressure,
  };
}

export function latePressureAt(pressure: number): number {
  return latePressure(pressure);
}

export function pressureTargetAt(pressure: number): number {
  return pressureTarget(pressure);
}

export function spawnGapAt(pressure: number): number {
  return spawnGap(pressure);
}

export function spawnPackChanceAt(pressure: number): number {
  return spawnPackChance(pressure);
}

export function xpToNextLevelAt(level: number): number {
  return xpToNextLevel(level);
}

export function experienceDropAt(enemyScore: number, pressure: number): number {
  return experienceDropTotal(enemyScore, pressure);
}

export function experienceOrbRadiusAt(value: number): number {
  return experienceOrbRadius(value);
}

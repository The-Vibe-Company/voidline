import {
  balance,
  enemyTypes,
  experienceDropTotal,
  experienceOrbRadius,
  lateWavePressure,
  scaledEnemyStats,
  spawnGap,
  spawnPackChance,
  upgradeTierWeights,
  waveTarget,
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

export function enemyHpAt(wave: number, kind: EnemyKind): number {
  return scaledEnemyStats(getEnemyType(kind), wave).hp;
}

export function enemyDamageAt(wave: number, kind: EnemyKind): number {
  return scaledEnemyStats(getEnemyType(kind), wave).damage;
}

export function enemySpeedAt(wave: number, kind: EnemyKind): number {
  return scaledEnemyStats(getEnemyType(kind), wave).speed;
}

export type BossRole = "miniBoss" | "boss";

function bossTuning(role: BossRole) {
  return role === "boss" ? balance.bosses.boss : balance.bosses.miniBoss;
}

export function bossHpAt(wave: number, role: BossRole, kind: EnemyKind = "scout"): number {
  return enemyHpAt(wave, kind) * bossTuning(role).hpMultiplier;
}

export function bossDamageAt(wave: number, role: BossRole, kind: EnemyKind = "scout"): number {
  return enemyDamageAt(wave, kind) * bossTuning(role).damageMultiplier;
}

export function bossSpeedAt(wave: number, role: BossRole, kind: EnemyKind = "scout"): number {
  return enemySpeedAt(wave, kind) * bossTuning(role).speedMultiplier;
}

export function bossStatsAt(def: BossDef, stage: number): BossDef["stats"] {
  const stageOffset = Math.max(0, Math.floor(stage) - 1);
  const cfg = balance.bosses.stageScaling;
  if (stageOffset === 0 || (cfg.hpPerStage === 0 && cfg.damagePerStage === 0 && cfg.speedPerStage === 0)) {
    return def.stats;
  }
  return {
    ...def.stats,
    hpMultiplier: def.stats.hpMultiplier * (1 + cfg.hpPerStage * stageOffset),
    damageMultiplier: def.stats.damageMultiplier * (1 + cfg.damagePerStage * stageOffset),
    speedMultiplier: def.stats.speedMultiplier * (1 + cfg.speedPerStage * stageOffset),
  };
}

export interface WeightedTier {
  tier: UpgradeTier;
  weight: number;
}

export function rarityWeightsAt(wave: number, rarityRank = 0): WeightedTier[] {
  return upgradeTierWeights(wave, rarityRank);
}

export type RarityShare = Record<TierId, number>;

export function rarityProbabilitiesAt(wave: number, rarityRank = 0): RarityShare {
  const weights = rarityWeightsAt(wave, rarityRank);
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

export function upgradeUnlocksAt(wave: number): UpgradeUnlockState {
  const gates = balance.upgrade.gates;
  return {
    rare: wave >= gates.rare.minWave,
    prototype: wave >= gates.prototype.minWave,
    singularity: wave >= gates.singularity.minWave,
  };
}

export function lateWavePressureAt(wave: number): number {
  return lateWavePressure(wave);
}

export function waveTargetAt(wave: number): number {
  return waveTarget(wave);
}

export function spawnGapAt(wave: number): number {
  return spawnGap(wave);
}

export function spawnPackChanceAt(wave: number): number {
  return spawnPackChance(wave);
}

export function xpToNextLevelAt(level: number): number {
  return xpToNextLevel(level);
}

export function experienceDropAt(enemyScore: number, wave: number): number {
  return experienceDropTotal(enemyScore, wave);
}

export function experienceOrbRadiusAt(value: number): number {
  return experienceOrbRadius(value);
}

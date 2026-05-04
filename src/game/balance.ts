import type { EnemyType } from "../types";

export const arena = {
  width: 1600,
  height: 1100,
};

export const playerBase = {
  hp: 100,
  speed: 145,
  damage: 24,
  fireRate: 1.6,
  bulletSpeed: 380,
  bulletLife: 0.65,
  range: 240,
  projectileCount: 1,
  pierce: 0,
  bulletRadius: 1,
  critChance: 0,
};

export const xp = {
  carryRatio: 0.25,
  pickupRadius: 32,
  pullSpeed: 320,
  shardCount: { scout: 1, hunter: 2, brute: 3 } satisfies Record<string, number>,
  orbValuePerEnemy: { scout: 4, hunter: 6, brute: 12 } satisfies Record<string, number>,
};

export const wave = {
  baseDurationSeconds: 45,
  durationGrowthSeconds: 3,
  durationMaxSeconds: 90,
  bossEvery: 5,
  spawnBudgetBase: 25,
  spawnBudgetGrowth: 8,
  hpScalePerWave: 0.18,
  speedScalePerWave: 0.025,
  damageScalePerWave: 0.08,
};

export const boss = {
  hpMultiplier: 14,
  speedMultiplier: 0.6,
  damageMultiplier: 1.6,
  radiusMultiplier: 2.2,
  scoreMultiplier: 8,
};

export const shop = {
  offers: 4,
  rerollBaseCost: 10,
  rerollGrowth: 5,
};

export const SPAWN_TELEGRAPH_DURATION = 0.7;
export const SPAWN_TELEGRAPH_BOSS_DURATION = 1.2;
export const SPAWN_MIN_DISTANCE_FROM_PLAYER = 220;
export const SPAWN_ARENA_MARGIN = 60;

export const enemyTypes: readonly EnemyType[] = [
  {
    id: "scout",
    score: 30,
    radius: 9,
    hp: 32,
    speed: 80,
    damage: 12,
    color: "#ff5a69",
    accent: "#ffd0d5",
    sides: 3,
  },
  {
    id: "hunter",
    score: 55,
    radius: 12,
    hp: 60,
    speed: 70,
    damage: 18,
    color: "#ffbf47",
    accent: "#fff0b8",
    sides: 4,
  },
  {
    id: "brute",
    score: 110,
    radius: 17,
    hp: 140,
    speed: 45,
    damage: 24,
    color: "#b973ff",
    accent: "#ead4ff",
    sides: 6,
  },
];

export function findEnemyType(id: "scout" | "hunter" | "brute"): EnemyType {
  const found = enemyTypes.find((type) => type.id === id);
  if (!found) throw new Error(`Unknown enemy type: ${id}`);
  return found;
}

export function waveDuration(waveNumber: number): number {
  return Math.min(
    wave.durationMaxSeconds,
    wave.baseDurationSeconds + (waveNumber - 1) * wave.durationGrowthSeconds,
  );
}

export function waveSpawnBudget(waveNumber: number): number {
  return wave.spawnBudgetBase + (waveNumber - 1) * wave.spawnBudgetGrowth;
}

export function isBossWave(waveNumber: number): boolean {
  return waveNumber > 0 && waveNumber % wave.bossEvery === 0;
}

export function enemyHpScale(waveNumber: number): number {
  return 1 + (waveNumber - 1) * wave.hpScalePerWave;
}

export function enemySpeedScale(waveNumber: number): number {
  return 1 + Math.min(0.6, (waveNumber - 1) * wave.speedScalePerWave);
}

export function enemyDamageScale(waveNumber: number): number {
  return 1 + Math.min(1.5, (waveNumber - 1) * wave.damageScalePerWave);
}

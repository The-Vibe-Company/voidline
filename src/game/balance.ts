import type { EnemyKind, EnemyType } from "../types";

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
  shardCount: {
    scout: 1,
    hunter: 2,
    brute: 3,
    sentinel: 2,
    stinger: 2,
    splitter: 3,
  } satisfies Record<EnemyKind, number>,
  orbValuePerEnemy: {
    scout: 4,
    hunter: 6,
    brute: 12,
    sentinel: 7,
    stinger: 7,
    splitter: 10,
  } satisfies Record<EnemyKind, number>,
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

export const STINGER_DASH_SPEED_MULT = 4.5;
export const STINGER_DASH_DURATION = 0.35;
export const STINGER_RECOVER_PAUSE = 0.55;
export const SPLITTER_CHILD_COUNT = 2;
export const SPLITTER_CHILD_HP_RATIO = 0.6;

export const BOSS_VOLLEY_INTERVAL = 3.5;
export const BOSS_VOLLEY_COUNT = 3;
export const BOSS_VOLLEY_TELEGRAPH = 0.8;
export const BOSS_VOLLEY_SPREAD = 0.45;
export const BOSS_PROJECTILE_SPEED = 240;
export const BOSS_PROJECTILE_LIFE = 3.5;
export const BOSS_PROJECTILE_DAMAGE_RATIO = 0.55;

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
    behavior: "seeker",
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
    behavior: "seeker",
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
    behavior: "seeker",
  },
  {
    id: "sentinel",
    score: 70,
    radius: 11,
    hp: 44,
    speed: 55,
    damage: 14,
    color: "#39d9ff",
    accent: "#d9f6ff",
    sides: 5,
    behavior: "ranged",
    attackCooldown: 2.4,
    attackRange: 280,
    attackWindup: 0.6,
    projectileSpeed: 220,
    projectileDamage: 12,
    projectileLife: 2.4,
    projectileColor: "#39d9ff",
  },
  {
    id: "stinger",
    score: 65,
    radius: 10,
    hp: 38,
    speed: 95,
    damage: 16,
    color: "#72ffb1",
    accent: "#eaffd8",
    sides: 4,
    behavior: "dasher",
    attackCooldown: 1.8,
    attackRange: 220,
    attackWindup: 0.45,
    attackRecovery: STINGER_DASH_DURATION,
  },
  {
    id: "splitter",
    score: 95,
    radius: 15,
    hp: 110,
    speed: 55,
    damage: 22,
    color: "#ff5af0",
    accent: "#ffd1f8",
    sides: 6,
    behavior: "splitter",
  },
];

export function findEnemyType(id: EnemyKind): EnemyType {
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

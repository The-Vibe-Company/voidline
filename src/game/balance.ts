import type { EnemyKind, EnemyType } from "../types";

export const MINI_WAVE_COUNT = 6;
export const MINI_WAVE_DURATION = 25;
export const RUN_TOTAL_DURATION = MINI_WAVE_COUNT * MINI_WAVE_DURATION;
export const BOSS_MINI_WAVE_INDEX = MINI_WAVE_COUNT - 1;

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
  pickupRadius: 36,
  pullSpeed: 360,
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
  miniWaveDuration: MINI_WAVE_DURATION,
  miniWaveCount: MINI_WAVE_COUNT,
  spawnBudgetPerWave: [10, 14, 18, 22, 26, 1] as const,
  hpScalePerStep: 0.45,
  speedScalePerStep: 0.06,
  damageScalePerStep: 0.18,
};

export const boss = {
  hpMultiplier: 14,
  speedMultiplier: 0.62,
  damageMultiplier: 1.7,
  radiusMultiplier: 2.4,
  scoreMultiplier: 12,
};

export const bossAttacks = {
  shotIntervalBase: 1.6,
  shotIntervalMin: 0.4,
  shotProjectileBase: 3,
  shotProjectileMax: 7,
  shotSpread: 0.22,
  shotSpeed: 240,
  shotDamage: 18,
  shotRadius: 7,
  shotLife: 4,
  shotWarmup: 0.9,
  spawnIntervalBase: 5,
  spawnIntervalMin: 1.8,
  spawnCountBase: 2,
  spawnCountMax: 4,
  spawnWarmup: 3.0,
  spawnRadius: 90,
  spawnKinds: ["scout", "hunter"] as const,
  aggressionRamp: 0.08,
  aggressionCap: 3.6,
};

export const SPAWN_TELEGRAPH_DURATION = 0.55;
export const SPAWN_TELEGRAPH_BOSS_DURATION = 1.0;
export const SPAWN_MIN_DISTANCE_FROM_PLAYER = 220;
export const SPAWN_ARENA_MARGIN = 60;

export const STINGER_DASH_SPEED_MULT = 4.5;
export const STINGER_DASH_DURATION = 0.35;
export const STINGER_RECOVER_PAUSE = 0.55;
export const SPLITTER_CHILD_COUNT = 2;
export const SPLITTER_CHILD_HP_RATIO = 0.6;

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

export function isBossMiniWave(miniWaveIndex: number): boolean {
  return miniWaveIndex === BOSS_MINI_WAVE_INDEX;
}

export function miniWaveSpawnBudget(miniWaveIndex: number): number {
  const idx = Math.max(0, Math.min(MINI_WAVE_COUNT - 1, miniWaveIndex));
  return wave.spawnBudgetPerWave[idx] ?? 1;
}

export function enemyHpScale(miniWaveIndex: number): number {
  return 1 + Math.max(0, miniWaveIndex) * wave.hpScalePerStep;
}

export function enemySpeedScale(miniWaveIndex: number): number {
  return 1 + Math.min(0.6, Math.max(0, miniWaveIndex) * wave.speedScalePerStep);
}

export function enemyDamageScale(miniWaveIndex: number): number {
  return 1 + Math.min(1.5, Math.max(0, miniWaveIndex) * wave.damageScalePerStep);
}

export function bossAggression(elapsed: number): number {
  if (elapsed <= 0) return 1;
  return Math.min(bossAttacks.aggressionCap, 1 + elapsed * bossAttacks.aggressionRamp);
}

function aggressionT(elapsed: number): number {
  const span = bossAttacks.aggressionCap - 1;
  if (span <= 0) return 0;
  return Math.min(1, Math.max(0, (bossAggression(elapsed) - 1) / span));
}

export function bossShotInterval(elapsed: number): number {
  const t = aggressionT(elapsed);
  return bossAttacks.shotIntervalBase + (bossAttacks.shotIntervalMin - bossAttacks.shotIntervalBase) * t;
}

export function bossShotProjectiles(elapsed: number): number {
  const t = aggressionT(elapsed);
  const raw = bossAttacks.shotProjectileBase + (bossAttacks.shotProjectileMax - bossAttacks.shotProjectileBase) * t;
  return Math.max(1, Math.min(bossAttacks.shotProjectileMax, Math.round(raw)));
}

export function bossSpawnInterval(elapsed: number): number {
  const t = aggressionT(elapsed);
  return bossAttacks.spawnIntervalBase + (bossAttacks.spawnIntervalMin - bossAttacks.spawnIntervalBase) * t;
}

export function bossSpawnCount(elapsed: number): number {
  const t = aggressionT(elapsed);
  const raw = bossAttacks.spawnCountBase + (bossAttacks.spawnCountMax - bossAttacks.spawnCountBase) * t;
  return Math.max(1, Math.min(bossAttacks.spawnCountMax, Math.round(raw)));
}

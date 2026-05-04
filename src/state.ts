import type {
  Bullet,
  EnemyEntity,
  ExperienceOrb,
  Floater,
  GameState,
  Particle,
  Player,
  Pointer,
  SpawnIndicator,
  World,
} from "./types";

export const canvas = (typeof document !== "undefined"
  ? document.querySelector<HTMLCanvasElement>("#gameCanvas")
  : null) as HTMLCanvasElement;

export const keys = new Set<string>();

export const pointer: Pointer = {
  x: 0,
  y: 0,
  inside: false,
};

export const world: World = {
  width: 0,
  height: 0,
  arenaWidth: 1600,
  arenaHeight: 1100,
  cameraX: 0,
  cameraY: 0,
  dpr: 1,
  time: 0,
  shake: 0,
};

export const state: GameState = {
  mode: "menu",
  controlMode: "keyboard",
  wave: 1,
  waveTimer: 0,
  waveTotalDuration: 0,
  enemiesAlive: 0,
  spawnTimer: 0,
  spawnsRemaining: 0,
  runCurrency: 0,
  carriedXp: 0,
  pendingCarry: 0,
  score: 0,
  highestWaveReached: 1,
  runElapsedSeconds: 0,
};

export const player: Player = createPlayerBaseState();

export const enemies: EnemyEntity[] = [];
export const bullets: Bullet[] = [];
export const experienceOrbs: ExperienceOrb[] = [];
export const particles: Particle[] = [];
export const floaters: Floater[] = [];
export const spawnIndicators: SpawnIndicator[] = [];

export const counters = {
  nextEnemyId: 1,
  nextSpawnIndicatorId: 1,
  nextBulletId: 1,
  nextExperienceId: 1,
  nextParticleId: 1,
  nextFloaterId: 1,
};

export function createPlayerBaseState(): Player {
  return {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    radius: 9,
    hp: 100,
    maxHp: 100,
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
    invuln: 0,
    fireTimer: 0,
    aimAngle: -Math.PI / 2,
  };
}

export function resetPlayerToBase(): void {
  Object.assign(player, createPlayerBaseState());
}

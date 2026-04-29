import type {
  Bullet,
  EnemyEntity,
  ExperienceOrb,
  Floater,
  GameState,
  OwnedUpgrade,
  Particle,
  Player,
  Pointer,
  PowerupOrb,
  Star,
  World,
} from "./types";
import { createPlayerState, xpToNextLevel } from "./game/balance";

export const canvas = document.querySelector<HTMLCanvasElement>("#gameCanvas")!;
export const ctx = canvas.getContext("2d")!;

export const keys = new Set<string>();

export const pointer: Pointer = {
  x: 0,
  y: 0,
  inside: false,
};

export const world: World = {
  width: 0,
  height: 0,
  arenaWidth: 3200,
  arenaHeight: 2200,
  cameraX: 0,
  cameraY: 0,
  dpr: 1,
  time: 0,
  shake: 0,
};

export const state: GameState = {
  mode: "menu",
  wave: 1,
  score: 0,
  waveKills: 0,
  waveTarget: 0,
  spawnRemaining: 0,
  spawnTimer: 0,
  spawnGap: 0.7,
  waveDelay: 0,
  bestCombo: 0,
  controlMode: "keyboard",
  level: 1,
  xp: 0,
  xpTarget: xpToNextLevel(1),
  pendingUpgrades: 0,
  heartsCarried: 0,
  magnetsCarried: 0,
  bombsCarried: 0,
  showPickupZones: false,
};

export const player: Player = createPlayerState();

export const enemies: EnemyEntity[] = [];
export const bullets: Bullet[] = [];
export const experienceOrbs: ExperienceOrb[] = [];
export const powerupOrbs: PowerupOrb[] = [];
export const particles: Particle[] = [];
export const floaters: Floater[] = [];
export const stars: Star[] = [];
export const ownedUpgrades = new Map<string, OwnedUpgrade>();

export const counters = {
  nextEnemyId: 1,
};

export const perfStats = {
  drawn: 0,
  culled: 0,
  collisionChecks: 0,
  updateMs: 0,
  renderMs: 0,
  frameMs: 0,
};

export function resetPerfFrame(): void {
  perfStats.drawn = 0;
  perfStats.culled = 0;
  perfStats.collisionChecks = 0;
}

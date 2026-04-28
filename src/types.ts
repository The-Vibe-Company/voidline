export type GameMode = "menu" | "playing" | "paused" | "upgrade" | "gameover";

export type ControlMode = "keyboard" | "trackpad";

export type EnemyKind = "scout" | "hunter" | "brute";

export type TierId = "standard" | "rare" | "prototype" | "singularity";

export interface World {
  width: number;
  height: number;
  arenaWidth: number;
  arenaHeight: number;
  cameraX: number;
  cameraY: number;
  dpr: number;
  time: number;
  shake: number;
}

export interface GameState {
  mode: GameMode;
  wave: number;
  score: number;
  waveKills: number;
  waveTarget: number;
  spawnRemaining: number;
  spawnTimer: number;
  spawnGap: number;
  waveDelay: number;
  bestCombo: number;
  controlMode: ControlMode;
  level: number;
  xp: number;
  xpTarget: number;
  pendingUpgrades: number;
}

export interface Player {
  x: number;
  y: number;
  radius: number;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  fireRate: number;
  bulletSpeed: number;
  projectileCount: number;
  pierce: number;
  drones: number;
  shield: number;
  shieldMax: number;
  shieldRegen: number;
  invuln: number;
  fireTimer: number;
  droneTimer: number;
  aimAngle: number;
  vx: number;
  vy: number;
}

export interface EnemyType {
  id: EnemyKind;
  score: number;
  radius: number;
  hp: number;
  speed: number;
  damage: number;
  color: string;
  accent: string;
  sides: number;
}

export interface EnemyEntity {
  id: number;
  kind: EnemyKind;
  score: number;
  radius: number;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  color: string;
  accent: string;
  sides: number;
  x: number;
  y: number;
  age: number;
  seed: number;
  wobble: number;
  wobbleRate: number;
  hit: number;
}

export interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  pierce: number;
  life: number;
  color: string;
  trail: number;
  hitIds: Set<number>;
}

export interface ExperienceOrb {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  value: number;
  age: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  life: number;
  maxLife: number;
  behind: boolean;
}

export interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
}

export interface Star {
  x: number;
  y: number;
  size: number;
  depth: number;
  twinkle: number;
}

export interface Pointer {
  x: number;
  y: number;
  inside: boolean;
}

export interface UpgradeTier {
  id: TierId;
  short: string;
  name: string;
  power: number;
  color: string;
  glow: string;
}

export interface Upgrade {
  id: string;
  icon: string;
  name: string;
  description: string;
  effect: (tier: UpgradeTier) => string;
  apply: (tier: UpgradeTier) => void;
}

export interface UpgradeChoice {
  upgrade: Upgrade;
  tier: UpgradeTier;
}

export interface OwnedUpgrade {
  upgrade: Upgrade;
  tier: UpgradeTier;
  count: number;
}

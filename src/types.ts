export type GameMode = "menu" | "playing" | "shop" | "paused" | "gameover";

export type ControlMode = "keyboard" | "trackpad";

export type EnemyKind = "scout" | "hunter" | "brute";

export type CharacterId = "pilot";

export type WeaponId = "pulse";

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

export interface Pointer {
  x: number;
  y: number;
  inside: boolean;
}

export interface Player {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  fireRate: number;
  bulletSpeed: number;
  bulletLife: number;
  range: number;
  projectileCount: number;
  pierce: number;
  bulletRadius: number;
  critChance: number;
  invuln: number;
  fireTimer: number;
  aimAngle: number;
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
  hit: number;
  isBoss: boolean;
  contactCooldown: number;
}

export interface Bullet {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  pierce: number;
  life: number;
  hitIds: Set<number>;
}

export interface ExperienceOrb {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  value: number;
  age: number;
}

export interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  life: number;
  maxLife: number;
}

export interface Floater {
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
}

export interface GameState {
  mode: GameMode;
  controlMode: ControlMode;
  wave: number;
  waveTimer: number;
  waveTotalDuration: number;
  enemiesAlive: number;
  spawnTimer: number;
  spawnsRemaining: number;
  runCurrency: number;
  carriedXp: number;
  pendingCarry: number;
  score: number;
  highestWaveReached: number;
  runElapsedSeconds: number;
}

export interface AccountRecords {
  bestWave: number;
  bestScore: number;
  bestTimeSeconds: number;
}

export interface AccountProgress {
  crystals: number;
  spentCrystals: number;
  upgradeLevels: Partial<Record<MetaUpgradeId, number>>;
  records: AccountRecords;
  lastRunReward: AccountReward | null;
}

export interface AccountRunSummary {
  wave: number;
  elapsedSeconds: number;
  score: number;
}

export interface AccountReward {
  crystalsGained: number;
  newRecords: string[];
}

export type MetaUpgradeId =
  | "meta:max-hp"
  | "meta:damage"
  | "meta:fire-rate"
  | "meta:speed"
  | "meta:crystal-yield";

export interface MetaUpgrade {
  id: MetaUpgradeId;
  name: string;
  description: string;
  maxLevel: number;
  costAt: (level: number) => number;
}

export type UpgradeStat =
  | "fireRate"
  | "damage"
  | "speed"
  | "maxHp"
  | "projectileCount"
  | "pierce"
  | "bulletRadius"
  | "critChance"
  | "bulletSpeed"
  | "range";

export interface UpgradeEffect {
  stat: UpgradeStat;
  amount: number;
}

export interface Upgrade {
  id: string;
  name: string;
  icon: string;
  description: string;
  cost: number;
  effects: readonly UpgradeEffect[];
}

export interface ShopOffer {
  upgrade: Upgrade;
  cost: number;
}

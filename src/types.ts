export type GameMode =
  | "menu"
  | "playing"
  | "paused"
  | "upgrade"
  | "chest"
  | "gameover";

export type ControlMode = "keyboard" | "trackpad";

export type EnemyKind = "scout" | "hunter" | "brute";

export type EnemyRole = "normal" | "mini-boss" | "boss";

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
  miniBossEligibleMisses: number;
  miniBossPending: boolean;
  controlMode: ControlMode;
  level: number;
  xp: number;
  xpTarget: number;
  pendingUpgrades: number;
  pendingChests: number;
  heartsCarried: number;
  magnetsCarried: number;
  bombsCarried: number;
  showPickupZones: boolean;
}

export interface PlayerBonus {
  fireRatePct: number;
  damagePct: number;
  bulletSpeedPct: number;
  speedPct: number;
  pickupRadiusPct: number;
  bulletRadiusPct: number;
}

export type ChallengeMetric =
  | "bestWave"
  | "bossKills"
  | "totalKills"
  | "bestScore"
  | "bestLevel";

export interface PermanentBonus {
  fireRatePct?: number;
  damagePct?: number;
  speedPct?: number;
  pickupRadiusPct?: number;
  maxHpFlat?: number;
}

export interface ChallengeTier {
  threshold: number;
  bonus: PermanentBonus;
}

export interface Challenge {
  id: string;
  icon: string;
  name: string;
  description: string;
  metric: ChallengeMetric;
  unit: string;
  tiers: ChallengeTier[];
}

export type ChallengeProgress = Record<ChallengeMetric, number>;

export interface SimulationInputState {
  keys: ReadonlySet<string>;
  pointer: Pointer;
}

export interface SimulationBudgets {
  maxParticles: number;
  maxFloaters: number;
  maxVisibleXp: number;
  maxDamageTexts: number;
}

export interface SimulationPerfConfig {
  targetFps: number;
  targetFrameMs: number;
  dprMax: number;
  budgets: SimulationBudgets;
}

export interface SimulationConfig {
  seed?: number;
  perf?: Partial<SimulationPerfConfig> & {
    budgets?: Partial<SimulationBudgets>;
  };
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
  critChance: number;
  lifesteal: number;
  pickupRadius: number;
  bulletRadius: number;
  invuln: number;
  fireTimer: number;
  droneTimer: number;
  aimAngle: number;
  vx: number;
  vy: number;
  bonus: PlayerBonus;
  traits: PlayerTraits;
  ramTimer: number;
  magnetStormCharge: number;
  magnetStormTimer: number;
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
  role?: EnemyRole;
  bossVariant?: number;
  contactTimer?: number;
  contactCooldown?: number;
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
  color: string;
  trail: number;
  hitIds: Set<number>;
  source: "player" | "drone" | "chain";
  chainRemaining: number;
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
  magnetized: boolean;
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
  behind: boolean;
}

export interface Floater {
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
  damageText: boolean;
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

export type BuildTag =
  | "cannon"
  | "crit"
  | "pierce"
  | "drone"
  | "shield"
  | "magnet"
  | "salvage";

export type SynergyId =
  | "rail-splitter"
  | "drone-swarm"
  | "kinetic-ram"
  | "magnet-storm";

export interface PlayerTraits {
  railSplitter: boolean;
  droneSwarm: boolean;
  kineticRam: boolean;
  magnetStorm: boolean;
}

export interface SynergyDefinition {
  id: SynergyId;
  name: string;
  description: string;
  color: string;
  requiredTags: Partial<Record<BuildTag, number>>;
}

export interface Upgrade {
  id: string;
  icon: string;
  name: string;
  description: string;
  tags: readonly BuildTag[];
  effect: (tier: UpgradeTier) => string;
  apply: (tier: UpgradeTier, target: Player) => void;
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

export type PowerupKind = "heart" | "magnet" | "bomb";

export interface PowerupVariant {
  id: PowerupKind;
  label: string;
  description: string;
  color: string;
  accent: string;
  rarity: number;
}

export interface PowerupOrb {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  kind: PowerupKind;
  age: number;
  life: number;
}

export interface ChestEntity {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  age: number;
}

export interface Relic {
  id: string;
  icon: string;
  name: string;
  description: string;
  tags: readonly BuildTag[];
  color: string;
  effect: string;
  repeatable?: boolean;
  apply: (target: Player) => void;
}

export interface RelicChoice {
  relic: Relic;
}

export interface OwnedRelic {
  relic: Relic;
  count: number;
}

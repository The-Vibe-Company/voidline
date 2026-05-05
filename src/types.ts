export type GameMode = "menu" | "playing" | "card-pick" | "paused" | "gameover";

export type ControlMode = "keyboard" | "trackpad";

export type EnemyKind =
  | "scout"
  | "hunter"
  | "brute"
  | "sentinel"
  | "stinger"
  | "splitter";

export type EnemyBehavior = "seeker" | "ranged" | "dasher" | "splitter";

export type EnemyAttackState = "idle" | "windup" | "recovering";

export type AttackTelegraphShape = "circle" | "line";

export type CharacterId = "pilot";

export type WeaponArchetypeId =
  | "pulse"
  | "smg"
  | "shotgun"
  | "sniper"
  | "minigun"
  | "railgun";

export type WeaponTier = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface WeaponTierStats {
  damage: number;
  fireRate: number;
  projectileCount: number;
  pierce: number;
  bulletSpeed: number;
  bulletLife: number;
  range: number;
  bulletRadius: number;
  spread: number;
  critChance: number;
}

export interface WeaponDef {
  id: WeaponArchetypeId;
  name: string;
  icon: string;
  description: string;
  tiers: readonly [
    WeaponTierStats,
    WeaponTierStats,
    WeaponTierStats,
    WeaponTierStats,
  ];
}

export interface WeaponMutation {
  id: string;
  name: string;
  description: string;
  stats: WeaponTierStats;
}

export interface Weapon {
  defId: WeaponArchetypeId;
  tier: WeaponTier;
  mutationId: string | null;
  fireTimer: number;
  aimAngle: number;
}

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
  hitstop: number;
  timescale: number;
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
  damageMul: number;
  fireRate: number;
  fireRateMul: number;
  bulletSpeed: number;
  bulletLife: number;
  range: number;
  projectileCount: number;
  pierce: number;
  bulletRadius: number;
  critChance: number;
  lifesteal: number;
  invuln: number;
  aimAngle: number;
  activeWeapon: Weapon;
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
  behavior: EnemyBehavior;
  attackCooldown?: number;
  attackRange?: number;
  attackWindup?: number;
  attackRecovery?: number;
  projectileSpeed?: number;
  projectileDamage?: number;
  projectileLife?: number;
  projectileColor?: string;
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
  behavior: EnemyBehavior;
  attackTimer: number;
  attackState: EnemyAttackState;
  attackProgress: number;
  attackTargetX: number;
  attackTargetY: number;
  attackVx: number;
  attackVy: number;
  bossElapsed?: number;
  bossShotTimer?: number;
  bossSpawnTimer?: number;
  bossFirePattern?: BossFirePattern;
  bossMovePattern?: BossMovePattern;
}

export type BossFirePattern = "aimed" | "spread" | "sweep";
export type BossMovePattern = "chase" | "orbit" | "dashPulse";

export interface SpawnIndicator {
  id: number;
  x: number;
  y: number;
  kind: EnemyKind;
  isBoss: boolean;
  radius: number;
  color: string;
  life: number;
  maxLife: number;
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
  hitIds: Set<number> | null;
}

export interface EnemyBullet {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  life: number;
  color: string;
}

export interface AttackTelegraph {
  id: number;
  shape: AttackTelegraphShape;
  x: number;
  y: number;
  radius: number;
  angle: number;
  length: number;
  life: number;
  maxLife: number;
  color: string;
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
  miniWaveIndex: number;
  miniWaveCount: number;
  waveTimer: number;
  waveTotalDuration: number;
  enemiesAlive: number;
  spawnTimer: number;
  spawnsRemaining: number;
  openerRemaining: number;
  picksTaken: number;
  score: number;
  kills: number;
  xpCollected: number;
  xpMax: number;
  bossDefeated: boolean;
  bossEnemy: EnemyEntity | null;
  bossFightStartedAt: number;
  bossKillElapsed: number;
  bossSpeedBonus: number;
  bossHpBonus: number;
  runStartedAt: number;
  runElapsedSeconds: number;
  dailySeed: string;
  rngState: number;
  starterWeaponId: WeaponArchetypeId;
}

export type CardEffectKind =
  | "stat"
  | "lifesteal"
  | "mutation";

export type CardStat =
  | "fireRate"
  | "fireRateMul"
  | "damage"
  | "damageMul"
  | "speed"
  | "maxHp"
  | "projectileCount"
  | "pierce"
  | "bulletRadius"
  | "critChance"
  | "bulletSpeed"
  | "range";

export interface CardStatEffect {
  kind: "stat";
  stat: CardStat;
  amount: number;
}

export interface CardLifestealEffect {
  kind: "lifesteal";
  amount: number;
}

export interface CardMutationEffect {
  kind: "mutation";
}

export type CardEffect = CardStatEffect | CardLifestealEffect | CardMutationEffect;

export type CardRarity = "common" | "rare" | "mutation";

export interface CardDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  rarity: CardRarity;
  weight: number;
  effects: readonly CardEffect[];
}

export interface MutationPreview {
  weaponName: string;
  mutationId: string;
  mutationName: string;
  description: string;
}

export interface PromotionPreview {
  weaponName: string;
  fromTier: number;
  toTier: number;
  deltas: readonly string[];
}

export interface CardOffer {
  card: CardDef;
  mutationPreview?: MutationPreview;
  promotionPreview?: PromotionPreview;
}

export interface AccountRecords {
  bestMiniWave: number;
  bestScore: number;
  bestTimeSeconds: number;
  bossKills: number;
}

export interface AccountProgress {
  records: AccountRecords;
  lastRunReward: AccountReward | null;
}

export interface AccountRunSummary {
  miniWaveReached: number;
  bossDefeated: boolean;
  elapsedSeconds: number;
  score: number;
  kills: number;
}

export interface AccountReward {
  newRecords: string[];
  bossBonus: boolean;
}

export interface LeaderboardEntry {
  score: number;
  miniWave: number;
  bossDefeated: boolean;
  starterWeaponId: WeaponArchetypeId;
  elapsedSeconds: number;
  date: string;
  seed: string;
}

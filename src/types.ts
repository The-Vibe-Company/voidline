export type GameMode =
  | "menu"
  | "playing"
  | "paused"
  | "upgrade"
  | "chest"
  | "gameover";

export type ControlMode = "keyboard" | "trackpad";

export type EnemyKind = "scout" | "hunter" | "brute" | "gunner";

export type EnemyRole = "normal" | "mini-boss" | "boss";

export type TierId = "standard" | "rare" | "prototype" | "singularity";

export type CharacterId = "pilot" | "runner" | "tank" | "engineer";

export type WeaponId = "pulse" | "scatter" | "lance" | "drone";

export type UnlockRequirement =
  | "available"
  | "reach-10m"
  | "clear-stage-1"
  | "clear-stage-2"
  | "reach-stage-2"
  | "boss-kill";

export type ShopItemId =
  | "character:runner"
  | "character:tank"
  | "character:engineer"
  | "weapon:scatter"
  | "weapon:lance"
  | "weapon:drone"
  | "technology:kinetic-shield"
  | "technology:crit-array"
  | "technology:heavy-caliber";

export type MetaUpgradeId =
  | "unique:weapon-scatter"
  | "unique:weapon-lance"
  | "unique:weapon-drone"
  | "unique:char-runner"
  | "unique:char-tank"
  | "unique:char-engineer"
  | "unique:extra-choice"
  | "card:twin-cannon"
  | "card:plasma-core"
  | "card:rail-slug"
  | "card:velocity-driver"
  | "card:ion-engine"
  | "card:magnet-array"
  | "card:kinetic-shield"
  | "card:crit-array"
  | "card:heavy-caliber"
  | "rarity:rare-signal"
  | "rarity:prototype-lab"
  | "rarity:singularity-core"
  | "utility:crystal-contract"
  | "utility:boss-bounty";

export type MetaUpgradeKind = "unique" | "card" | "rarity" | "utility";

export interface MetaUpgrade {
  id: MetaUpgradeId;
  kind: MetaUpgradeKind;
  name: string;
  description: string;
  maxLevel: number;
  costAt: (level: number) => number;
  requirement: UnlockRequirement;
  tag?: BuildTag;
  weaponId?: WeaponId;
  characterId?: CharacterId;
  technologyId?: string;
  upgradeId?: string;
  rarityTier?: Exclude<TierId, "standard">;
  baseLevel?: number;
  levels?: ReadonlyArray<{ summary: string }>;
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
}

export interface GameState {
  mode: GameMode;
  pressure: number;
  stage: number;
  startStage: number;
  stageElapsedSeconds: number;
  runElapsedSeconds: number;
  stageBossSpawned: boolean;
  stageBossActive: boolean;
  highestStageReached: number;
  score: number;
  phaseKills: number;
  killsByKind: Record<EnemyKind, number>;
  enemyPressureTarget: number;
  spawnTimer: number;
  spawnGap: number;
  bestCombo: number;
  miniBossEligibleMisses: number;
  miniBossPending: boolean;
  miniBossLastPressure: number;
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
  runBossStages: number[];
  runRewardClaimed: boolean;
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
  | "bestSurvivalSeconds"
  | "bossKills"
  | "totalKills"
  | "bestScore"
  | "bestLevel";

export interface ChallengeTier {
  threshold: number;
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

export interface AccountProgress {
  crystals: number;
  spentCrystals: number;
  purchasedUnlockIds: ShopItemId[];
  upgradeLevels: Partial<Record<MetaUpgradeId, number>>;
  selectedCharacterId: CharacterId;
  selectedWeaponId: WeaponId;
  selectedStartStage: number;
  highestStageCleared: number;
  highestStartStageUnlocked: number;
  records: AccountRecords;
  lastRunReward: AccountReward | null;
}

export interface AccountRecords {
  bestStage: number;
  bestTimeSeconds: number;
  bestScore: number;
  bestRunLevel: number;
  bossKills: number;
}

export interface AccountRunSummary {
  stage: number;
  startStage: number;
  elapsedSeconds: number;
  runLevel: number;
  score: number;
  bossStages: readonly number[];
}

export interface AccountRewardBreakdown {
  durationCrystals: number;
  stageCrystals: number;
  bossCrystals: number;
  scoreCrystals: number;
  recordCrystals: number;
  startStageBonusCrystals: number;
}

export interface AccountReward {
  source: "run" | "shop";
  crystalsGained: number;
  newlyUnlockedStartStage: number | null;
  newRecords: string[];
  breakdown: AccountRewardBreakdown;
}

export type ShopItemKind = "character" | "weapon" | "technology";

export interface ShopItem {
  id: ShopItemId;
  kind: ShopItemKind;
  name: string;
  description: string;
  cost: number;
  tags: readonly BuildTag[];
  requirement: UnlockRequirement;
  characterId?: CharacterId;
  weaponId?: WeaponId;
  technologyId?: string;
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

export interface EnemySpawnRule {
  baseChance: number;
  perPressure: number;
  maxChance: number;
  pressureOnset: number;
}

export type EnemySpawnPolicy = EnemySpawnRule | "residual";

export type BossRole = "mini-boss" | "boss";

export type BossId = string;

export interface BossDef {
  id: BossId;
  role: BossRole;
  label: string;
  stats: {
    hpMultiplier: number;
    speedMultiplier: number;
    damageMultiplier: number;
    radiusMultiplier: number;
    scoreMultiplier: number;
    contactCooldown: number;
    color: string;
    accent: string;
    sides: number;
    wobble: number;
    wobbleRate: number;
  };
}

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
  apply: (traits: PlayerTraits) => void;
  reset?: (target: Player) => void;
}

export interface Weapon {
  id: WeaponId;
  name: string;
  icon: string;
  description: string;
  tags: readonly BuildTag[];
  apply: (target: Player) => void;
  effects: readonly import("./game/effect-dsl").EffectOp[];
}

export interface Character {
  id: CharacterId;
  name: string;
  icon: string;
  description: string;
  bonusLabel: string;
  apply: (target: Player) => void;
  effects: readonly import("./game/effect-dsl").EffectOp[];
}

export type UpgradeSoftCappedStat = "drones" | "projectileCount" | "pierce";

export interface UpgradeSoftCap {
  stat: UpgradeSoftCappedStat;
  max: number;
}

export interface Upgrade {
  id: string;
  kind: "technology" | "weapon";
  weaponId?: WeaponId;
  icon: string;
  name: string;
  description: string;
  tags: readonly BuildTag[];
  effect: (tier: UpgradeTier) => string;
  apply: (tier: UpgradeTier, target: Player) => void;
  effects: readonly import("./game/effect-dsl").EffectOp[];
  softCap?: UpgradeSoftCap;
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
  effects: readonly import("./game/effect-dsl").EffectOp[];
}

export interface RelicChoice {
  relic: Relic;
}

export interface OwnedRelic {
  relic: Relic;
  count: number;
}

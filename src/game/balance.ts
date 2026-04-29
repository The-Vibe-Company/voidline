import type { EnemyKind, EnemyType, Player, UpgradeTier } from "../types";

export type PlayerStatBalance = Pick<
  Player,
  | "radius"
  | "hp"
  | "maxHp"
  | "speed"
  | "damage"
  | "fireRate"
  | "bulletSpeed"
  | "projectileCount"
  | "pierce"
  | "drones"
  | "shield"
  | "shieldMax"
  | "shieldRegen"
  | "critChance"
  | "lifesteal"
  | "pickupRadius"
  | "bulletRadius"
>;

export interface WeightedTier {
  tier: UpgradeTier;
  weight: number;
}

export interface WeightedEnemyType {
  type: EnemyType;
  weight: number;
}

export const playerStatBalance: PlayerStatBalance = {
  radius: 18,
  hp: 100,
  maxHp: 100,
  speed: 265,
  damage: 24,
  fireRate: 3,
  bulletSpeed: 610,
  projectileCount: 1,
  pierce: 0,
  drones: 0,
  shield: 0,
  shieldMax: 0,
  shieldRegen: 0,
  critChance: 0,
  lifesteal: 0,
  pickupRadius: 1,
  bulletRadius: 1,
};

export const playerBalance = {
  stats: playerStatBalance,
  resetInvulnerability: 1.2,
};

export const waveBalance = {
  targetBase: 10,
  targetLinear: 4,
  targetExponent: 1.25,
  spawnGapStart: 0.74,
  spawnGapPerWave: 0.04,
  spawnGapMin: 0.18,
  spawnTimerStart: 0.7,
  packChancePerWave: 0.035,
  packChanceMax: 0.52,
  waveDelay: 1.1,
};

export const xpBalance = {
  levelBase: 28,
  levelLinear: 12,
  levelExponent: 1.45,
  levelExponentScale: 6,
  dropScoreDivisor: 7,
  dropWaveScale: 0.04,
  shardCount: {
    scout: 2,
    hunter: 3,
    brute: 5,
  } satisfies Record<EnemyKind, number>,
  orbRadiusBase: 6,
  orbRadiusValueScale: 0.18,
  orbRadiusBonusMax: 5,
  pickupBaseRadius: 40,
};

export const enemyTypes = [
  {
    id: "scout",
    score: 35,
    radius: 14,
    hp: 32,
    speed: 86,
    damage: 12,
    color: "#ff5a69",
    accent: "#ffd0d5",
    sides: 3,
  },
  {
    id: "hunter",
    score: 55,
    radius: 18,
    hp: 48,
    speed: 70,
    damage: 16,
    color: "#ffbf47",
    accent: "#fff0b8",
    sides: 4,
  },
  {
    id: "brute",
    score: 90,
    radius: 25,
    hp: 115,
    speed: 46,
    damage: 24,
    color: "#b973ff",
    accent: "#ead4ff",
    sides: 6,
  },
] satisfies EnemyType[];

export const enemyBalance = {
  hpScalePerWave: 0.055,
  speedScalePerWave: 0.018,
  speedScaleMax: 0.32,
  hunterChancePerWave: 0.045,
  hunterChanceMax: 0.38,
  bruteChanceOffsetWave: 3,
  bruteChancePerWave: 0.035,
  bruteChanceMax: 0.25,
};

export const upgradeTiers = [
  {
    id: "standard",
    short: "T1",
    name: "Standard",
    power: 1,
    color: "#39d9ff",
    glow: "rgba(57, 217, 255, 0.22)",
  },
  {
    id: "rare",
    short: "T2",
    name: "Rare",
    power: 1.45,
    color: "#72ffb1",
    glow: "rgba(114, 255, 177, 0.25)",
  },
  {
    id: "prototype",
    short: "T3",
    name: "Prototype",
    power: 2.05,
    color: "#ffbf47",
    glow: "rgba(255, 191, 71, 0.28)",
  },
  {
    id: "singularity",
    short: "T4",
    name: "Singularity",
    power: 2.8,
    color: "#ff5a69",
    glow: "rgba(255, 90, 105, 0.3)",
  },
] satisfies UpgradeTier[];

export const upgradeBalance = {
  caps: {
    drones: 5,
    projectiles: 8,
    pierce: 5,
    critChance: 0.95,
  },
  steppedGain: {
    rareThreshold: 1.4,
    singularityThreshold: 2.75,
    standard: 1,
    rare: 2,
    singularity: 3,
  },
  tierWeights: {
    standardMin: 42,
    standardBase: 100,
    standardPerWave: 5.5,
    rareBase: 18,
    rarePerWave: 2.8,
    prototypeUnlockWave: 2,
    prototypeLockedWeight: 1,
    prototypeBase: 3,
    prototypePerWave: 1.45,
    singularityUnlockWave: 5,
    singularityPerWave: 0.75,
  },
  effects: {
    fireRate: 0.22,
    damage: 0.26,
    bulletSpeed: 0.055,
    speed: 0.13,
    shield: 24,
    shieldRegen: 2.4,
    maxHp: 20,
    heal: 42,
    pierceDamage: 0.07,
    critChance: 0.08,
    lifesteal: 2,
    pickupRadius: 0.35,
    bulletRadius: 0.18,
    droneExtraThreshold: 2,
  },
};

export const balance = {
  player: playerBalance,
  wave: waveBalance,
  xp: xpBalance,
  enemy: enemyBalance,
  enemies: enemyTypes,
  upgrade: upgradeBalance,
  tiers: upgradeTiers,
};

export function createPlayerState(overrides: Partial<Player> = {}): Player {
  return {
    x: 0,
    y: 0,
    ...playerStatBalance,
    invuln: 0,
    fireTimer: 0,
    droneTimer: 0,
    aimAngle: -Math.PI / 2,
    vx: 0,
    vy: 0,
    ...overrides,
  };
}

export function waveTarget(wave: number): number {
  return Math.round(
    waveBalance.targetBase +
      wave * waveBalance.targetLinear +
      Math.pow(wave, waveBalance.targetExponent),
  );
}

export function spawnGap(wave: number): number {
  return Math.max(
    waveBalance.spawnGapMin,
    waveBalance.spawnGapStart - wave * waveBalance.spawnGapPerWave,
  );
}

export function spawnPackChance(wave: number): number {
  return Math.min(waveBalance.packChanceMax, wave * waveBalance.packChancePerWave);
}

export function xpToNextLevel(level: number): number {
  return Math.round(
    xpBalance.levelBase +
      level * xpBalance.levelLinear +
      Math.pow(level, xpBalance.levelExponent) * xpBalance.levelExponentScale,
  );
}

export function experienceDropTotal(enemyScore: number, wave: number): number {
  return Math.round(
    (enemyScore / xpBalance.dropScoreDivisor) * (1 + wave * xpBalance.dropWaveScale),
  );
}

export function experienceShardCount(kind: EnemyKind): number {
  return xpBalance.shardCount[kind];
}

export function experienceOrbRadius(value: number): number {
  return (
    xpBalance.orbRadiusBase +
    Math.min(xpBalance.orbRadiusBonusMax, value * xpBalance.orbRadiusValueScale)
  );
}

export function enemyTypeWeights(wave: number): WeightedEnemyType[] {
  const bruteChance = Math.min(
    enemyBalance.bruteChanceMax,
    Math.max(
      0,
      (wave - enemyBalance.bruteChanceOffsetWave) * enemyBalance.bruteChancePerWave,
    ),
  );
  const hunterChance = Math.min(
    enemyBalance.hunterChanceMax,
    wave * enemyBalance.hunterChancePerWave,
  );
  const scoutChance = Math.max(0, 1 - bruteChance - hunterChance);

  return [
    { type: enemyTypes[2]!, weight: bruteChance },
    { type: enemyTypes[1]!, weight: hunterChance },
    { type: enemyTypes[0]!, weight: scoutChance },
  ];
}

export function selectEnemyType(wave: number, roll: number): EnemyType {
  const weights = enemyTypeWeights(wave);
  const total = weights.reduce((sum, item) => sum + Math.max(0, item.weight), 0);
  let target = Math.min(Math.max(roll, 0), 0.999999999) * total;

  for (const item of weights) {
    if (item.weight <= 0) continue;
    target -= item.weight;
    if (target < 0) return item.type;
  }

  return weights[weights.length - 1]!.type;
}

export function scaledEnemyStats(
  type: EnemyType,
  wave: number,
): Pick<EnemyType, "hp" | "speed"> {
  return {
    hp: type.hp * (1 + wave * enemyBalance.hpScalePerWave),
    speed:
      type.speed *
      (1 + Math.min(enemyBalance.speedScaleMax, wave * enemyBalance.speedScalePerWave)),
  };
}

export function upgradeTierWeights(wave: number): WeightedTier[] {
  const weights = upgradeBalance.tierWeights;
  return [
    {
      tier: upgradeTiers[0]!,
      weight: Math.max(
        weights.standardMin,
        weights.standardBase - wave * weights.standardPerWave,
      ),
    },
    {
      tier: upgradeTiers[1]!,
      weight: weights.rareBase + wave * weights.rarePerWave,
    },
    {
      tier: upgradeTiers[2]!,
      weight:
        wave >= weights.prototypeUnlockWave
          ? weights.prototypeBase + wave * weights.prototypePerWave
          : weights.prototypeLockedWeight,
    },
    {
      tier: upgradeTiers[3]!,
      weight: wave >= weights.singularityUnlockWave ? wave * weights.singularityPerWave : 0,
    },
  ];
}

export function selectUpgradeTier(wave: number, roll: number): UpgradeTier {
  const weights = upgradeTierWeights(wave);
  const total = weights.reduce((sum, item) => sum + Math.max(0, item.weight), 0);
  let target = Math.min(Math.max(roll, 0), 0.999999999) * total;

  for (const item of weights) {
    if (item.weight <= 0) continue;
    target -= item.weight;
    if (target < 0) return item.tier;
  }

  return upgradeTiers[0]!;
}

export function steppedUpgradeGain(tier: UpgradeTier): number {
  if (tier.power >= upgradeBalance.steppedGain.singularityThreshold) {
    return upgradeBalance.steppedGain.singularity;
  }
  if (tier.power >= upgradeBalance.steppedGain.rareThreshold) {
    return upgradeBalance.steppedGain.rare;
  }
  return upgradeBalance.steppedGain.standard;
}

export function projectileGain(tier: UpgradeTier): number {
  return steppedUpgradeGain(tier);
}

export function droneGain(tier: UpgradeTier): number {
  return tier.power >= upgradeBalance.effects.droneExtraThreshold ? 2 : 1;
}

export function pierceGain(tier: UpgradeTier): number {
  return steppedUpgradeGain(tier);
}

export function shieldGain(tier: UpgradeTier): number {
  return Math.round(upgradeBalance.effects.shield * tier.power);
}

export function shieldRegenGain(tier: UpgradeTier): number {
  return upgradeBalance.effects.shieldRegen * tier.power;
}

export function maxHpGain(tier: UpgradeTier): number {
  return Math.round(upgradeBalance.effects.maxHp * tier.power);
}

export function healGain(tier: UpgradeTier): number {
  return Math.round(upgradeBalance.effects.heal * tier.power);
}

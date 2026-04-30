import type {
  EnemyKind,
  EnemySpawnPolicy,
  EnemyType,
  Player,
  PlayerBonus,
  UpgradeTier,
} from "../types";

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

export const droneBalance = {
  bulletSpeedMul: 0.9,
  damageMul: 0.58,
  damageMulSwarm: 0.66,
  bulletLife: 0.9,
  bulletRadius: 4,
  orbitRadius: 48,
  orbitAngularVelocity: 1.9,
  fireInterval: {
    base: 0.72,
    swarm: 0.52,
    reducePerDrone: 0.05,
    reducePerDroneSwarm: 0.055,
    min: 0.18,
    minSwarm: 0.12,
  },
};

export const playerBalance = {
  stats: playerStatBalance,
  resetInvulnerability: 0.2,
  weaponSpread: {
    max: 0.82,
    perExtraProjectile: 0.13,
  },
  drone: droneBalance,
};

export const waveBalance = {
  targetBase: 21,
  targetLinear: 5,
  targetExponent: 1.28,
  spawnGapStart: 0.405,
  spawnGapPerWave: 0.02,
  spawnGapMin: 0.14,
  spawnTimerStart: 0.1,
  packChancePerWave: 0.12,
  packChanceMax: 0.62,
  waveDelay: 0.7,
};

export const lateWaveBalance = {
  startWave: 10,
  targetLinear: 5,
  targetExponent: 1.12,
  targetExponentScale: 1.4,
  spawnGapPerWave: 0.008,
  spawnGapMin: 0.105,
  packChancePerWave: 0.02,
  packChanceMax: 0.84,
  hpScalePerWave: 0.055,
  speedScalePerWave: 0.018,
  speedScaleMax: 0.24,
  damageScalePerWave: 0.04,
  damageScaleMax: 0.55,
};

export const xpBalance = {
  levelBase: 25,
  levelLinear: 10,
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
  pickupBaseRadius: 36,
};

export const bossBalance = {
  stageDurationSeconds: 600,
  waveOffsetPerStage: 9,
  contactBackoff: 0.45,
  stageScaling: {
    hpPerStage: 0,
    damagePerStage: 0,
    speedPerStage: 0,
  },
  wobble: {
    boss: { value: 0.05, rate: 1.1 },
    miniBoss: { value: 0.09, rate: 1.7 },
  },
  spawnOffsets: {
    miniBoss: { eligibleFromWave: 7, offset: 3, fallbackWave: 8, fallbackRoll: 0.95 },
    waveBoss: { offset: 8, roll: 0.98 },
    stageBoss: { offset: 8, stageMultiplier: 4, roll: 0.98 },
  },
  boss: {
    hpMultiplier: 22,
    speedMultiplier: 0.54,
    damageMultiplier: 1.8,
    radiusMultiplier: 2.15,
    scoreMultiplier: 7,
    contactCooldown: 0.95,
  },
  miniBoss: {
    startWave: 3,
    spawnChance: 0.32,
    guaranteeAfterEligibleWaves: 4,
    hpMultiplier: 6.4,
    speedMultiplier: 0.74,
    damageMultiplier: 1.35,
    radiusMultiplier: 1.55,
    scoreMultiplier: 3.2,
    contactCooldown: 1.05,
  },
};

export const enemyTypes = [
  {
    id: "scout",
    score: 35,
    radius: 14,
    hp: 42,
    speed: 132,
    damage: 25,
    color: "#ff5a69",
    accent: "#ffd0d5",
    sides: 3,
  },
  {
    id: "hunter",
    score: 55,
    radius: 18,
    hp: 64,
    speed: 112,
    damage: 29,
    color: "#ffbf47",
    accent: "#fff0b8",
    sides: 4,
  },
  {
    id: "brute",
    score: 90,
    radius: 25,
    hp: 130,
    speed: 72,
    damage: 40,
    color: "#b973ff",
    accent: "#ead4ff",
    sides: 6,
  },
] satisfies EnemyType[];

export const enemyBalance = {
  hpScalePerWave: 0.06,
  speedScalePerWave: 0.022,
  speedScaleMax: 0.4,
  hunterChancePerWave: 0.07,
  hunterChanceMax: 0.4,
  bruteChanceOffsetWave: 2,
  bruteChancePerWave: 0.05,
  bruteChanceMax: 0.25,
  wobble: {
    scout: 0.18,
    hunter: 0.18,
    brute: 0.08,
    rateBase: 2,
    rateRandom: 2,
  } satisfies Record<EnemyKind, number> & { rateBase: number; rateRandom: number },
};

export const enemySpawnRules: Record<EnemyKind, EnemySpawnPolicy> = {
  scout: "residual",
  hunter: {
    baseChance: 0,
    perWave: enemyBalance.hunterChancePerWave,
    maxChance: enemyBalance.hunterChanceMax,
    waveOnset: 0,
  },
  brute: {
    baseChance: 0,
    perWave: enemyBalance.bruteChancePerWave,
    maxChance: enemyBalance.bruteChanceMax,
    waveOnset: enemyBalance.bruteChanceOffsetWave,
  },
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
    standardMin: 24,
    standardBase: 100,
    standardPerWave: 5.5,
    rareBase: 28,
    rarePerWave: 2.8,
    prototypeBase: 7,
    prototypePerWave: 1.45,
    singularityPerWave: 1.4,
  },
  gates: {
    rare: { minWave: 1, rampWaves: 0 },
    prototype: { minWave: 2, rampWaves: 0, lockedWeight: 4 },
    singularity: { minWave: 3, rampWaves: 0, lockedWeight: 0 },
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

export const synergyBalance = {
  kineticRam: {
    minSpeed: 150,
    minShieldRatio: 0.28,
    cooldown: 0.16,
    hitDuration: 0.16,
    knockback: 86,
    damage: { vsDamage: 1.8, vsShield: 0.55, vsSpeed: 0.08 },
    shieldCost: { flat: 8, perRadius: 0.42 },
  },
  magnetStorm: {
    threshold: 24,
    cooldown: 2.35,
    hitDuration: 0.18,
    knockback: 42,
    radius: { base: 180, pickupFactor: 42, maxBonus: 115 },
    damage: { vsDamage: 2.15, vsCharge: 1.65 },
  },
};

export const powerupBalance = {
  heartHealRatio: 0.5,
  pullRadius: 70,
  pullStrength: 380,
  velocityDamping: 1.6,
  dropChance: {
    scout: 0.012,
    hunter: 0.03,
    brute: 0.09,
  } satisfies Record<EnemyKind, number>,
};

export const progressionBalance = {
  relicUnlockWaves: [10, 20, 30] as const,
};

export const balance = {
  player: playerBalance,
  wave: waveBalance,
  xp: xpBalance,
  lateWave: lateWaveBalance,
  enemy: enemyBalance,
  enemies: enemyTypes,
  upgrade: upgradeBalance,
  tiers: upgradeTiers,
  bosses: bossBalance,
  synergies: synergyBalance,
  powerups: powerupBalance,
  progression: progressionBalance,
};

export function createPlayerBonus(): PlayerBonus {
  return {
    fireRatePct: 0,
    damagePct: 0,
    bulletSpeedPct: 0,
    speedPct: 0,
    pickupRadiusPct: 0,
    bulletRadiusPct: 0,
  };
}

const MULTIPLICATIVE_STATS = [
  ["fireRate", "fireRatePct"],
  ["damage", "damagePct"],
  ["bulletSpeed", "bulletSpeedPct"],
  ["speed", "speedPct"],
  ["pickupRadius", "pickupRadiusPct"],
  ["bulletRadius", "bulletRadiusPct"],
] as const;

export function recomputeMultiplicativeStats(player: Player): void {
  for (const [statKey, bonusKey] of MULTIPLICATIVE_STATS) {
    player[statKey] = playerStatBalance[statKey] * (1 + player.bonus[bonusKey]);
  }
}

export function createPlayerState(overrides: Partial<Player> = {}): Player {
  const base: Player = {
    x: 0,
    y: 0,
    ...playerStatBalance,
    invuln: 0,
    fireTimer: 0,
    droneTimer: 0,
    aimAngle: -Math.PI / 2,
    vx: 0,
    vy: 0,
    bonus: createPlayerBonus(),
    traits: {
      railSplitter: false,
      droneSwarm: false,
      kineticRam: false,
      magnetStorm: false,
    },
    ramTimer: 0,
    magnetStormCharge: 0,
    magnetStormTimer: 0,
  };
  return {
    ...base,
    ...overrides,
    bonus: { ...base.bonus, ...(overrides.bonus ?? {}) },
    traits: { ...base.traits, ...(overrides.traits ?? {}) },
  };
}

export function waveTarget(wave: number): number {
  return Math.round(
    waveBalance.targetBase +
      wave * waveBalance.targetLinear +
      Math.pow(wave, waveBalance.targetExponent) +
      lateWaveTargetBonus(wave),
  );
}

export function spawnGap(wave: number): number {
  const latePressure = lateWavePressure(wave);
  return Math.max(
    latePressure > 0 ? lateWaveBalance.spawnGapMin : waveBalance.spawnGapMin,
    waveBalance.spawnGapStart -
      wave * waveBalance.spawnGapPerWave -
      latePressure * lateWaveBalance.spawnGapPerWave,
  );
}

export function spawnPackChance(wave: number): number {
  const latePressure = lateWavePressure(wave);
  const cap =
    latePressure > 0
      ? Math.min(
          lateWaveBalance.packChanceMax,
          waveBalance.packChanceMax + latePressure * lateWaveBalance.packChancePerWave,
        )
      : waveBalance.packChanceMax;
  return Math.min(
    cap,
    wave * waveBalance.packChancePerWave +
      latePressure * lateWaveBalance.packChancePerWave,
  );
}

export function scoreAward(enemyScore: number, wave: number): number {
  return Math.round(enemyScore * (1.25 + wave * 0.1));
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

function applyEnemySpawnRule(rule: { baseChance: number; perWave: number; maxChance: number; waveOnset: number }, wave: number): number {
  return Math.min(
    rule.maxChance,
    Math.max(0, rule.baseChance + Math.max(0, wave - rule.waveOnset) * rule.perWave),
  );
}

export function enemyTypeWeights(wave: number): WeightedEnemyType[] {
  const result: WeightedEnemyType[] = [];
  let residual: EnemyType | null = null;
  let nonResidualSum = 0;

  for (const type of enemyTypes) {
    const policy = enemySpawnRules[type.id];
    if (policy === "residual") {
      residual = type;
      continue;
    }
    const weight = applyEnemySpawnRule(policy, wave);
    result.push({ type, weight });
    nonResidualSum += weight;
  }

  if (residual) {
    result.push({ type: residual, weight: Math.max(0, 1 - nonResidualSum) });
  }

  return result;
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
): Pick<EnemyType, "hp" | "speed" | "damage"> {
  const latePressure = lateWavePressure(wave);
  return {
    hp:
      type.hp *
      (1 +
        wave * enemyBalance.hpScalePerWave +
        latePressure * lateWaveBalance.hpScalePerWave),
    speed:
      type.speed *
      (1 +
        Math.min(enemyBalance.speedScaleMax, wave * enemyBalance.speedScalePerWave) +
        Math.min(
          lateWaveBalance.speedScaleMax,
          latePressure * lateWaveBalance.speedScalePerWave,
        )),
    damage:
      type.damage *
      (1 +
        Math.min(
          lateWaveBalance.damageScaleMax,
          latePressure * lateWaveBalance.damageScalePerWave,
        )),
  };
}

export function lateWavePressure(wave: number): number {
  return Math.max(0, wave - lateWaveBalance.startWave + 1);
}

function lateWaveTargetBonus(wave: number): number {
  const pressure = lateWavePressure(wave);
  if (pressure <= 0) return 0;
  return Math.round(
    pressure * lateWaveBalance.targetLinear +
      Math.pow(pressure, lateWaveBalance.targetExponent) *
        lateWaveBalance.targetExponentScale,
  );
}

function gateRampMultiplier(
  wave: number,
  gate: { minWave: number; rampWaves: number },
): number {
  if (wave < gate.minWave) return 0;
  if (gate.rampWaves <= 0) return 1;
  return Math.min(1, (wave - gate.minWave + 1) / gate.rampWaves);
}

export function upgradeTierWeights(wave: number, rarityRank = 0): WeightedTier[] {
  const weights = upgradeBalance.tierWeights;
  const gates = upgradeBalance.gates;
  const rank = Math.max(0, Math.min(3, Math.floor(rarityRank)));
  const protoRamp = gateRampMultiplier(wave, gates.prototype);
  const singularityRamp = gateRampMultiplier(wave, gates.singularity);
  return [
    {
      tier: upgradeTiers[0]!,
      weight: Math.max(
        weights.standardMin,
        weights.standardBase - wave * weights.standardPerWave - rank * 8,
      ),
    },
    {
      tier: upgradeTiers[1]!,
      weight: weights.rareBase + wave * weights.rarePerWave + rank * 6,
    },
    {
      tier: upgradeTiers[2]!,
      weight:
        protoRamp > 0
          ? (weights.prototypeBase + wave * weights.prototypePerWave + rank * 3) * protoRamp
          : gates.prototype.lockedWeight,
    },
    {
      tier: upgradeTiers[3]!,
      weight:
        singularityRamp > 0
          ? (wave * weights.singularityPerWave + rank * 1.5) * singularityRamp
          : gates.singularity.lockedWeight,
    },
  ];
}

export function selectUpgradeTier(wave: number, roll: number, rarityRank = 0): UpgradeTier {
  const weights = upgradeTierWeights(wave, rarityRank);
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

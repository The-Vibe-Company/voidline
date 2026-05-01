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

export interface RarityWeightProfile {
  rare: number;
  prototype: number;
  singularity: number;
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

export const pressureBalance = {
  targetBase: 21,
  targetLinear: 5,
  targetExponent: 1.28,
  spawnGapStart: 0.405,
  spawnGapPerPressure: 0.02,
  spawnGapMin: 0.14,
  spawnTimerStart: 0.1,
  packChancePerPressure: 0.12,
  packChanceMax: 0.62,
};

export const enemyDensityMultiplier = 3;

export const latePressureBalance = {
  startPressure: 7,
  targetLinear: 5,
  targetExponent: 1.12,
  targetExponentScale: 1.4,
  spawnGapPerPressure: 0.008,
  spawnGapMin: 0.105,
  packChancePerPressure: 0.02,
  packChanceMax: 0.84,
  hpScalePerPressure: 0.055,
  speedScalePerPressure: 0.018,
  speedScaleMax: 0.24,
  damageScalePerPressure: 0.04,
  damageScaleMax: 0.55,
};

export const xpBalance = {
  levelBase: 25,
  levelLinear: 10,
  levelExponent: 1.45,
  levelExponentScale: 6,
  dropScoreDivisor: 7,
  dropPressureScale: 0.04,
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
  pressureOffsetPerStage: 4,
  postStage2PressureOffsetRatio: 0.25,
  contactBackoff: 0.45,
  stageScaling: {
    hpPerStage: 120,
    damagePerStage: 0.25,
    speedPerStage: 0.04,
    postStage2HpOffsetBase: 1,
    postStage2HpOffsetPerStage: 0.08,
  },
  wobble: {
    boss: { value: 0.05, rate: 1.1 },
    miniBoss: { value: 0.09, rate: 1.7 },
  },
  spawnOffsets: {
    miniBoss: { eligibleFromPressure: 7, offset: 3, fallbackPressure: 8, fallbackRoll: 0.95 },
    stageBoss: { offset: 8, stageMultiplier: 4, roll: 0.98 },
  },
  boss: {
    hpMultiplier: 12,
    speedMultiplier: 0.54,
    damageMultiplier: 1.8,
    radiusMultiplier: 2.15,
    scoreMultiplier: 7,
    contactCooldown: 0.95,
  },
  miniBoss: {
    startPressure: 4,
    spawnChance: 0.32,
    guaranteeAfterEligiblePressures: 4,
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
  swarmHpScale: 0.25,
  swarmDamageScale: 0.27,
  swarmSpeedScale: 0.92,
  hpScalePerPressure: 0.065,
  speedScalePerPressure: 0.022,
  speedScaleMax: 0.4,
  hunterChancePerPressure: 0.07,
  hunterChanceMax: 0.4,
  bruteChanceOffsetPressure: 2,
  bruteChancePerPressure: 0.05,
  bruteChanceMax: 0.25,
  contactBackoff: 0.65,
  pursuitLane: {
    startDistance: 120,
    maxTurn: 0.22,
    goldenAngleTurn: 0.61803398875,
  },
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
    perPressure: enemyBalance.hunterChancePerPressure,
    maxChance: enemyBalance.hunterChanceMax,
    pressureOnset: 0,
  },
  brute: {
    baseChance: 0,
    perPressure: enemyBalance.bruteChancePerPressure,
    maxChance: enemyBalance.bruteChanceMax,
    pressureOnset: enemyBalance.bruteChanceOffsetPressure,
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
    power: 1.3,
    color: "#72ffb1",
    glow: "rgba(114, 255, 177, 0.25)",
  },
  {
    id: "prototype",
    short: "T3",
    name: "Prototype",
    power: 1.7,
    color: "#ffbf47",
    glow: "rgba(255, 191, 71, 0.28)",
  },
  {
    id: "singularity",
    short: "T4",
    name: "Singularity",
    power: 2.2,
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
    fireRateMul: 1.5,
    damageMul: 1.8,
  },
  steppedGain: {
    rareThreshold: 1.25,
    singularityThreshold: 2.15,
    standard: 1,
    rare: 2,
    singularity: 3,
  },
  tierWeights: {
    standardMin: 38,
    standardBase: 100,
    standardPerPressure: 5.5,
    rareBase: 28,
    rarePerPressure: 1.5,
    prototypeBase: 7,
    prototypePerPressure: 0.9,
    singularityPerPressure: 0.8,
    perRank: {
      standardPenalty: 6,
      rare: 6,
      prototype: 5,
      singularity: 4,
    },
  },
  gates: {
    rare: { minPressure: 1, rampPressures: 0, minRank: 1 },
    prototype: { minPressure: 5, rampPressures: 2, lockedWeight: 0, minRank: 2 },
    singularity: { minPressure: 8, rampPressures: 2, lockedWeight: 0, minRank: 3 },
  },
  effects: {
    fireRate: 0.17,
    damage: 0.2,
    bulletSpeed: 0.04,
    speed: 0.16,
    shield: 18,
    shieldRegen: 1.6,
    maxHp: 14,
    heal: 32,
    pierceDamage: 0.07,
    critChance: 0.06,
    lifesteal: 1.4,
    pickupRadius: 0.36,
    bulletRadius: 0.24,
    projectileDamageFactor: 0.6,
    droneExtraThreshold: 1.65,
  },
};

export const synergyBalance = {
  kineticRam: {
    minSpeed: 150,
    minShieldRatio: 0.28,
    cooldown: 0.16,
    hitDuration: 0.16,
    knockback: 86,
    damage: { vsDamage: 1.4, vsShield: 0.45, vsSpeed: 0.07 },
    shieldCost: { flat: 8, perRadius: 0.42 },
  },
  magnetStorm: {
    threshold: 24,
    cooldown: 2.35,
    hitDuration: 0.18,
    knockback: 42,
    radius: { base: 180, pickupFactor: 42, maxBonus: 115 },
    damage: { vsDamage: 1.55, vsCharge: 1.3 },
  },
};

export const powerupBalance = {
  heartHealRatio: 0.5,
  pullRadius: 70,
  pullStrength: 380,
  velocityDamping: 1.6,
  dropChance: {
    scout: 0.012 / enemyDensityMultiplier,
    hunter: 0.03 / enemyDensityMultiplier,
    brute: 0.09 / enemyDensityMultiplier,
  } satisfies Record<EnemyKind, number>,
};

export const hordeBalance = {
  startsSeconds: [180, 360] as const,
  durationSeconds: 30,
  spawnGapMultiplier: 0.35,
  pressureTargetMultiplier: 2.25,
  packBonus: 2,
};

export const progressionBalance = {
  relicUnlockStages: [1, 2, 3] as const,
};

export const balance = {
  enemyDensityMultiplier,
  player: playerBalance,
  pressure: pressureBalance,
  xp: xpBalance,
  latePressure: latePressureBalance,
  enemy: enemyBalance,
  enemies: enemyTypes,
  upgrade: upgradeBalance,
  tiers: upgradeTiers,
  bosses: bossBalance,
  hordes: hordeBalance,
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

export function pressureTarget(pressure: number): number {
  return Math.round(
    (pressureBalance.targetBase +
      pressure * pressureBalance.targetLinear +
      Math.pow(pressure, pressureBalance.targetExponent) +
      latePressureTargetBonus(pressure)) *
      enemyDensityMultiplier,
  );
}

export function spawnGap(pressure: number): number {
  const late = latePressure(pressure);
  return Math.max(
    (late > 0 ? latePressureBalance.spawnGapMin : pressureBalance.spawnGapMin) /
      enemyDensityMultiplier,
    (pressureBalance.spawnGapStart -
      pressure * pressureBalance.spawnGapPerPressure -
      late * latePressureBalance.spawnGapPerPressure) /
      enemyDensityMultiplier,
  );
}

export function spawnPackChance(pressure: number): number {
  const late = latePressure(pressure);
  const cap =
    late > 0
      ? Math.min(
          latePressureBalance.packChanceMax,
          pressureBalance.packChanceMax + late * latePressureBalance.packChancePerPressure,
        )
      : pressureBalance.packChanceMax;
  return Math.min(
    cap,
    pressure * pressureBalance.packChancePerPressure +
      late * latePressureBalance.packChancePerPressure,
  );
}

export function scoreAward(enemyScore: number, pressure: number): number {
  return Math.max(1, Math.round((enemyScore * (1.25 + pressure * 0.1)) / enemyDensityMultiplier));
}

export function xpToNextLevel(level: number): number {
  return Math.round(
    xpBalance.levelBase +
      level * xpBalance.levelLinear +
      Math.pow(level, xpBalance.levelExponent) * xpBalance.levelExponentScale,
  );
}

export function experienceDropTotal(enemyScore: number, pressure: number): number {
  return Math.max(
    1,
    Math.round(
      ((enemyScore / xpBalance.dropScoreDivisor) * (1 + pressure * xpBalance.dropPressureScale)) /
        enemyDensityMultiplier,
    ),
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

function applyEnemySpawnRule(
  rule: { baseChance: number; perPressure: number; maxChance: number; pressureOnset: number },
  pressure: number,
): number {
  return Math.min(
    rule.maxChance,
    Math.max(
      0,
      rule.baseChance + Math.max(0, pressure - rule.pressureOnset) * rule.perPressure,
    ),
  );
}

export function enemyTypeWeights(pressure: number): WeightedEnemyType[] {
  const result: WeightedEnemyType[] = [];
  let residual: EnemyType | null = null;
  let nonResidualSum = 0;

  for (const type of enemyTypes) {
    const policy = enemySpawnRules[type.id];
    if (policy === "residual") {
      residual = type;
      continue;
    }
    const weight = applyEnemySpawnRule(policy, pressure);
    result.push({ type, weight });
    nonResidualSum += weight;
  }

  if (residual) {
    result.push({ type: residual, weight: Math.max(0, 1 - nonResidualSum) });
  }

  return result;
}

export function selectEnemyType(pressure: number, roll: number): EnemyType {
  const weights = enemyTypeWeights(pressure);
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
  pressure: number,
): Pick<EnemyType, "hp" | "speed" | "damage"> {
  const stats = scaledEliteEnemyStats(type, pressure);
  return {
    hp: stats.hp * enemyBalance.swarmHpScale,
    speed: stats.speed * enemyBalance.swarmSpeedScale,
    damage: stats.damage * enemyBalance.swarmDamageScale,
  };
}

export function scaledEliteEnemyStats(
  type: EnemyType,
  pressure: number,
): Pick<EnemyType, "hp" | "speed" | "damage"> {
  const late = latePressure(pressure);
  return {
    hp:
      type.hp *
      (1 +
        pressure * enemyBalance.hpScalePerPressure +
        late * latePressureBalance.hpScalePerPressure),
    speed:
      type.speed *
      (1 +
        Math.min(enemyBalance.speedScaleMax, pressure * enemyBalance.speedScalePerPressure) +
        Math.min(
          latePressureBalance.speedScaleMax,
          late * latePressureBalance.speedScalePerPressure,
        )),
    damage:
      type.damage *
      (1 +
        Math.min(
          latePressureBalance.damageScaleMax,
          late * latePressureBalance.damageScalePerPressure,
        )),
  };
}

export function latePressure(pressure: number): number {
  return Math.max(0, pressure - latePressureBalance.startPressure + 1);
}

function latePressureTargetBonus(pressure: number): number {
  const late = latePressure(pressure);
  if (late <= 0) return 0;
  return Math.round(
    late * latePressureBalance.targetLinear +
      Math.pow(late, latePressureBalance.targetExponent) *
        latePressureBalance.targetExponentScale,
  );
}

function gateRampMultiplier(
  pressure: number,
  gate: { minPressure: number; rampPressures: number },
): number {
  if (pressure < gate.minPressure) return 0;
  if (gate.rampPressures <= 0) return 1;
  return Math.min(1, (pressure - gate.minPressure + 1) / gate.rampPressures);
}

function normalizeRarityProfile(rarity: number | RarityWeightProfile): RarityWeightProfile {
  if (typeof rarity === "number") {
    const rank = Math.max(0, Math.min(3, Math.floor(rarity)));
    return {
      rare: rank >= 1 ? rank : 0,
      prototype: rank >= 2 ? rank : 0,
      singularity: rank >= 3 ? rank : 0,
    };
  }
  return {
    rare: Math.max(0, Math.min(3, Math.floor(rarity.rare))),
    prototype: Math.max(0, Math.min(3, Math.floor(rarity.prototype))),
    singularity: Math.max(0, Math.min(3, Math.floor(rarity.singularity))),
  };
}

export function upgradeTierWeights(
  pressure: number,
  rarity: number | RarityWeightProfile = 0,
): WeightedTier[] {
  const weights = upgradeBalance.tierWeights;
  const gates = upgradeBalance.gates;
  const profile = normalizeRarityProfile(rarity);
  const rank = Math.min(3, Math.max(profile.rare, profile.prototype, profile.singularity));
  const perRank = weights.perRank;
  const protoRamp = gateRampMultiplier(pressure, gates.prototype);
  const singularityRamp = gateRampMultiplier(pressure, gates.singularity);
  const rareUnlocked = profile.rare > 0;
  const prototypeUnlocked = profile.prototype > 0;
  const singularityUnlocked = profile.singularity > 0;
  return [
    {
      tier: upgradeTiers[0]!,
      weight: Math.max(
        weights.standardMin,
        weights.standardBase -
          pressure * weights.standardPerPressure -
          rank * perRank.standardPenalty,
      ),
    },
    {
      tier: upgradeTiers[1]!,
      weight: rareUnlocked
        ? weights.rareBase + pressure * weights.rarePerPressure + profile.rare * perRank.rare
        : 0,
    },
    {
      tier: upgradeTiers[2]!,
      weight: !prototypeUnlocked
        ? 0
        : protoRamp > 0
          ? (weights.prototypeBase +
              pressure * weights.prototypePerPressure +
              profile.prototype * perRank.prototype) *
            protoRamp
          : gates.prototype.lockedWeight,
    },
    {
      tier: upgradeTiers[3]!,
      weight: !singularityUnlocked
        ? 0
        : singularityRamp > 0
          ? (pressure * weights.singularityPerPressure + profile.singularity * perRank.singularity) *
            singularityRamp
          : gates.singularity.lockedWeight,
    },
  ];
}

export function selectUpgradeTier(
  pressure: number,
  roll: number,
  rarity: number | RarityWeightProfile = 0,
): UpgradeTier {
  const weights = upgradeTierWeights(pressure, rarity);
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

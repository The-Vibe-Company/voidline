import {
  enemies,
  experienceOrbs,
  keys,
  player,
  pointer,
  state,
  world,
} from "../state";
import { pickUpgrades, applyUpgrade } from "../systems/upgrades";
import { resetSimulation, stepSimulation } from "../simulation/simulation";
import { setSimulationSeed } from "../simulation/random";
import { mulberry32 } from "../perf/rng";
import type { UpgradeChoice } from "../types";
import {
  currentChallengeProgress,
  isChallengeTrackingEnabled,
  resetChallengeProgress,
  restoreChallengeProgress,
  setChallengeTrackingEnabled,
} from "../systems/challenges";

export type BalancePersonaId = "idle" | "panic" | "kiter" | "optimizer";

export interface BalanceTrialOptions {
  seed: number;
  persona: BalancePersonaId;
  maxWave: number;
  maxSeconds: number;
  stepSeconds?: number;
}

export interface BalanceTrialResult {
  seed: number;
  persona: BalancePersonaId;
  died: boolean;
  timeSeconds: number;
  finalWave: number;
  finalHp: number;
  lowestHp: number;
  kills: number;
  level: number;
  score: number;
  upgradesApplied: number;
}

export interface BalanceSummary {
  persona: BalancePersonaId;
  runs: number;
  deaths: number;
  deathRate: number;
  reachedWave3: number;
  reachedWave6: number;
  medianWave: number;
  medianHp: number;
  medianTimeSeconds: number;
  medianLevel: number;
  waveVariance: number;
  hpVariance: number;
}

interface PersonaRuntime {
  rng: () => number;
  nextDecisionSeconds: number;
  moveX: number;
  moveY: number;
}

const DEFAULT_STEP_SECONDS = 1 / 60;
const MAX_STEP_SECONDS = 0.033;
const OFFENSIVE_UPGRADE_PRIORITY = [
  "twin-cannon",
  "rail-slug",
  "piercer",
  "crit-array",
  "orbital-drone",
  "plasma-core",
  "heavy-caliber",
  "vampire-coil",
  "ion-engine",
  "kinetic-shield",
  "repair-bay",
  "magnet-array",
];
const OPTIMIZER_UPGRADE_PRIORITY = [
  "twin-cannon",
  "plasma-core",
  "rail-slug",
  "ion-engine",
  "kinetic-shield",
  "vampire-coil",
  "repair-bay",
  "piercer",
  "orbital-drone",
  "heavy-caliber",
  "crit-array",
  "magnet-array",
];
const KITE_DIRECTIONS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const;
const OPTIMIZER_DIRECTIONS = [
  [1, 0],
  [0.924, 0.383],
  [0.707, 0.707],
  [0.383, 0.924],
  [0, 1],
  [-0.383, 0.924],
  [-0.707, 0.707],
  [-0.924, 0.383],
  [-1, 0],
  [-0.924, -0.383],
  [-0.707, -0.707],
  [-0.383, -0.924],
  [0, -1],
  [0.383, -0.924],
  [0.707, -0.707],
  [0.924, -0.383],
  [0, 0],
] as const;
const OPTIMIZER_HORIZONS = [0.28, 0.62, 1.04] as const;

export function runBalanceTrial(options: BalanceTrialOptions): BalanceTrialResult {
  const stepSeconds = options.stepSeconds ?? DEFAULT_STEP_SECONDS;
  validateTrialOptions(options, stepSeconds);
  const savedChallengeProgress = currentChallengeProgress();
  const savedChallengeTracking = isChallengeTrackingEnabled();
  const savedInput = {
    keys: new Set(keys),
    pointerX: pointer.x,
    pointerY: pointer.y,
    pointerInside: pointer.inside,
    controlMode: state.controlMode,
  };

  try {
    prepareHeadlessWorld(options.seed);
    const runtime: PersonaRuntime = {
      rng: mulberry32(options.seed ^ personaSeedSalt(options.persona)),
      nextDecisionSeconds: 0,
      moveX: 0,
      moveY: 0,
    };
    let elapsedSeconds = 0;
    let lowestHp = player.hp;
    let upgradesApplied = 0;
    let totalKills = 0;
    let trackedWave = state.wave;
    let trackedWaveKills = state.waveKills;

    while (
      elapsedSeconds < options.maxSeconds &&
      state.mode !== "gameover" &&
      state.wave < options.maxWave
    ) {
      upgradesApplied += spendPendingUpgrades(options.persona);
      updatePersonaMovement(options.persona, runtime, elapsedSeconds);
      stepSimulation(stepSeconds);
      elapsedSeconds += stepSeconds;
      lowestHp = Math.min(lowestHp, player.hp);

      if (state.wave !== trackedWave) {
        totalKills += trackedWaveKills;
        trackedWave = state.wave;
      }
      trackedWaveKills = state.waveKills;
    }
    totalKills += trackedWaveKills;

    return {
      seed: options.seed,
      persona: options.persona,
      died: state.mode === "gameover",
      timeSeconds: roundMetric(elapsedSeconds),
      finalWave: state.wave,
      finalHp: roundMetric(player.hp),
      lowestHp: roundMetric(lowestHp),
      kills: totalKills,
      level: state.level,
      score: Math.round(state.score),
      upgradesApplied,
    };
  } finally {
    cleanupHeadlessWorld();
    keys.clear();
    for (const key of savedInput.keys) keys.add(key);
    pointer.x = savedInput.pointerX;
    pointer.y = savedInput.pointerY;
    pointer.inside = savedInput.pointerInside;
    state.controlMode = savedInput.controlMode;
    restoreChallengeProgress(savedChallengeProgress);
    setChallengeTrackingEnabled(savedChallengeTracking);
  }
}

export function summarizeBalanceTrials(results: BalanceTrialResult[]): BalanceSummary {
  if (!results.length) {
    throw new Error("Cannot summarize an empty balance trial set.");
  }

  const [first] = results;
  const persona = first!.persona;
  if (results.some((result) => result.persona !== persona)) {
    throw new Error("Cannot summarize balance trials from multiple personas.");
  }

  const deaths = results.filter((result) => result.died).length;
  return {
    persona,
    runs: results.length,
    deaths,
    deathRate: deaths / results.length,
    reachedWave3: results.filter((result) => result.finalWave >= 3).length,
    reachedWave6: results.filter((result) => result.finalWave >= 6).length,
    medianWave: median(results.map((result) => result.finalWave)),
    medianHp: median(results.map((result) => result.finalHp)),
    medianTimeSeconds: median(results.map((result) => result.timeSeconds)),
    medianLevel: median(results.map((result) => result.level)),
    waveVariance: variance(results.map((result) => result.finalWave)),
    hpVariance: variance(results.map((result) => result.finalHp)),
  };
}

function prepareHeadlessWorld(seed: number): void {
  keys.clear();
  pointer.x = 0;
  pointer.y = 0;
  pointer.inside = false;
  world.width = 1280;
  world.height = 720;
  world.arenaWidth = 3200;
  world.arenaHeight = 2200;
  world.cameraX = 0;
  world.cameraY = 0;
  world.dpr = 1;
  world.time = 0;
  world.shake = 0;
  setChallengeTrackingEnabled(false);
  resetChallengeProgress(null);
  resetSimulation(seed);
  state.controlMode = "keyboard";
}

function cleanupHeadlessWorld(): void {
  keys.clear();
  pointer.inside = false;
  setSimulationSeed(undefined);
}

function validateTrialOptions(
  options: BalanceTrialOptions,
  stepSeconds: number,
): void {
  if (!Number.isFinite(options.seed)) {
    throw new Error("Balance trial seed must be finite.");
  }
  if (!Number.isFinite(options.maxWave) || options.maxWave <= 0) {
    throw new Error("Balance trial maxWave must be finite and greater than 0.");
  }
  if (!Number.isFinite(options.maxSeconds) || options.maxSeconds <= 0) {
    throw new Error("Balance trial maxSeconds must be finite and greater than 0.");
  }
  if (!Number.isFinite(stepSeconds) || stepSeconds <= 0) {
    throw new Error("Balance trial stepSeconds must be finite and greater than 0.");
  }
  if (stepSeconds > MAX_STEP_SECONDS) {
    throw new Error(`Balance trial stepSeconds must be at most ${MAX_STEP_SECONDS}.`);
  }
}

function spendPendingUpgrades(persona: BalancePersonaId): number {
  if (persona === "idle") return 0;

  let spent = 0;
  while (state.pendingUpgrades > 0) {
    const choices = pickUpgrades(3);
    if (!choices.length) break;
    applyUpgrade(selectUpgradeChoice(persona, choices));
    spent += 1;
  }
  return spent;
}

function selectUpgradeChoice(
  persona: BalancePersonaId,
  choices: UpgradeChoice[],
): UpgradeChoice {
  if (persona === "kiter" || persona === "optimizer") {
    return choices
      .slice()
      .sort(
        (a, b) =>
          upgradePriority(persona, a.upgrade.id) -
          upgradePriority(persona, b.upgrade.id),
      )[0]!;
  }
  return choices[0]!;
}

function upgradePriority(persona: BalancePersonaId, id: string): number {
  const priority =
    persona === "optimizer" ? OPTIMIZER_UPGRADE_PRIORITY : OFFENSIVE_UPGRADE_PRIORITY;
  const index = priority.indexOf(id);
  return index >= 0 ? index : priority.length;
}

function updatePersonaMovement(
  persona: BalancePersonaId,
  runtime: PersonaRuntime,
  elapsedSeconds: number,
): void {
  if (persona === "idle") {
    setMovement(0, 0);
    return;
  }

  if (persona === "panic") {
    if (elapsedSeconds >= runtime.nextDecisionSeconds) {
      const angle = runtime.rng() * Math.PI * 2;
      runtime.moveX = Math.cos(angle);
      runtime.moveY = Math.sin(angle);
      runtime.nextDecisionSeconds = elapsedSeconds + 0.28 + runtime.rng() * 0.24;
    }
    setMovement(runtime.moveX, runtime.moveY);
    return;
  }

  if (persona === "optimizer") {
    if (elapsedSeconds >= runtime.nextDecisionSeconds) {
      [runtime.moveX, runtime.moveY] = optimizerDirection(runtime);
      runtime.nextDecisionSeconds = elapsedSeconds + 0.11;
    }
    setAnalogMovement(runtime.moveX, runtime.moveY);
    return;
  }

  if (elapsedSeconds >= runtime.nextDecisionSeconds) {
    [runtime.moveX, runtime.moveY] = kiteDirection();
    runtime.nextDecisionSeconds = elapsedSeconds + 0.16;
  }
  setMovement(runtime.moveX, runtime.moveY);
}

function kiteDirection(): [number, number] {
  const pickup = nearestExperienceOrb();
  if (!enemies.length) {
    if (pickup) return [pickup.x - player.x, pickup.y - player.y];
    return [world.arenaWidth / 2 - player.x, world.arenaHeight / 2 - player.y];
  }

  let bestDirection: [number, number] = [0, 0];
  let bestScore = -Infinity;

  for (const [x, y] of KITE_DIRECTIONS) {
    const score = kiteCandidateScore(x, y, pickup);
    if (score > bestScore) {
      bestScore = score;
      bestDirection = [x, y];
    }
  }

  return bestDirection;
}

function optimizerDirection(runtime: PersonaRuntime): [number, number] {
  const pickup = nearestExperienceOrb();
  if (!enemies.length) {
    if (pickup) return [pickup.x - player.x, pickup.y - player.y];
    return [world.arenaWidth / 2 - player.x, world.arenaHeight / 2 - player.y];
  }

  const candidates = optimizerCandidateDirections(pickup);
  let bestDirection: [number, number] = [0, 0];
  let bestScore = -Infinity;

  for (const [x, y] of candidates) {
    const score = optimizerCandidateScore(x, y, pickup, runtime);
    if (score > bestScore) {
      bestScore = score;
      bestDirection = [x, y];
    }
  }

  return bestDirection;
}

function optimizerCandidateDirections(
  pickup: { x: number; y: number } | null,
): [number, number][] {
  const candidates = OPTIMIZER_DIRECTIONS.map(([x, y]) => [x, y] as [number, number]);
  const pressure = threatPressureDirection();
  if (pressure) {
    candidates.push(pressure);
    candidates.push([pressure[1], -pressure[0]]);
    candidates.push([-pressure[1], pressure[0]]);
  }

  if (pickup) {
    const pickupDirection = [pickup.x - player.x, pickup.y - player.y] as [number, number];
    candidates.push(pickupDirection);
    if (pressure) {
      candidates.push([
        pressure[0] * 0.78 + pickupDirection[0] * 0.22,
        pressure[1] * 0.78 + pickupDirection[1] * 0.22,
      ]);
    }
  }

  if (Math.hypot(player.vx, player.vy) > 1) {
    candidates.push([player.vx, player.vy]);
  }

  return candidates;
}

function threatPressureDirection(): [number, number] | null {
  let pressureX = 0;
  let pressureY = 0;

  for (const enemy of enemies) {
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;
    const roleWeight = enemy.role === "boss" ? 2.6 : enemy.role === "mini-boss" ? 1.8 : 1;
    const proximityWeight = roleWeight * (enemy.radius + enemy.speed * 0.45) / distance;
    pressureX += (dx / distance) * proximityWeight;
    pressureY += (dy / distance) * proximityWeight;
  }

  if (Math.hypot(pressureX, pressureY) < 0.001) return null;
  return [pressureX, pressureY];
}

function nearestExperienceOrb(): { x: number; y: number } | null {
  let nearest: { x: number; y: number } | null = null;
  let bestDistanceSq = Infinity;

  for (const orb of experienceOrbs) {
    const dx = orb.x - player.x;
    const dy = orb.y - player.y;
    const distanceSq = dx * dx + dy * dy;
    if (distanceSq < bestDistanceSq) {
      bestDistanceSq = distanceSq;
      nearest = orb;
    }
  }

  return nearest;
}

function kiteCandidateScore(
  directionX: number,
  directionY: number,
  pickup: { x: number; y: number } | null,
): number {
  const horizonSeconds = 0.72;
  const directionLength = Math.hypot(directionX, directionY) || 1;
  const nextX =
    player.x + (directionX / directionLength) * player.speed * horizonSeconds;
  const nextY =
    player.y + (directionY / directionLength) * player.speed * horizonSeconds;
  let score = 0;
  let nearestDistance = Infinity;

  for (const enemy of enemies) {
    const enemyAngle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
    const enemyX = enemy.x + Math.cos(enemyAngle) * enemy.speed * horizonSeconds;
    const enemyY = enemy.y + Math.sin(enemyAngle) * enemy.speed * horizonSeconds;
    const distance = Math.hypot(nextX - enemyX, nextY - enemyY);
    nearestDistance = Math.min(nearestDistance, distance);
    const dangerDistance = player.radius + enemy.radius + 70;
    if (distance < dangerDistance) {
      score -= (dangerDistance - distance) * 14;
    }
  }

  score += Math.min(nearestDistance, 900);
  score -= boundaryPenalty(nextX, nextY);

  if (pickup && nearestDistance > 520) {
    const pickupDistance = Math.hypot(nextX - pickup.x, nextY - pickup.y);
    score += Math.max(0, 560 - pickupDistance) * 0.35;
  }

  return score;
}

function optimizerCandidateScore(
  directionX: number,
  directionY: number,
  pickup: { x: number; y: number } | null,
  runtime: PersonaRuntime,
): number {
  const [normalX, normalY] = normalizeDirection(directionX, directionY);
  const lowHealthRatio = 1 - player.hp / Math.max(1, player.maxHp);
  let score = 0;
  let nearestProjectedDistance = Infinity;
  let worstDanger = 0;

  for (const horizonSeconds of OPTIMIZER_HORIZONS) {
    const nextX = player.x + normalX * player.speed * horizonSeconds;
    const nextY = player.y + normalY * player.speed * horizonSeconds;
    score -= boundaryPenalty(nextX, nextY) * (1.3 + horizonSeconds);

    for (const enemy of enemies) {
      const predicted = predictedEnemyPosition(enemy, nextX, nextY, horizonSeconds);
      const distance = Math.hypot(nextX - predicted.x, nextY - predicted.y);
      nearestProjectedDistance = Math.min(nearestProjectedDistance, distance);

      const contactDistance = player.radius + enemy.radius;
      const dangerDistance = contactDistance + 76 + enemy.speed * 0.22;
      const roleWeight = enemy.role === "boss" ? 2.8 : enemy.role === "mini-boss" ? 2 : 1;
      const damageWeight = 1 + enemy.damage / Math.max(1, player.maxHp);

      if (distance < contactDistance + 8) {
        worstDanger += (contactDistance + 8 - distance) * 420 * roleWeight * damageWeight;
      } else if (distance < dangerDistance) {
        const danger = dangerDistance - distance;
        worstDanger += danger * danger * 0.82 * roleWeight * damageWeight;
      }

      score += Math.min(distance, 860) * 0.018 * roleWeight;
    }
  }

  score -= worstDanger * (1.25 + lowHealthRatio);
  score += Math.min(nearestProjectedDistance, 920) * 0.92;

  if (pickup) {
    const pickupDistance = Math.hypot(player.x - pickup.x, player.y - pickup.y);
    const nextPickupDistance = Math.hypot(
      player.x + normalX * player.speed * 0.7 - pickup.x,
      player.y + normalY * player.speed * 0.7 - pickup.y,
    );
    const pickupSafety = nearestProjectedDistance > 440 ? 1 : 0.25;
    score += (pickupDistance - nextPickupDistance) * 0.9 * pickupSafety;
    score += Math.max(0, 520 - nextPickupDistance) * 0.16 * pickupSafety;
  }

  const currentSpeed = Math.hypot(player.vx, player.vy);
  if (currentSpeed > 1) {
    score += ((normalX * player.vx + normalY * player.vy) / currentSpeed) * 18;
  }

  return score + runtime.rng() * 0.0001;
}

function predictedEnemyPosition(
  enemy: (typeof enemies)[number],
  targetX: number,
  targetY: number,
  horizonSeconds: number,
): { x: number; y: number } {
  const angle = Math.atan2(targetY - enemy.y, targetX - enemy.x);
  return {
    x: enemy.x + Math.cos(angle) * enemy.speed * horizonSeconds,
    y: enemy.y + Math.sin(angle) * enemy.speed * horizonSeconds,
  };
}

function boundaryPenalty(x: number, y: number): number {
  const margin = player.radius + 120;
  let penalty = 0;
  if (x < margin) penalty += (margin - x) * 8;
  if (x > world.arenaWidth - margin) {
    penalty += (x - (world.arenaWidth - margin)) * 8;
  }
  if (y < margin) penalty += (margin - y) * 8;
  if (y > world.arenaHeight - margin) {
    penalty += (y - (world.arenaHeight - margin)) * 8;
  }
  return penalty;
}

function normalizeDirection(x: number, y: number): [number, number] {
  const length = Math.hypot(x, y);
  if (length < 0.1) return [0, 0];
  return [x / length, y / length];
}

function setMovement(x: number, y: number): void {
  keys.clear();
  pointer.inside = false;
  state.controlMode = "keyboard";
  const length = Math.hypot(x, y);
  if (length < 0.1) return;

  const nx = x / length;
  const ny = y / length;
  if (nx > 0.25) keys.add("KeyD");
  if (nx < -0.25) keys.add("KeyA");
  if (ny > 0.25) keys.add("KeyS");
  if (ny < -0.25) keys.add("KeyW");
}

function setAnalogMovement(x: number, y: number): void {
  keys.clear();
  const [nx, ny] = normalizeDirection(x, y);
  if (nx === 0 && ny === 0) {
    pointer.inside = false;
    state.controlMode = "keyboard";
    return;
  }

  state.controlMode = "trackpad";
  pointer.inside = true;
  pointer.x = player.x + nx * 420 - world.cameraX;
  pointer.y = player.y + ny * 420 - world.cameraY;
}

function personaSeedSalt(persona: BalancePersonaId): number {
  switch (persona) {
    case "idle":
      return 0x1d1e;
    case "panic":
      return 0x9a1c;
    case "kiter":
      return 0x71e5;
    case "optimizer":
      return 0x0f71;
  }
}

function median(values: number[]): number {
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle]!;
  return (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function variance(values: number[]): number {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const total = values.reduce((sum, value) => sum + (value - mean) ** 2, 0);
  return roundMetric(total / values.length);
}

function roundMetric(value: number): number {
  return Math.round(value * 1000) / 1000;
}

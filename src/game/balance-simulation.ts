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
import {
  currentAccountProgress,
  resetAccountProgress,
  restoreAccountProgress,
} from "../systems/account";

export type BalancePersonaId = "idle" | "panic" | "kiter";

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

export function runBalanceTrial(options: BalanceTrialOptions): BalanceTrialResult {
  const stepSeconds = options.stepSeconds ?? DEFAULT_STEP_SECONDS;
  validateTrialOptions(options, stepSeconds);
  const savedChallengeProgress = currentChallengeProgress();
  const savedChallengeTracking = isChallengeTrackingEnabled();
  const savedAccountProgress = currentAccountProgress();

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
    restoreChallengeProgress(savedChallengeProgress);
    restoreAccountProgress(savedAccountProgress);
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
  resetAccountProgress(null);
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
  if (persona === "kiter") {
    return choices
      .slice()
      .sort(
        (a, b) =>
          upgradePriority(a.upgrade.id) - upgradePriority(b.upgrade.id),
      )[0]!;
  }
  return choices[0]!;
}

function upgradePriority(id: string): number {
  const index = OFFENSIVE_UPGRADE_PRIORITY.indexOf(id);
  return index >= 0 ? index : OFFENSIVE_UPGRADE_PRIORITY.length;
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

function setMovement(x: number, y: number): void {
  keys.clear();
  const length = Math.hypot(x, y);
  if (length < 0.1) return;

  const nx = x / length;
  const ny = y / length;
  if (nx > 0.25) keys.add("KeyD");
  if (nx < -0.25) keys.add("KeyA");
  if (ny > 0.25) keys.add("KeyS");
  if (ny < -0.25) keys.add("KeyW");
}

function personaSeedSalt(persona: BalancePersonaId): number {
  switch (persona) {
    case "idle":
      return 0x1d1e;
    case "panic":
      return 0x9a1c;
    case "kiter":
      return 0x71e5;
  }
}

function median(values: number[]): number {
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle]!;
  return (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function roundMetric(value: number): number {
  return Math.round(value * 1000) / 1000;
}

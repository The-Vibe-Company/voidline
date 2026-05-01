import {
  bullets,
  chests,
  counters,
  enemies,
  experienceOrbs,
  floaters,
  particles,
  player,
  powerupOrbs,
  simulationPerfConfig,
  state,
  world,
} from "../state";
import { updateParticles } from "../entities/particles";
import {
  clearSimulationEvents,
  markChestReady,
  markGameOver,
  markHudDirty,
  markUpgradeReady,
} from "./events";
import {
  clearRustVisualState,
  createRustSimulation,
  resetRustSimulation,
  resizeRustSimulation,
  stepRustSimulation,
} from "./rust-engine";
import type { SimulationConfig, SimulationInputState } from "../types";
import { incrementChallengeProgress, recordChallengeProgress } from "../systems/challenges";

interface ChallengeSnapshot {
  totalKills: number;
  score: number;
  level: number;
  runElapsedSeconds: number;
  runBossStages: number;
}

export function createSimulation(config: SimulationConfig = {}): {
  resetSimulation: typeof resetSimulation;
  stepSimulation: typeof stepSimulation;
  getSimulationView: typeof getSimulationView;
} {
  applyPerfConfig(config);
  createRustSimulation(config);
  return {
    resetSimulation,
    stepSimulation,
    getSimulationView,
  };
}

export function applyPerfConfig(config: SimulationConfig): void {
  if (!config.perf) return;
  if (config.perf.targetFps !== undefined) {
    simulationPerfConfig.targetFps = config.perf.targetFps;
  }
  if (config.perf.targetFrameMs !== undefined) {
    simulationPerfConfig.targetFrameMs = config.perf.targetFrameMs;
  }
  if (config.perf.dprMax !== undefined) {
    simulationPerfConfig.dprMax = config.perf.dprMax;
  }
  Object.assign(simulationPerfConfig.budgets, config.perf.budgets);
}

export function resizeSimulation(width: number, height: number): void {
  resizeRustSimulation(width, height);
}

export function resetSimulation(seed?: number): void {
  clearSimulationEvents();
  resetRustSimulation(seed);
  clearRustVisualState();
  markHudDirty();
}

export function stepSimulation(dt: number, _input?: SimulationInputState): void {
  const cappedDt = Math.min(0.033, Math.max(0, dt));
  if (state.mode !== "playing") {
    updateParticles(cappedDt);
    return;
  }

  const previousMode = state.mode;
  const previousPendingUpgrades = state.pendingUpgrades;
  const previousPendingChests = state.pendingChests;
  const previousChallenge = captureChallengeSnapshot();

  stepRustSimulation(cappedDt);
  updateParticles(cappedDt);
  recordRustChallengeProgress(previousChallenge);

  if (state.pendingUpgrades > previousPendingUpgrades) {
    markUpgradeReady();
  }
  if (state.pendingChests > previousPendingChests) {
    markChestReady();
  }
  if (previousMode === "playing" && (state.mode as string) === "gameover") {
    markGameOver();
  }
}

function captureChallengeSnapshot(): ChallengeSnapshot {
  return {
    totalKills: totalKillsByKind(),
    score: state.score,
    level: state.level,
    runElapsedSeconds: state.runElapsedSeconds,
    runBossStages: state.runBossStages.length,
  };
}

function recordRustChallengeProgress(previous: ChallengeSnapshot): void {
  if (state.score > previous.score) {
    recordChallengeProgress("bestScore", state.score);
  }
  if (state.level > previous.level) {
    recordChallengeProgress("bestLevel", state.level);
  }
  if (state.runBossStages.length > previous.runBossStages) {
    incrementChallengeProgress("bossKills", state.runBossStages.length - previous.runBossStages);
  }
  if (Math.floor(state.runElapsedSeconds) > Math.floor(previous.runElapsedSeconds)) {
    recordChallengeProgress("bestSurvivalSeconds", state.runElapsedSeconds);
  }

  const killsDelta = totalKillsByKind() - previous.totalKills;
  if (killsDelta > 0) {
    incrementChallengeProgress("totalKills", killsDelta);
  }
}

function totalKillsByKind(): number {
  return Object.values(state.killsByKind).reduce((total, count) => total + count, 0);
}

export function getSimulationView(): {
  state: typeof state;
  player: typeof player;
  world: typeof world;
  enemies: typeof enemies;
  bullets: typeof bullets;
  experienceOrbs: typeof experienceOrbs;
  powerupOrbs: typeof powerupOrbs;
  chests: typeof chests;
  particles: typeof particles;
  floaters: typeof floaters;
  counters: typeof counters;
} {
  return {
    state,
    player,
    world,
    enemies,
    bullets,
    experienceOrbs,
    powerupOrbs,
    chests,
    particles,
    floaters,
    counters,
  };
}

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
  startRustSimulationWave,
  stepRustSimulation,
} from "./rust-engine";
import type { SimulationConfig, SimulationInputState } from "../types";
import { startingWaveForStage } from "../game/roguelike";
import { incrementChallengeProgress, recordChallengeProgress } from "../systems/challenges";

interface ChallengeSnapshot {
  wave: number;
  startStage: number;
  waveKills: number;
  waveDelay: number;
  score: number;
  level: number;
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

export function startSimulationWave(wave: number): void {
  const previous = captureChallengeSnapshot();
  startRustSimulationWave(wave);
  if (wave === previous.wave + 1) {
    recordChallengeProgress("bestWave", challengeWaveForRun(previous.wave, previous.startStage));
  }
  markHudDirty();
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
    wave: state.wave,
    startStage: state.startStage,
    waveKills: state.waveKills,
    waveDelay: state.waveDelay,
    score: state.score,
    level: state.level,
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

  const killsDelta =
    state.wave === previous.wave
      ? state.waveKills - previous.waveKills
      : Math.max(0, state.waveKills);
  if (killsDelta > 0) {
    incrementChallengeProgress("totalKills", killsDelta);
  }

  if (state.wave > previous.wave) {
    recordChallengeProgress("bestWave", challengeWaveForRun(previous.wave, previous.startStage));
  } else if (
    previous.waveDelay === 0 &&
    state.waveDelay > 0 &&
    state.spawnRemaining <= 0 &&
    enemies.length === 0
  ) {
    recordChallengeProgress("bestWave", challengeWaveForRun(state.wave, state.startStage));
  }
}

function challengeWaveForRun(wave: number, startStage: number): number {
  return Math.max(1, wave - startingWaveForStage(startStage) + 1);
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

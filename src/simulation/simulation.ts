import {
  bullets,
  chests,
  counters,
  enemies,
  experienceOrbs,
  floaters,
  ownedRelics,
  ownedUpgrades,
  particles,
  player,
  powerupOrbs,
  simulationPerfConfig,
  state,
  world,
} from "../state";
import {
  balance,
  createPlayerState,
  spawnGap,
  spawnPackChance,
  waveTarget,
  xpToNextLevel,
} from "../game/balance";
import { updateBullets } from "../entities/bullets";
import {
  spawnEnemy,
  spawnMiniBoss,
  spawnWaveBoss,
  updateEnemies,
} from "../entities/enemies";
import { resetChests, updateChests } from "../entities/chests";
import { updateExperience } from "../entities/experience";
import { updateParticles, burst } from "../entities/particles";
import { updatePlayer } from "../entities/player";
import { resetPowerups, updatePowerups } from "../entities/powerups";
import { clearSimulationEvents, markGameOver, markHudDirty } from "./events";
import { enemyGrid } from "./grids";
import { clearEntityPools, resetEntityCounters } from "./pools";
import { random, setSimulationSeed } from "./random";
import type { SimulationConfig, SimulationInputState } from "../types";
import { clamp } from "../utils";
import { isBossWave, nextMiniBossMisses, shouldSpawnMiniBoss } from "../game/roguelike";
import { recordChallengeProgress } from "../systems/challenges";
import { applyEquippedWeapon } from "../systems/account";

export function createSimulation(config: SimulationConfig = {}): {
  resetSimulation: typeof resetSimulation;
  stepSimulation: typeof stepSimulation;
  getSimulationView: typeof getSimulationView;
} {
  applyPerfConfig(config);
  setSimulationSeed(config.seed);
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
  world.dpr = Math.min(window.devicePixelRatio || 1, simulationPerfConfig.dprMax);
  world.width = Math.max(1, Math.floor(width));
  world.height = Math.max(1, Math.floor(height));
  world.arenaWidth = Math.max(3200, Math.round(world.width * 3.2));
  world.arenaHeight = Math.max(2200, Math.round(world.height * 3.2));

  if (!player.x || !player.y) {
    player.x = world.arenaWidth / 2;
    player.y = world.arenaHeight / 2;
  }
  player.x = clamp(player.x, player.radius + 8, world.arenaWidth - player.radius - 8);
  player.y = clamp(player.y, player.radius + 8, world.arenaHeight - player.radius - 8);
  updateCameraFromPlayer(true);
}

export function startSimulationWave(wave: number): void {
  state.mode = "playing";
  state.wave = wave;
  recordChallengeProgress("bestWave", wave);
  state.waveKills = 0;
  const bossWave = isBossWave(wave);
  const baseTarget = waveTarget(wave);
  const spawnMiniBossThisWave =
    !bossWave && shouldSpawnMiniBoss(wave, state.miniBossEligibleMisses, random());
  state.miniBossEligibleMisses = nextMiniBossMisses(
    wave,
    state.miniBossEligibleMisses,
    spawnMiniBossThisWave,
  );
  state.miniBossPending = spawnMiniBossThisWave;
  state.waveTarget = bossWave ? 1 : baseTarget + (spawnMiniBossThisWave ? 1 : 0);
  state.spawnRemaining = bossWave ? 0 : baseTarget;
  state.spawnGap = spawnGap(wave);
  state.spawnTimer = balance.wave.spawnTimerStart;
  state.waveDelay = 0;
  if (bossWave) {
    spawnWaveBoss();
  }
  markHudDirty();
}

export function resetSimulation(seed?: number): void {
  setSimulationSeed(seed);
  clearSimulationEvents();
  state.mode = "playing";
  state.wave = 1;
  state.score = 0;
  state.waveKills = 0;
  state.bestCombo = 0;
  state.miniBossEligibleMisses = 0;
  state.miniBossPending = false;
  state.level = 1;
  state.xp = 0;
  state.xpTarget = xpToNextLevel(state.level);
  state.pendingUpgrades = 0;
  state.pendingChests = 0;
  state.heartsCarried = 0;
  state.magnetsCarried = 0;
  state.bombsCarried = 0;
  state.runBossWaves = [];
  state.runRewardClaimed = false;

  Object.assign(
    player,
    createPlayerState({
      x: world.arenaWidth / 2,
      y: world.arenaHeight / 2,
      invuln: balance.player.resetInvulnerability,
    }),
  );
  applyEquippedWeapon(player);
  ownedUpgrades.clear();
  ownedRelics.clear();
  resetEntityCounters();
  enemies.length = 0;
  bullets.length = 0;
  experienceOrbs.length = 0;
  particles.length = 0;
  floaters.length = 0;
  powerupOrbs.length = 0;
  chests.length = 0;
  clearEntityPools();
  resetPowerups();
  resetChests();

  updateCameraFromPlayer(true);
  startSimulationWave(1);
}

function updateWave(dt: number): void {
  if (state.miniBossPending) {
    spawnMiniBoss();
    state.miniBossPending = false;
    markHudDirty();
  }

  state.spawnTimer -= dt;
  if (state.spawnRemaining > 0 && state.spawnTimer <= 0) {
    const pack = Math.min(
      state.spawnRemaining,
      random() < spawnPackChance(state.wave) ? 2 : 1,
    );
    for (let i = 0; i < pack; i += 1) {
      spawnEnemy();
    }
    state.spawnRemaining -= pack;
    state.spawnTimer = state.spawnGap * (0.72 + random() * 0.7);
    markHudDirty();
  }
}

export function stepSimulation(dt: number, _input?: SimulationInputState): void {
  const cappedDt = Math.min(0.033, Math.max(0, dt));
  world.time += cappedDt;
  world.shake = Math.max(0, world.shake - cappedDt * 18);

  if (state.mode !== "playing") {
    updateParticles(cappedDt);
    return;
  }

  updateWave(cappedDt);
  enemyGrid.rebuild(enemies);
  updatePlayer(cappedDt);
  updateBullets(cappedDt);
  updateEnemies(cappedDt);
  updateExperience(cappedDt);
  updatePowerups(cappedDt);
  updateChests(cappedDt);
  updateParticles(cappedDt);
  updateCameraFromPlayer(false);

  if (player.hp <= 0 && state.mode === "playing") {
    player.hp = 0;
    state.mode = "gameover";
    burst(player.x, player.y, "#39d9ff", 46, 280);
    world.shake = 22;
    markGameOver();
  }

  if (
    state.spawnRemaining <= 0 &&
    enemies.length === 0 &&
    state.mode === "playing"
  ) {
    state.waveDelay += cappedDt;
    if (state.waveDelay > balance.wave.waveDelay) {
      startSimulationWave(state.wave + 1);
    }
  }
}

export function updateCameraFromPlayer(snap = false): void {
  const targetX = clamp(
    player.x - world.width / 2,
    0,
    Math.max(0, world.arenaWidth - world.width),
  );
  const targetY = clamp(
    player.y - world.height / 2,
    0,
    Math.max(0, world.arenaHeight - world.height),
  );
  const follow = snap ? 1 : 0.16;
  world.cameraX += (targetX - world.cameraX) * follow;
  world.cameraY += (targetY - world.cameraY) * follow;
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

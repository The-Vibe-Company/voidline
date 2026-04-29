import {
  bullets,
  counters,
  enemies,
  experienceOrbs,
  floaters,
  ownedRelics,
  ownedUpgrades,
  particles,
  player,
  state,
  world,
} from "../state";
import {
  spawnEnemy,
  spawnMiniBoss,
  spawnWaveBoss,
  updateEnemies,
} from "../entities/enemies";
import { updateBullets } from "../entities/bullets";
import { resetChests, updateChests } from "../entities/chests";
import { updateExperience } from "../entities/experience";
import { updateParticles, burst } from "../entities/particles";
import { updatePlayer } from "../entities/player";
import { resetPowerups, updatePowerups } from "../entities/powerups";
import { updateCamera, updateStars } from "./camera";
import { hideOverlays, showGameOver, updateHud, updateLoadout } from "../render/hud";
import {
  balance,
  createPlayerState,
  spawnGap,
  spawnPackChance,
  waveTarget,
  xpToNextLevel,
} from "../game/balance";
import { isBossWave, nextMiniBossMisses, shouldSpawnMiniBoss } from "../game/roguelike";

export function startWave(wave: number): void {
  state.mode = "playing";
  state.wave = wave;
  state.waveKills = 0;
  const bossWave = isBossWave(wave);
  const baseTarget = waveTarget(wave);
  const spawnMiniBossThisWave =
    !bossWave && shouldSpawnMiniBoss(wave, state.miniBossEligibleMisses, Math.random());
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
  hideOverlays();
  updateHud();
}

export function resetGame(): void {
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

  Object.assign(
    player,
    createPlayerState({
      x: world.arenaWidth / 2,
      y: world.arenaHeight / 2,
      invuln: balance.player.resetInvulnerability,
    }),
  );
  ownedUpgrades.clear();
  ownedRelics.clear();
  counters.nextEnemyId = 1;
  enemies.length = 0;
  bullets.length = 0;
  experienceOrbs.length = 0;
  particles.length = 0;
  floaters.length = 0;
  resetPowerups();
  resetChests();

  hideOverlays();
  updateCamera(0, true);
  startWave(1);
  updateLoadout();
  updateHud();
}

function updateWave(dt: number): void {
  if (state.miniBossPending) {
    spawnMiniBoss();
    state.miniBossPending = false;
  }

  state.spawnTimer -= dt;
  if (state.spawnRemaining > 0 && state.spawnTimer <= 0) {
    const pack = Math.min(
      state.spawnRemaining,
      Math.random() < spawnPackChance(state.wave) ? 2 : 1,
    );
    for (let i = 0; i < pack; i += 1) {
      spawnEnemy();
    }
    state.spawnRemaining -= pack;
    state.spawnTimer = state.spawnGap * (0.72 + Math.random() * 0.7);
  }
}

export function update(dt: number): void {
  world.time += dt;
  world.shake = Math.max(0, world.shake - dt * 18);

  if (state.mode !== "playing") {
    updateParticles(dt);
    updateStars(dt);
    updateCamera(dt);
    return;
  }

  updateStars(dt);
  updatePlayer(dt);
  updateCamera(dt);
  updateWave(dt);
  updateBullets(dt);
  updateEnemies(dt);
  updateExperience(dt);
  updatePowerups(dt);
  updateChests(dt);
  updateParticles(dt);
  updateHud();

  if (player.hp <= 0) {
    player.hp = 0;
    burst(player.x, player.y, "#39d9ff", 46, 280);
    world.shake = 22;
    showGameOver();
  }

  if (
    state.spawnRemaining <= 0 &&
    enemies.length === 0 &&
    state.mode === "playing"
  ) {
    state.waveDelay += dt;
    if (state.waveDelay > balance.wave.waveDelay) {
      startWave(state.wave + 1);
    }
  }
}

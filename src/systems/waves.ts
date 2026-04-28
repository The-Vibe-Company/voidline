import {
  bullets,
  counters,
  enemies,
  experienceOrbs,
  floaters,
  ownedUpgrades,
  particles,
  player,
  state,
  world,
} from "../state";
import { spawnEnemy, updateEnemies } from "../entities/enemies";
import { updateBullets } from "../entities/bullets";
import { updateExperience } from "../entities/experience";
import { updateParticles, burst } from "../entities/particles";
import { updatePlayer } from "../entities/player";
import { updateCamera, updateStars } from "./camera";
import { hideOverlays, showGameOver, updateHud, updateLoadout } from "../render/hud";
import { xpToNextLevel } from "../utils";

export function startWave(wave: number): void {
  state.mode = "playing";
  state.wave = wave;
  state.waveKills = 0;
  state.waveTarget = Math.round(10 + wave * 4 + Math.pow(wave, 1.25));
  state.spawnRemaining = state.waveTarget;
  state.spawnGap = Math.max(0.18, 0.74 - wave * 0.04);
  state.spawnTimer = 0.7;
  state.waveDelay = 0;
  hideOverlays();
  updateHud();
}

export function resetGame(): void {
  state.mode = "playing";
  state.wave = 1;
  state.score = 0;
  state.waveKills = 0;
  state.bestCombo = 0;
  state.level = 1;
  state.xp = 0;
  state.xpTarget = xpToNextLevel(state.level);
  state.pendingUpgrades = 0;

  player.x = world.arenaWidth / 2;
  player.y = world.arenaHeight / 2;
  player.hp = 100;
  player.maxHp = 100;
  player.speed = 265;
  player.damage = 24;
  player.fireRate = 3;
  player.bulletSpeed = 610;
  player.projectileCount = 1;
  player.pierce = 0;
  player.drones = 0;
  player.shield = 0;
  player.shieldMax = 0;
  player.shieldRegen = 0;
  player.invuln = 1.2;
  player.fireTimer = 0;
  player.droneTimer = 0;
  player.vx = 0;
  player.vy = 0;
  ownedUpgrades.clear();
  counters.nextEnemyId = 1;
  enemies.length = 0;
  bullets.length = 0;
  experienceOrbs.length = 0;
  particles.length = 0;
  floaters.length = 0;

  hideOverlays();
  updateCamera(0, true);
  startWave(1);
  updateLoadout();
  updateHud();
}

function updateWave(dt: number): void {
  state.spawnTimer -= dt;
  if (state.spawnRemaining > 0 && state.spawnTimer <= 0) {
    const pack = Math.min(
      state.spawnRemaining,
      Math.random() < Math.min(0.52, state.wave * 0.035) ? 2 : 1,
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
    if (state.waveDelay > 1.1) {
      startWave(state.wave + 1);
    }
  }
}

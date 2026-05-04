import {
  attackTelegraphs,
  enemyBullets,
  experienceOrbs,
  player,
  state,
  world,
} from "../state";
import {
  isBossWave,
  waveDuration,
  waveSpawnBudget,
  xp as xpBalance,
} from "./balance";
import { clearRunEntities } from "./wave-loop";
import { applyMetaUpgradesToPlayer } from "./meta-upgrade-catalog";
import { accountProgress } from "../systems/account";
import { resetPlayerToBase } from "../state";
import { rerollShop } from "./shop";

export function startRun(): void {
  state.mode = "playing";
  state.wave = 1;
  state.score = 0;
  state.runCurrency = 0;
  state.carriedXp = 0;
  state.pendingCarry = 0;
  state.runElapsedSeconds = 0;
  state.highestWaveReached = 1;
  resetPlayerToBase();
  applyMetaUpgradesToPlayer(accountProgress, player);
  clearRunEntities();
  player.x = world.arenaWidth / 2;
  player.y = world.arenaHeight / 2;
  startWave(1);
}

export function startWave(waveNumber: number): void {
  state.wave = waveNumber;
  state.highestWaveReached = Math.max(state.highestWaveReached, waveNumber);
  state.waveTotalDuration = waveDuration(waveNumber);
  state.waveTimer = state.waveTotalDuration;
  const baseSpawns = waveSpawnBudget(waveNumber);
  state.spawnsRemaining = isBossWave(waveNumber) ? Math.max(2, Math.floor(baseSpawns / 2)) : baseSpawns;
  state.spawnTimer = 0.4;
  state.pendingCarry = state.carriedXp;
  state.carriedXp = 0;
  state.mode = "playing";
  player.invuln = 1;
}

export function transitionToShop(): void {
  // Carryover: 25% of uncollected XP value
  let leftover = 0;
  for (const orb of experienceOrbs) {
    leftover += orb.value;
  }
  state.carriedXp = Math.floor(leftover * xpBalance.carryRatio + state.pendingCarry);
  state.pendingCarry = 0;
  experienceOrbs.length = 0;
  enemyBullets.length = 0;
  attackTelegraphs.length = 0;
  rerollShop(true);
  state.mode = "shop";
}

export function advanceFromShop(): void {
  startWave(state.wave + 1);
}

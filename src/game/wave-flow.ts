import {
  attackTelegraphs,
  bullets,
  counters,
  enemies,
  enemyBullets,
  experienceOrbs,
  floaters,
  particles,
  player,
  resetPlayerToBase,
  spawnIndicators,
  state,
  world,
} from "../state";
import {
  MINI_WAVE_COUNT,
  MINI_WAVE_DURATION,
  isBossMiniWave,
  miniWaveSpawnBudget,
} from "./balance";
import { clearRunEntities } from "./wave-loop";
import { makeStarterWeapon, weaponCatalog } from "./weapon-catalog";
import {
  applyCardOfferToPlayer,
  rollCards,
} from "./card-catalog";
import { createRng, getDailySeedString, hashSeedString, type RngHandle } from "./daily-seed";
import type { CardOffer, WeaponArchetypeId } from "../types";

let activeRng: RngHandle = createRng(1);
let pendingOffers: readonly CardOffer[] | null = null;

export function getActiveRng(): RngHandle {
  return activeRng;
}

export function getPendingOffers(): readonly CardOffer[] | null {
  return pendingOffers;
}

/**
 * Probability of being offered a third card at the next pick, derived from the
 * cumulative ratio of XP collected over the maximum XP that could have been
 * obtained from every enemy spawned this run (including enemies the player
 * never killed). 100 % means full clear and full pickup -> always 3 cards.
 */
export function thirdCardChance(): number {
  if (state.xpMax <= 0) return 0;
  return Math.min(1, Math.max(0, state.xpCollected / state.xpMax));
}

export function dailyStarterWeapon(date: Date = new Date()): WeaponArchetypeId {
  const seed = getDailySeedString(date);
  const rng = createRng(hashSeedString(seed));
  return rng.pick(weaponCatalog).id;
}

export function startRun(starterWeaponId?: WeaponArchetypeId): void {
  const seed = getDailySeedString();
  state.dailySeed = seed;
  activeRng = createRng(hashSeedString(seed));
  const resolvedStarter = starterWeaponId ?? dailyStarterWeapon();

  state.mode = "playing";
  state.miniWaveIndex = 0;
  state.miniWaveCount = MINI_WAVE_COUNT;
  state.score = 0;
  state.kills = 0;
  state.xpCollected = 0;
  state.xpMax = 0;
  state.bossDefeated = false;
  state.bossFightStartedAt = 0;
  state.bossKillElapsed = 0;
  state.bossSpeedBonus = 0;
  state.bossHpBonus = 0;
  state.picksTaken = 0;
  state.runElapsedSeconds = 0;
  state.runStartedAt = Date.now();
  state.starterWeaponId = resolvedStarter;
  state.rngState = activeRng.state();
  resetPlayerToBase();
  player.activeWeapon = makeStarterWeapon(resolvedStarter);
  clearRunEntities();
  player.x = world.arenaWidth / 2;
  player.y = world.arenaHeight / 2;
  pendingOffers = null;
  startMiniWave(0);
}

export function startMiniWave(index: number): void {
  state.miniWaveIndex = index;
  state.waveTotalDuration = MINI_WAVE_DURATION;
  state.waveTimer = MINI_WAVE_DURATION;
  state.spawnsRemaining = miniWaveSpawnBudget(index);
  state.spawnTimer = 0.4;
  state.mode = "playing";
  player.invuln = 0.8;
  pendingOffers = null;
}

export function transitionToCardPick(): void {
  clearStageEntities();
  const chance = thirdCardChance();
  const cardCount: 2 | 3 = activeRng.next() < chance ? 3 : 2;
  pendingOffers = rollCards(activeRng, player, state.picksTaken, cardCount);
  state.rngState = activeRng.state();
  state.mode = "card-pick";
}

export function applyCardAndAdvance(cardIndex: number): void {
  if (!pendingOffers) return;
  const offer = pendingOffers[cardIndex];
  if (!offer) return;
  applyCardOfferToPlayer(offer, player, activeRng);
  state.picksTaken += 1;
  state.rngState = activeRng.state();
  pendingOffers = null;
  startMiniWave(state.miniWaveIndex + 1);
}

export function finishRunWithVictory(): void {
  state.bossDefeated = true;
  state.mode = "gameover";
}

export function isRunComplete(): boolean {
  return state.miniWaveIndex >= MINI_WAVE_COUNT;
}

export function isFinalMiniWave(): boolean {
  return isBossMiniWave(state.miniWaveIndex);
}

function clearStageEntities(): void {
  experienceOrbs.length = 0;
  enemies.length = 0;
  enemyBullets.length = 0;
  attackTelegraphs.length = 0;
  spawnIndicators.length = 0;
  bullets.length = 0;
  particles.length = 0;
  floaters.length = 0;
  state.enemiesAlive = 0;
  counters.nextEnemyId = 1;
  counters.nextEnemyBulletId = 1;
  counters.nextSpawnIndicatorId = 1;
  counters.nextBulletId = 1;
  counters.nextAttackTelegraphId = 1;
}

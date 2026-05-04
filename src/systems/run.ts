import { state, world } from "../state";
import { startRun } from "../game/wave-flow";
import { recordRun } from "./account";
import { hideOverlays, showCardPick, showGameOver, showHangar, updateHud } from "../render/hud";
import { stepWave } from "../game/wave-loop";
import { tickWorldFx } from "../game/hitstop";
import { submitEntry } from "../render/leaderboard";
import { getCachedSeed } from "../game/daily-seed";
import { postScore } from "./api";
import { getOrCreatePlayerId } from "./identity";
import type { WeaponArchetypeId } from "../types";

let runRewardClaimed = false;

export function beginRun(starterWeaponId?: WeaponArchetypeId): void {
  runRewardClaimed = false;
  world.hitstop = 0;
  world.timescale = 1;
  startRun(starterWeaponId);
  hideOverlays();
  updateHud();
}

export function update(realDt: number): void {
  if (state.mode !== "playing") return;
  const dt = tickWorldFx(realDt);
  if (dt > 0) {
    stepWave(dt);
  }
  const next = state.mode as string;
  if (next === "card-pick") {
    showCardPick();
  } else if (next === "gameover") {
    onGameOver();
  }
}

function onGameOver(): void {
  if (runRewardClaimed) return;
  runRewardClaimed = true;
  // miniWaveIndex is zero-based (0..5); the public count is 1..6.
  const reachedWave = state.miniWaveIndex + 1;
  recordRun({
    miniWaveReached: reachedWave,
    bossDefeated: state.bossDefeated,
    elapsedSeconds: state.runElapsedSeconds,
    score: state.score,
    kills: state.kills,
  });
  submitEntry({
    score: state.score,
    miniWave: reachedWave,
    bossDefeated: state.bossDefeated,
    starterWeaponId: state.starterWeaponId,
    elapsedSeconds: Math.floor(state.runElapsedSeconds),
    date: new Date().toISOString(),
    seed: state.dailySeed,
  });
  uploadScoreOnline(reachedWave);
  showGameOver();
}

function uploadScoreOnline(reachedWave: number): void {
  const cached = getCachedSeed();
  if (!cached || cached.source !== "server") return;
  postScore({
    player_id: getOrCreatePlayerId(),
    seed_date: cached.date,
    score: Math.max(0, Math.floor(state.score)),
    mini_wave: reachedWave,
    run_seconds: Math.max(0, state.runElapsedSeconds),
    boss_defeated: state.bossDefeated,
    starter_weapon: state.starterWeaponId,
  }).catch(() => {});
}

export { showHangar };

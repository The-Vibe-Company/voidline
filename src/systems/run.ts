import { state, world } from "../state";
import { startRun } from "../game/wave-flow";
import { recordRun } from "./account";
import { hideOverlays, showCardPick, showGameOver, showHangar, updateHud } from "../render/hud";
import { stepWave } from "../game/wave-loop";
import { tickWorldFx } from "../game/hitstop";
import { submitEntry } from "../render/leaderboard";
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
  recordRun({
    miniWaveReached: state.miniWaveIndex + (state.bossDefeated ? 1 : 0),
    bossDefeated: state.bossDefeated,
    elapsedSeconds: state.runElapsedSeconds,
    score: state.score,
    kills: state.kills,
  });
  submitEntry({
    score: state.score,
    miniWave: state.miniWaveIndex + (state.bossDefeated ? 1 : 0),
    bossDefeated: state.bossDefeated,
    starterWeaponId: state.starterWeaponId,
    elapsedSeconds: Math.floor(state.runElapsedSeconds),
    date: new Date().toISOString(),
    seed: state.dailySeed,
  });
  showGameOver();
}

export { showHangar };

import { state } from "../state";
import { startRun } from "../game/wave-flow";
import { awardRunCrystals } from "./account";
import { hideOverlays, showGameOver, showHangar, showShop, updateHud } from "../render/hud";
import { stepWave } from "../game/wave-loop";
import { resetShopState } from "../game/shop";
import type { WeaponArchetypeId } from "../types";

let runRewardClaimed = false;

export function beginRun(starterWeaponId: WeaponArchetypeId = "pulse"): void {
  runRewardClaimed = false;
  resetShopState();
  startRun(starterWeaponId);
  hideOverlays();
  updateHud();
}

export function update(dt: number): void {
  if (state.mode !== "playing") return;
  stepWave(dt);
  const next = state.mode as string;
  if (next === "shop") {
    showShop();
  } else if (next === "gameover") {
    onGameOver();
  }
}

function onGameOver(): void {
  if (runRewardClaimed) return;
  runRewardClaimed = true;
  awardRunCrystals({
    wave: state.highestWaveReached,
    elapsedSeconds: state.runElapsedSeconds,
    score: state.score,
  });
  showGameOver();
}

export { showHangar };

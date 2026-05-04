import {
  bindHudEvents,
  renderHangar,
  setControlMode,
  setStartRunHandler,
  showHangar,
  updateHud,
} from "./render/hud";
import { bindInput } from "./game/input";
import { initializeAccountProgress, resetAccountProgress } from "./systems/account";
import { beginRun } from "./systems/run";
import { createVoidlineGame } from "./phaser/game";
import { bootstrapDailySeed } from "./game/daily-seed";
import { fetchDailySeed, upsertPlayer } from "./systems/api";
import { getAlias, getOrCreatePlayerId } from "./systems/identity";

initializeAccountProgress();
setControlMode("keyboard");
setStartRunHandler((id) => beginRun(id));
bindHudEvents(
  () => beginRun(),
  showHangar,
  () => {
    resetAccountProgress();
    renderHangar();
  },
);
bindInput();
showHangar();
updateHud();
createVoidlineGame();

void (async () => {
  await bootstrapDailySeed(() => fetchDailySeed());
  // Refresh hangar so the new server seed (and pool) shows up.
  renderHangar();
  // Sync identity in the background (best-effort).
  const playerId = getOrCreatePlayerId();
  upsertPlayer(playerId, getAlias()).catch(() => {});
})();

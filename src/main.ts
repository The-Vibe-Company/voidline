import { bindHudEvents, renderHangar, setControlMode, showHangar, updateHud } from "./render/hud";
import { bindInput } from "./game/input";
import { initializeAccountProgress, resetAccountProgress } from "./systems/account";
import { beginRun } from "./systems/run";
import { createVoidlineGame } from "./phaser/game";

initializeAccountProgress();
setControlMode("keyboard");
bindHudEvents(beginRun, showHangar, () => {
  resetAccountProgress();
  renderHangar();
});
bindInput();
showHangar();
updateHud();
createVoidlineGame();

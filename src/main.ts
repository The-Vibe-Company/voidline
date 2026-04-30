import {
  bindMenuNavigation,
  initOverlayFocusScope,
  initPickupZonesToggle,
  setControlMode,
  updateHud,
} from "./render/hud";
import { bindCockpit } from "./render/hangar";
import { bindInput } from "./game/input";
import { bindPerfOverlay } from "./render/perf-overlay";
import { maybeStartStressMode } from "./perf/stress-mode";
import { initializeRelicUnlocks } from "./systems/relics";
import { initializeChallenges } from "./systems/challenges";
import { initializeAccountProgress } from "./systems/account";
import { createSimulation } from "./simulation/simulation";
import { createVoidlineGame } from "./phaser/game";

createSimulation();
setControlMode("keyboard");
initPickupZonesToggle();
initializeRelicUnlocks();
initializeChallenges();
initializeAccountProgress();
initOverlayFocusScope();
bindCockpit();
bindMenuNavigation();
updateHud();
bindInput();
bindPerfOverlay();
document.querySelector<HTMLButtonElement>("#startButton")?.focus();
createVoidlineGame();
maybeStartStressMode();

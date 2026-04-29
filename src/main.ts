import {
  initOverlayFocusScope,
  initPickupZonesToggle,
  setControlMode,
  updateHud,
} from "./render/hud";
import { bindInput } from "./game/input";
import { bindPerfOverlay } from "./render/perf-overlay";
import { maybeStartStressMode } from "./perf/stress-mode";
import { initializeRelicUnlocks } from "./systems/relics";
import { createSimulation } from "./simulation/simulation";
import { createVoidlineGame } from "./phaser/game";

createSimulation();
setControlMode("keyboard");
initPickupZonesToggle();
initializeRelicUnlocks();
initOverlayFocusScope();
updateHud();
bindInput();
bindPerfOverlay();
document.querySelector<HTMLButtonElement>("#startButton")?.focus();
createVoidlineGame();
maybeStartStressMode();

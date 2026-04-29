import { resize } from "./systems/camera";
import { initPickupZonesToggle, setControlMode, updateHud } from "./render/hud";
import { bindInput } from "./game/input";
import { startLoop } from "./game/loop";
import { bindPerfOverlay } from "./render/perf-overlay";
import { maybeStartStressMode } from "./perf/stress-mode";
import { initializeRelicUnlocks } from "./systems/relics";

window.addEventListener("resize", resize);

resize();
setControlMode("keyboard");
initPickupZonesToggle();
initializeRelicUnlocks();
updateHud();
bindInput();
bindPerfOverlay();
document.querySelector<HTMLButtonElement>("#startButton")?.focus();
maybeStartStressMode();
startLoop();

import { resize } from "./systems/camera";
import { setControlMode, updateHud } from "./render/hud";
import { bindInput } from "./game/input";
import { startLoop } from "./game/loop";
import { bindPerfOverlay } from "./render/perf-overlay";
import { maybeStartStressMode } from "./perf/stress-mode";

window.addEventListener("resize", resize);

resize();
setControlMode("keyboard");
updateHud();
bindInput();
bindPerfOverlay();
document.querySelector<HTMLButtonElement>("#startButton")?.focus();
maybeStartStressMode();
startLoop();

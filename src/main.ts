import { resize } from "./systems/camera";
import { initPickupZonesToggle, setControlMode, updateHud } from "./render/hud";
import { bindInput } from "./game/input";
import { startLoop } from "./game/loop";

window.addEventListener("resize", resize);

resize();
setControlMode("keyboard");
initPickupZonesToggle();
updateHud();
bindInput();
document.querySelector<HTMLButtonElement>("#startButton")?.focus();
startLoop();

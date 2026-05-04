import { canvas, keys, pointer, state } from "../state";
import {
  pauseGame,
  resumeGame,
  setControlMode,
  showHangar,
  showWeaponPicker,
} from "../render/hud";
import { beginRun } from "../systems/run";

export function bindInput(): void {
  window.addEventListener("keydown", (event) => {
    const movementCodes = [
      "ArrowUp",
      "ArrowRight",
      "ArrowDown",
      "ArrowLeft",
      "KeyW",
      "KeyA",
      "KeyS",
      "KeyD",
      "KeyZ",
      "KeyQ",
    ];
    const movement = movementCodes.includes(event.code);
    const action = event.code === "Enter" || event.code === "Space";
    const pause = event.code === "Escape" || event.code === "KeyP";

    if (movement || action || pause) event.preventDefault();

    const active = document.activeElement as HTMLElement | null;
    if (action && active?.matches("button, [role='button'], input, select, textarea, a[href]")) {
      active.click();
      return;
    }

    if (state.mode === "menu" && action) {
      showWeaponPicker((defId) => beginRun(defId));
      return;
    }
    if (state.mode === "gameover" && action) {
      showHangar();
      return;
    }
    if (state.mode === "paused" && (action || pause)) {
      resumeGame();
      return;
    }
    if (state.mode === "playing" && pause) {
      pauseGame();
      return;
    }
    if (state.mode === "playing" && movement) {
      setControlMode("keyboard");
      keys.add(event.code);
    }
  });

  window.addEventListener("keyup", (event) => {
    keys.delete(event.code);
  });

  function syncPointer(event: PointerEvent): void {
    const rect = canvas.getBoundingClientRect();
    pointer.x = event.clientX - rect.left;
    pointer.y = event.clientY - rect.top;
    pointer.inside = true;
  }
  canvas.addEventListener("pointermove", syncPointer);
  canvas.addEventListener("pointerenter", () => {
    pointer.inside = true;
  });
  canvas.addEventListener("pointerleave", () => {
    pointer.inside = false;
  });
  canvas.addEventListener("pointerdown", (event) => {
    syncPointer(event);
    if (state.mode === "playing") setControlMode("trackpad");
  });
}

import { canvas, keys, pointer, state } from "../state";
import {
  getControlButtons,
  moveUpgradeFocus,
  pauseGame,
  resumeGame,
  selectUpgradeByIndex,
  setControlMode,
} from "../render/hud";
import { resetGame } from "../systems/waves";

function choiceIndexFromKey(code: string): number {
  if (code.startsWith("Digit")) return Number(code.slice(5));
  if (code.startsWith("Numpad")) return Number(code.slice(6));
  return 0;
}

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
    ];
    const movement = movementCodes.includes(event.code);
    const action = event.code === "Enter" || event.code === "Space";
    const pause = event.code === "Escape" || event.code === "KeyP";

    if (movement || action || pause) {
      event.preventDefault();
    }

    if (event.code === "KeyT") {
      setControlMode(state.controlMode === "keyboard" ? "trackpad" : "keyboard");
      return;
    }

    const active = document.activeElement as HTMLElement | null;
    if (action && active?.matches("[data-control-mode]")) {
      active.click();
      return;
    }

    if (state.mode === "menu" && action) {
      resetGame();
      return;
    }

    if (state.mode === "gameover" && action) {
      resetGame();
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

    if (state.mode === "upgrade") {
      const choiceIndex = choiceIndexFromKey(event.code);
      if (choiceIndex && selectUpgradeByIndex(choiceIndex)) {
        return;
      }

      if (event.code === "ArrowRight" || event.code === "ArrowDown") {
        moveUpgradeFocus(1);
        return;
      }

      if (event.code === "ArrowLeft" || event.code === "ArrowUp") {
        moveUpgradeFocus(-1);
        return;
      }

      if (action && active?.classList.contains("upgrade-card")) {
        active.click();
      }
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

  canvas.addEventListener("pointermove", (event) => {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.inside = true;
  });

  canvas.addEventListener("pointerenter", () => {
    pointer.inside = true;
  });

  canvas.addEventListener("pointerleave", () => {
    pointer.inside = false;
  });

  canvas.addEventListener("pointerdown", (event) => {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.inside = true;
    if (state.mode === "playing") {
      setControlMode("trackpad");
    }
  });

  document
    .querySelector<HTMLButtonElement>("#startButton")
    ?.addEventListener("click", resetGame);
  document
    .querySelector<HTMLButtonElement>("#restartButton")
    ?.addEventListener("click", resetGame);
  document
    .querySelector<HTMLButtonElement>("#resumeButton")
    ?.addEventListener("click", resumeGame);
  for (const button of getControlButtons()) {
    button.addEventListener("click", () => {
      const mode = button.dataset.controlMode;
      if (mode === "keyboard" || mode === "trackpad") {
        setControlMode(mode);
      }
    });
  }
}

import { canvas, keys, pointer, state } from "../state";
import {
  getControlButtons,
  moveRelicFocus,
  moveUpgradeFocus,
  pauseGame,
  resumeGame,
  selectRelicByIndex,
  selectUpgradeByIndex,
  setControlMode,
  showHangar,
  updateChallengePanels,
  updateHangarPanels,
  updateHud,
} from "../render/hud";
import { resetGame } from "../systems/waves";
import { resetChallengeProgress } from "../systems/challenges";
import { resetAccountProgress } from "../systems/account";
import { resetRelicUnlocks } from "../systems/relics";

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
      "KeyZ",
      "KeyQ",
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

    if (
      action &&
      active?.matches("button, [role='button'], input, select, textarea, a[href]")
    ) {
      active.click();
      return;
    }

    if (state.mode === "menu" && action) {
      const hangarActive = document
        .querySelector<HTMLElement>("#hangarOverlay")
        ?.classList.contains("active");
      if (hangarActive) {
        resetGame();
      }
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

    if (state.mode === "upgrade") {
      if (event.code === "Tab") {
        event.preventDefault();
        moveUpgradeFocus(event.shiftKey ? -1 : 1);
        return;
      }

      const choiceIndex = choiceIndexFromKey(event.code);
      if (choiceIndex && selectUpgradeByIndex(choiceIndex)) {
        return;
      }

      if (
        event.code === "ArrowRight" ||
        event.code === "ArrowDown" ||
        event.code === "KeyD" ||
        event.code === "KeyS"
      ) {
        moveUpgradeFocus(1);
        return;
      }

      if (
        event.code === "ArrowLeft" ||
        event.code === "ArrowUp" ||
        event.code === "KeyA" ||
        event.code === "KeyQ" ||
        event.code === "KeyW" ||
        event.code === "KeyZ"
      ) {
        moveUpgradeFocus(-1);
        return;
      }

      if (action && active?.classList.contains("upgrade-card")) {
        active.click();
      }
      return;
    }

    if (state.mode === "chest") {
      if (event.code === "Tab") {
        event.preventDefault();
        moveRelicFocus(event.shiftKey ? -1 : 1);
        return;
      }

      const choiceIndex = choiceIndexFromKey(event.code);
      if (choiceIndex && selectRelicByIndex(choiceIndex)) {
        return;
      }

      if (
        event.code === "ArrowRight" ||
        event.code === "ArrowDown" ||
        event.code === "KeyD" ||
        event.code === "KeyS"
      ) {
        moveRelicFocus(1);
        return;
      }

      if (
        event.code === "ArrowLeft" ||
        event.code === "ArrowUp" ||
        event.code === "KeyA" ||
        event.code === "KeyQ" ||
        event.code === "KeyW" ||
        event.code === "KeyZ"
      ) {
        moveRelicFocus(-1);
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
    ?.addEventListener("click", showHangar);
  document
    .querySelector<HTMLButtonElement>("#resetChallengesButton")
    ?.addEventListener("click", () => {
      if (!window.confirm("Reinitialiser la progression de compte ?")) return;
      resetChallengeProgress();
      resetAccountProgress();
      resetRelicUnlocks();
      updateChallengePanels();
      updateHangarPanels();
      updateHud();
    });
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

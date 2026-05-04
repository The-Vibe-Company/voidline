import { canvas, keys, pointer, state } from "../state";
import {
  pauseGame,
  pickCardByIndex,
  resumeGame,
  setControlMode,
  showHangar,
} from "../render/hud";
import { beginRun } from "../systems/run";

export function bindInput(): void {
  window.addEventListener("keydown", (event) => {
    const active = document.activeElement as HTMLElement | null;
    const isTextField =
      !!active &&
      (active.matches("input, textarea, select, [contenteditable=''], [contenteditable='true']"));
    // Let text fields receive their keys normally — gameplay shortcuts pause while typing.
    if (isTextField) {
      if (event.code === "Escape") active.blur();
      return;
    }

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
    const noModifier = !event.ctrlKey && !event.metaKey && !event.altKey;
    const inCardPick = state.mode === "card-pick";
    const card1 = inCardPick && noModifier && (event.code === "Digit1" || event.code === "Numpad1");
    const card2 = inCardPick && noModifier && (event.code === "Digit2" || event.code === "Numpad2");
    const card3 = inCardPick && noModifier && (event.code === "Digit3" || event.code === "Numpad3");

    if (movement || action || pause || card1 || card2 || card3) event.preventDefault();

    if (action && active?.matches("button, [role='button'], a[href]")) {
      active.click();
      return;
    }

    if (state.mode === "menu" && action) {
      beginRun();
      return;
    }
    if (state.mode === "gameover" && action) {
      beginRun();
      return;
    }
    if (state.mode === "gameover" && event.code === "KeyH") {
      showHangar();
      return;
    }
    if (state.mode === "card-pick") {
      if (card1) {
        pickCardByIndex(0);
        return;
      }
      if (card2) {
        pickCardByIndex(1);
        return;
      }
      if (card3) {
        pickCardByIndex(2);
        return;
      }
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

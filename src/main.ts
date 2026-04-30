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
import { initializeRustSimulationEngine } from "./simulation/rust-engine";
import { createVoidlineGame } from "./phaser/game";

const startButton = document.querySelector<HTMLButtonElement>("#startButton");
if (startButton) {
  startButton.disabled = true;
  startButton.setAttribute("aria-busy", "true");
}

try {
  await initializeRustSimulationEngine();
  if (startButton) {
    startButton.disabled = false;
    startButton.removeAttribute("aria-busy");
  }
  setControlMode("keyboard");
  initPickupZonesToggle();
  initializeAccountProgress();
  initializeRelicUnlocks();
  initializeChallenges();
  createSimulation();
  initOverlayFocusScope();
  bindCockpit();
  bindMenuNavigation();
  updateHud();
  bindInput();
  bindPerfOverlay();
  startButton?.focus();
  createVoidlineGame();
  maybeStartStressMode();
} catch (error) {
  showBootError(error);
}

function showBootError(error: unknown): void {
  console.error("Unable to initialize Rust gameplay engine", error);
  const launchPanel = document.querySelector<HTMLElement>(".hangar-launch");
  if (!launchPanel) return;

  launchPanel.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
    button.disabled = true;
  });
  if (startButton) {
    startButton.textContent = "MOTEUR INDISPONIBLE";
    startButton.removeAttribute("aria-busy");
  }
  const hint = launchPanel.querySelector<HTMLElement>(".hangar-launch-hint");
  if (hint) hint.textContent = "rechargement requis";

  const message = document.createElement("div");
  message.className = "hangar-engine-error";
  message.setAttribute("role", "alert");
  message.setAttribute("aria-live", "assertive");

  const copy = document.createElement("span");
  copy.textContent = "Le moteur Rust n'a pas pu demarrer.";

  const retry = document.createElement("button");
  retry.type = "button";
  retry.className = "hangar-engine-retry";
  retry.textContent = "Recharger";
  retry.addEventListener("click", () => window.location.reload());

  message.append(copy, retry);
  launchPanel.append(message);
  retry.focus();
}

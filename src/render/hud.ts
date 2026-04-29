import { ownedUpgrades, player, state } from "../state";
import { clamp } from "../utils";
import { applyUpgrade, pickUpgrades } from "../systems/upgrades";
import type { ControlMode } from "../types";

const hud = {
  wave: document.querySelector<HTMLElement>("#waveValue")!,
  kills: document.querySelector<HTMLElement>("#killsValue")!,
  target: document.querySelector<HTMLElement>("#targetValue")!,
  level: document.querySelector<HTMLElement>("#levelValue")!,
  xp: document.querySelector<HTMLElement>("#xpValue")!,
  xpBar: document.querySelector<HTMLElement>("#xpBar")!,
  score: document.querySelector<HTMLElement>("#scoreValue")!,
  health: document.querySelector<HTMLElement>("#healthBar")!,
  stats: {
    level: document.querySelector<HTMLElement>("#statLevel")!,
    xp: document.querySelector<HTMLElement>("#statXp")!,
    hull: document.querySelector<HTMLElement>("#statHull")!,
    damage: document.querySelector<HTMLElement>("#statDamage")!,
    fireRate: document.querySelector<HTMLElement>("#statFireRate")!,
    volley: document.querySelector<HTMLElement>("#statVolley")!,
    speed: document.querySelector<HTMLElement>("#statSpeed")!,
    pierce: document.querySelector<HTMLElement>("#statPierce")!,
    drones: document.querySelector<HTMLElement>("#statDrones")!,
    shield: document.querySelector<HTMLElement>("#statShield")!,
    crit: document.querySelector<HTMLElement>("#statCrit")!,
    lifesteal: document.querySelector<HTMLElement>("#statLifesteal")!,
    magnet: document.querySelector<HTMLElement>("#statMagnet")!,
    caliber: document.querySelector<HTMLElement>("#statCaliber")!,
  },
  loadout: document.querySelector<HTMLElement>("#loadout")!,
  itemHeart: document.querySelector<HTMLElement>("#itemHeart")!,
  itemMagnet: document.querySelector<HTMLElement>("#itemMagnet")!,
  itemBomb: document.querySelector<HTMLElement>("#itemBomb")!,
  itemHeartCell: document.querySelector<HTMLElement>(".item-cell[data-kind='heart']")!,
  itemMagnetCell: document.querySelector<HTMLElement>(".item-cell[data-kind='magnet']")!,
  itemBombCell: document.querySelector<HTMLElement>(".item-cell[data-kind='bomb']")!,
  startOverlay: document.querySelector<HTMLElement>("#startOverlay")!,
  upgradeOverlay: document.querySelector<HTMLElement>("#upgradeOverlay")!,
  pauseOverlay: document.querySelector<HTMLElement>("#pauseOverlay")!,
  gameOverOverlay: document.querySelector<HTMLElement>("#gameOverOverlay")!,
  upgradeTitle: document.querySelector<HTMLElement>("#upgradeTitle")!,
  upgradeGrid: document.querySelector<HTMLElement>("#upgradeGrid")!,
  controlButtons: [
    ...document.querySelectorAll<HTMLButtonElement>("[data-control-mode]"),
  ],
  finalScore: document.querySelector<HTMLElement>("#finalScore")!,
  finalWave: document.querySelector<HTMLElement>("#finalWave")!,
};

let upgradeReturnFocus: HTMLElement | null = null;

export function getControlButtons(): HTMLButtonElement[] {
  return hud.controlButtons;
}

export function getUpgradeGrid(): HTMLElement {
  return hud.upgradeGrid;
}

export function hideOverlays(): void {
  hud.startOverlay.classList.remove("active");
  hud.upgradeOverlay.classList.remove("active");
  hud.pauseOverlay.classList.remove("active");
  hud.gameOverOverlay.classList.remove("active");
  setUpgradeFocusScope(false);
}

function setUpgradeFocusScope(active: boolean): void {
  for (const element of document.querySelectorAll<HTMLElement>(
    ".game-shell > :not(#upgradeOverlay)",
  )) {
    element.toggleAttribute("inert", active);
    if (active) {
      element.setAttribute("aria-hidden", "true");
    } else {
      element.removeAttribute("aria-hidden");
    }
  }
}

function rememberFocusBeforeUpgrade(): void {
  const active = document.activeElement;
  if (active instanceof HTMLElement && !hud.upgradeOverlay.contains(active)) {
    upgradeReturnFocus = active;
  }
}

function restoreFocusAfterUpgrade(): void {
  const target = upgradeReturnFocus;
  upgradeReturnFocus = null;
  if (target?.isConnected && target.getClientRects().length > 0) {
    target.focus({ preventScroll: true });
  }
}

export function updateLoadout(): void {
  hud.loadout.innerHTML = "";
  for (const owned of ownedUpgrades.values()) {
    const { upgrade, tier, count } = owned;
    const chip = document.createElement("span");
    chip.className = "loadout-chip";
    chip.dataset.tier = tier.id;
    chip.style.setProperty("--tier-color", tier.color);
    chip.textContent = `${upgrade.icon} ${tier.short} x${count}`;
    hud.loadout.appendChild(chip);
  }
}

function updateItemBar(): void {
  hud.itemHeart.textContent = String(state.heartsCarried);
  hud.itemMagnet.textContent = String(state.magnetsCarried);
  hud.itemBomb.textContent = String(state.bombsCarried);
  hud.itemHeartCell.dataset.zero = state.heartsCarried === 0 ? "true" : "false";
  hud.itemMagnetCell.dataset.zero = state.magnetsCarried === 0 ? "true" : "false";
  hud.itemBombCell.dataset.zero = state.bombsCarried === 0 ? "true" : "false";
}

function updateStats(): void {
  hud.stats.level.textContent = String(state.level);
  hud.stats.xp.textContent = `${Math.floor(state.xp)}/${state.xpTarget}`;
  hud.stats.hull.textContent = `${Math.max(0, Math.ceil(player.hp))}/${Math.round(player.maxHp)}`;
  hud.stats.damage.textContent = String(Math.round(player.damage));
  hud.stats.fireRate.textContent = `${player.fireRate.toFixed(1)}/s`;
  hud.stats.volley.textContent = String(player.projectileCount);
  hud.stats.speed.textContent = String(Math.round(player.speed));
  hud.stats.pierce.textContent = String(player.pierce);
  hud.stats.drones.textContent = String(player.drones);
  hud.stats.shield.textContent =
    player.shieldMax > 0
      ? `${Math.max(0, Math.ceil(player.shield))}/${Math.round(player.shieldMax)}`
      : "0";
  hud.stats.crit.textContent = `${Math.round(player.critChance * 100)}%`;
  hud.stats.lifesteal.textContent = player.lifesteal.toFixed(1);
  hud.stats.magnet.textContent = `x${player.pickupRadius.toFixed(2)}`;
  hud.stats.caliber.textContent = `x${player.bulletRadius.toFixed(2)}`;
}

export function updateHud(): void {
  hud.wave.textContent = String(state.wave);
  hud.kills.textContent = String(state.waveKills);
  hud.target.textContent = String(state.waveTarget);
  hud.level.textContent = String(state.level);
  hud.xp.textContent = `${Math.floor(state.xp)}/${state.xpTarget} XP`;
  hud.xpBar.style.width = `${clamp(state.xp / state.xpTarget, 0, 1) * 100}%`;
  hud.score.textContent = Math.floor(state.score).toLocaleString("fr-FR");
  const hpPct = clamp(player.hp / player.maxHp, 0, 1);
  hud.health.style.width = `${hpPct * 100}%`;
  hud.health.style.background =
    hpPct > 0.38
      ? "linear-gradient(90deg, #72ffb1, #39d9ff)"
      : "linear-gradient(90deg, #ff5a69, #ffbf47)";
  updateStats();
  updateItemBar();
}

export function showUpgrade(): void {
  if (state.mode !== "upgrade") {
    rememberFocusBeforeUpgrade();
  }
  state.mode = "upgrade";
  state.pendingUpgrades = Math.max(1, state.pendingUpgrades);
  hud.upgradeTitle.textContent =
    state.pendingUpgrades > 1
      ? `Niveau ${state.level} atteint - ${state.pendingUpgrades} upgrades`
      : `Niveau ${state.level} atteint`;
  hud.upgradeGrid.innerHTML = "";

  const choices = pickUpgrades(3);
  for (const [index, choice] of choices.entries()) {
    const { upgrade, tier } = choice;
    const choiceId = `upgrade-choice-${index + 1}`;
    const tierId = `${choiceId}-tier`;
    const titleId = `${choiceId}-title`;
    const descriptionId = `${choiceId}-description`;
    const effectId = `${choiceId}-effect`;
    const card = document.createElement("button");
    card.className = "upgrade-card";
    card.type = "button";
    card.dataset.choiceIndex = String(index + 1);
    card.dataset.tier = tier.id;
    card.setAttribute("aria-labelledby", `${choiceId} ${titleId} ${tierId}`);
    card.setAttribute("aria-describedby", `${descriptionId} ${effectId}`);
    card.style.setProperty("--tier-color", tier.color);
    card.style.setProperty("--tier-glow", tier.glow);
    card.innerHTML = `
      <span class="sr-only" id="${choiceId}">Choix ${index + 1}</span>
      <span class="choice-key" aria-hidden="true">${index + 1}</span>
      <span class="tier-badge" id="${tierId}"><span>${tier.short}</span>${tier.name}</span>
      <span class="upgrade-icon">${upgrade.icon}</span>
      <span class="upgrade-copy">
        <h3 id="${titleId}">${upgrade.name}</h3>
        <p id="${descriptionId}">${upgrade.description}</p>
      </span>
      <strong class="upgrade-effect" id="${effectId}">${upgrade.effect(tier)}</strong>
    `;
    card.addEventListener("click", () => onUpgradeChoice(choice));
    hud.upgradeGrid.appendChild(card);
  }

  hud.upgradeOverlay.classList.add("active");
  setUpgradeFocusScope(true);
  updateLoadout();
  requestAnimationFrame(() =>
    hud.upgradeGrid.querySelector<HTMLButtonElement>("button")?.focus(),
  );
}

function onUpgradeChoice(choice: Parameters<typeof applyUpgrade>[0]): void {
  applyUpgrade(choice);
  updateLoadout();
  if (state.pendingUpgrades > 0) {
    showUpgrade();
    return;
  }

  hideOverlays();
  state.mode = "playing";
  updateHud();
  restoreFocusAfterUpgrade();
}

export function showGameOver(): void {
  state.mode = "gameover";
  hud.finalScore.textContent = Math.floor(state.score).toLocaleString("fr-FR");
  hud.finalWave.textContent = String(state.wave);
  hud.gameOverOverlay.classList.add("active");
  requestAnimationFrame(() =>
    document.querySelector<HTMLButtonElement>("#restartButton")?.focus(),
  );
}

export function pauseGame(): void {
  if (state.mode !== "playing") return;
  state.mode = "paused";
  player.vx = 0;
  player.vy = 0;
  hud.pauseOverlay.classList.add("active");
  requestAnimationFrame(() =>
    document.querySelector<HTMLButtonElement>("#resumeButton")?.focus(),
  );
}

export function resumeGame(): void {
  if (state.mode !== "paused") return;
  state.mode = "playing";
  hud.pauseOverlay.classList.remove("active");
}

export function setControlMode(mode: ControlMode): void {
  state.controlMode = mode;
  document.body.dataset.controlMode = mode;
  for (const button of hud.controlButtons) {
    const active = button.dataset.controlMode === mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  }
}

export function selectUpgradeByIndex(index: number): boolean {
  if (state.mode !== "upgrade") return false;
  const card = hud.upgradeGrid.querySelector<HTMLButtonElement>(
    `[data-choice-index="${index}"]`,
  );
  if (!card) return false;
  card.click();
  return true;
}

export function moveUpgradeFocus(direction: number): void {
  const cards = [...hud.upgradeGrid.querySelectorAll<HTMLButtonElement>(".upgrade-card")];
  if (!cards.length) return;

  const currentIndex = Math.max(
    0,
    cards.indexOf(document.activeElement as HTMLButtonElement),
  );
  const nextIndex = (currentIndex + direction + cards.length) % cards.length;
  cards[nextIndex]?.focus();
}

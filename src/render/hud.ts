import { player, state } from "../state";
import { clamp } from "../utils";
import {
  currentRerollCost,
  currentShopOffers,
  tryBuyOffer,
  tryRerollShop,
} from "../game/shop";
import { advanceFromShop } from "../game/wave-flow";
import { accountProgress } from "../systems/account";
import {
  canPurchaseLevel,
  metaUpgradeCatalog,
  metaUpgradeLevel,
} from "../game/meta-upgrade-catalog";
import { purchaseMetaUpgrade } from "../systems/account";
import type { ControlMode } from "../types";

const hud = {
  wave: query<HTMLElement>("#waveValue"),
  waveTimer: query<HTMLElement>("#waveTimerValue"),
  currency: query<HTMLElement>("#currencyValue"),
  carry: query<HTMLElement>("#carryValue"),
  score: query<HTMLElement>("#scoreValue"),
  health: query<HTMLElement>("#healthBar"),
  stats: {
    hull: query<HTMLElement>("#statHull"),
    damage: query<HTMLElement>("#statDamage"),
    fireRate: query<HTMLElement>("#statFireRate"),
    volley: query<HTMLElement>("#statVolley"),
    speed: query<HTMLElement>("#statSpeed"),
    pierce: query<HTMLElement>("#statPierce"),
    crit: query<HTMLElement>("#statCrit"),
    caliber: query<HTMLElement>("#statCaliber"),
    range: query<HTMLElement>("#statRange"),
  },
  hangarOverlay: query<HTMLElement>("#hangarOverlay"),
  shopOverlay: query<HTMLElement>("#shopOverlay"),
  shopGrid: query<HTMLElement>("#shopGrid"),
  shopCurrency: query<HTMLElement>("#shopCurrency"),
  shopCarry: query<HTMLElement>("#shopCarry"),
  shopRerollButton: query<HTMLButtonElement>("#shopRerollButton"),
  shopNextButton: query<HTMLButtonElement>("#shopNextButton"),
  pauseOverlay: query<HTMLElement>("#pauseOverlay"),
  gameOverOverlay: query<HTMLElement>("#gameOverOverlay"),
  finalWave: query<HTMLElement>("#finalWave"),
  finalScore: query<HTMLElement>("#finalScore"),
  runRecapGrid: query<HTMLElement>("#runRecapGrid"),
  hangarMeta: query<HTMLElement>("#hangarMeta"),
  recordWave: query<HTMLElement>("#recordWave"),
  recordScore: query<HTMLElement>("#recordScore"),
  recordTime: query<HTMLElement>("#recordTime"),
  recordsSummary: queryOptional<HTMLElement>("[data-records-summary]"),
  accountCrystals: queryOptional<HTMLElement>("[data-account-crystals]"),
};

function query<T extends HTMLElement>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Missing required element: ${selector}`);
  return el;
}

function queryOptional<T extends HTMLElement>(selector: string): T | null {
  return document.querySelector<T>(selector);
}

export function setControlMode(mode: ControlMode): void {
  state.controlMode = mode;
  document.body.dataset.controlMode = mode;
}

export function hideOverlays(): void {
  hud.hangarOverlay.classList.remove("active");
  hud.shopOverlay.classList.remove("active");
  hud.pauseOverlay.classList.remove("active");
  hud.gameOverOverlay.classList.remove("active");
}

export function showHangar(): void {
  state.mode = "menu";
  state.runElapsedSeconds = 0;
  hideOverlays();
  hud.hangarOverlay.classList.add("active");
  renderHangar();
  requestAnimationFrame(() =>
    document.querySelector<HTMLButtonElement>("#startButton")?.focus(),
  );
}

export function pauseGame(): void {
  if (state.mode !== "playing") return;
  state.mode = "paused";
  hud.pauseOverlay.classList.add("active");
}

export function resumeGame(): void {
  if (state.mode !== "paused") return;
  state.mode = "playing";
  hud.pauseOverlay.classList.remove("active");
}

export function showShop(): void {
  hideOverlays();
  hud.shopOverlay.classList.add("active");
  renderShop();
}

export function showGameOver(): void {
  hud.gameOverOverlay.classList.add("active");
  hud.finalWave.textContent = String(state.highestWaveReached);
  hud.finalScore.textContent = String(state.score);
  hud.runRecapGrid.innerHTML = "";
  const reward = accountProgress.lastRunReward;
  const items = [
    { label: "Wave", value: String(state.highestWaveReached) },
    { label: "Temps", value: formatTime(state.runElapsedSeconds) },
    { label: "Score", value: String(state.score) },
    { label: "Cristaux", value: `+${reward?.crystalsGained ?? 0}` },
  ];
  for (const item of items) {
    const article = document.createElement("article");
    article.className = "recap-stat";
    article.innerHTML = `<span>${item.label}</span><strong>${item.value}</strong>`;
    hud.runRecapGrid.appendChild(article);
  }
}

function updateShopHeader(): void {
  hud.shopCurrency.textContent = String(state.runCurrency);
  hud.shopCarry.textContent = String(state.pendingCarry);
  hud.shopRerollButton.textContent = `Reroll (${currentRerollCost()})`;
  hud.shopRerollButton.disabled = state.runCurrency < currentRerollCost();
}

function refreshShopAffordability(): void {
  const cards = hud.shopGrid.querySelectorAll<HTMLButtonElement>(".shop-card");
  const offers = currentShopOffers();
  cards.forEach((card, idx) => {
    const offer = offers[idx];
    if (!offer) return;
    card.disabled = state.runCurrency < offer.cost;
  });
}

function renderShop(): void {
  updateShopHeader();
  hud.shopGrid.innerHTML = "";
  const offers = currentShopOffers();
  if (offers.length === 0) {
    const empty = document.createElement("p");
    empty.className = "shop-empty";
    empty.textContent = "Plus rien à acheter — passe à la suite.";
    hud.shopGrid.appendChild(empty);
  }
  offers.forEach((offer, index) => {
    const card = document.createElement("button");
    card.className = "upgrade-card shop-card";
    card.type = "button";
    const canBuy = state.runCurrency >= offer.cost;
    card.disabled = !canBuy;
    card.dataset.offerIndex = String(index);
    card.innerHTML = `
      <span class="upgrade-stamp" aria-hidden="true">
        <img class="upgrade-stamp-img" src="${offer.upgrade.icon}" alt="" />
      </span>
      <span class="upgrade-copy">
        <h3>${offer.upgrade.name}</h3>
        <p>${offer.upgrade.description}</p>
      </span>
      <strong class="upgrade-effect">${offer.cost} XP</strong>
    `;
    card.addEventListener("click", () => onBuyOffer(index));
    hud.shopGrid.appendChild(card);
  });
}

function onBuyOffer(index: number): void {
  if (tryBuyOffer(index)) {
    renderShop();
    updateHud();
  }
}

function onReroll(): void {
  if (tryRerollShop()) {
    renderShop();
    updateHud();
  }
}

function onNextWave(): void {
  hideOverlays();
  advanceFromShop();
  updateHud();
}

export function updateHud(): void {
  hud.wave.textContent = String(state.wave);
  hud.waveTimer.textContent = formatTime(state.waveTimer);
  hud.currency.textContent = String(state.runCurrency);
  hud.carry.textContent = String(state.pendingCarry);
  hud.score.textContent = String(state.score);
  const hpPct = clamp(player.hp / Math.max(1, player.maxHp), 0, 1);
  hud.health.style.width = `${hpPct * 100}%`;
  hud.health.style.background =
    hpPct > 0.4
      ? "linear-gradient(90deg, #72ffb1, #39d9ff)"
      : "linear-gradient(90deg, #ff5a69, #ffbf47)";
  hud.stats.hull.textContent = `${Math.max(0, Math.ceil(player.hp))}/${Math.round(player.maxHp)}`;
  hud.stats.damage.textContent = String(Math.round(player.damage));
  hud.stats.fireRate.textContent = `${player.fireRate.toFixed(1)}/s`;
  hud.stats.volley.textContent = String(player.projectileCount);
  hud.stats.speed.textContent = String(Math.round(player.speed));
  hud.stats.pierce.textContent = String(player.pierce);
  hud.stats.crit.textContent = `${Math.round(player.critChance * 100)}%`;
  hud.stats.caliber.textContent = `x${player.bulletRadius.toFixed(2)}`;
  hud.stats.range.textContent = String(Math.round(player.range));
  if (hud.accountCrystals) {
    hud.accountCrystals.textContent = String(accountProgress.crystals);
  }
  if (state.mode === "shop") {
    updateShopHeader();
    refreshShopAffordability();
  }
}

function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

export function renderHangar(): void {
  if (hud.accountCrystals) {
    hud.accountCrystals.textContent = String(accountProgress.crystals);
  }
  hud.recordWave.textContent = String(accountProgress.records.bestWave);
  hud.recordScore.textContent = String(accountProgress.records.bestScore);
  hud.recordTime.textContent = formatTime(accountProgress.records.bestTimeSeconds);
  if (hud.recordsSummary) {
    hud.recordsSummary.textContent = `Records: wave ${accountProgress.records.bestWave} · ${formatTime(accountProgress.records.bestTimeSeconds)}`;
  }

  hud.hangarMeta.innerHTML = "";
  for (const upgrade of metaUpgradeCatalog) {
    const level = metaUpgradeLevel(accountProgress, upgrade.id);
    const atMax = level >= upgrade.maxLevel;
    const nextCost = atMax ? null : upgrade.costAt(level);
    const purchase = canPurchaseLevel(accountProgress, upgrade.id);
    const card = document.createElement("button");
    card.type = "button";
    card.className = "meta-card";
    card.disabled = !purchase.ok;
    const stateLabel = atMax ? "MAX" : `${nextCost} ◆`;
    card.innerHTML = `
      <span class="meta-card-head">
        <img class="meta-stamp-img" src="${upgrade.icon}" alt="" />
        <span class="meta-card-title">
          <strong>${upgrade.name}</strong>
          <span class="meta-card-level">L${level}/${upgrade.maxLevel}</span>
        </span>
      </span>
      <p>${upgrade.description}</p>
      <span class="meta-card-cost">${stateLabel}</span>
    `;
    card.addEventListener("click", () => {
      const result = purchaseMetaUpgrade(upgrade.id);
      if (result.ok) renderHangar();
    });
    hud.hangarMeta.appendChild(card);
  }
}

export function bindHudEvents(onStart: () => void, onRestart: () => void, onResetProgress: () => void): void {
  document.querySelector<HTMLButtonElement>("#startButton")?.addEventListener("click", onStart);
  document.querySelector<HTMLButtonElement>("#restartButton")?.addEventListener("click", onRestart);
  document.querySelector<HTMLButtonElement>("#resumeButton")?.addEventListener("click", resumeGame);
  document
    .querySelector<HTMLButtonElement>("#resetProgressButton")
    ?.addEventListener("click", () => {
      if (!window.confirm("Réinitialiser la progression ?")) return;
      onResetProgress();
    });
  hud.shopRerollButton.addEventListener("click", onReroll);
  hud.shopNextButton.addEventListener("click", onNextWave);
}

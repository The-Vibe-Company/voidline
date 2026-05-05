import { player, state } from "../state";
import { clamp } from "../utils";
import {
  applyCardAndAdvance,
  getPendingOffers,
} from "../game/wave-flow";
import { findWeaponDef } from "../game/weapon-catalog";
import { dailyStarterWeapon } from "../game/wave-flow";
import {
  createRng,
  getCachedSeed,
  getDailySeedString,
  hashSeedString,
} from "../game/daily-seed";
import { rollDailyCardPool } from "../game/card-catalog";
import { accountProgress } from "../systems/account";
import { getDailyLeaderboard } from "./leaderboard";
import { getAlias, setAlias, getOrCreatePlayerId } from "../systems/identity";
import { fetchLeaderboard, upsertPlayer, type LeaderboardEntryResponse } from "../systems/api";
import { BOSS_MINI_WAVE_INDEX, MINI_WAVE_COUNT } from "../game/balance";
import type {
  CardOffer,
  ControlMode,
  LeaderboardEntry,
  WeaponArchetypeId,
} from "../types";

type StartRunHandler = (id?: WeaponArchetypeId) => void;
let startRunHandler: StartRunHandler | null = null;

export function setStartRunHandler(handler: StartRunHandler): void {
  startRunHandler = handler;
}

const hud = {
  hudShell: queryOptional<HTMLElement>(".hud"),
  wave: queryOptional<HTMLElement>("#waveValue"),
  waveTimer: queryOptional<HTMLElement>("#waveTimerValue"),
  health: queryOptional<HTMLElement>("#healthBar"),
  bossPanel: queryOptional<HTMLElement>("#bossPanel"),
  bossHealth: queryOptional<HTMLElement>("#bossHealthBar"),
  hangarOverlay: query<HTMLElement>("#hangarOverlay"),
  cardPickOverlay: query<HTMLElement>("#cardPickOverlay"),
  pauseOverlay: query<HTMLElement>("#pauseOverlay"),
  gameOverOverlay: query<HTMLElement>("#gameOverOverlay"),
  hangarMeta: queryOptional<HTMLElement>("#hangarMeta"),
  recordWave: queryOptional<HTMLElement>("#recordWave"),
  recordScore: queryOptional<HTMLElement>("#recordScore"),
  recordTime: queryOptional<HTMLElement>("#recordTime"),
  recordsSummary: queryOptional<HTMLElement>("[data-records-summary]"),
  accountCrystals: queryOptional<HTMLElement>("[data-account-crystals]"),
  finalWave: queryOptional<HTMLElement>("#finalWave"),
  finalScore: queryOptional<HTMLElement>("#finalScore"),
  runRecapGrid: queryOptional<HTMLElement>("#runRecapGrid"),
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
  hud.cardPickOverlay.classList.remove("active");
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

export function showCardPick(): void {
  hideOverlays();
  hud.cardPickOverlay.classList.add("active");
  renderCardPick();
}

export function showGameOver(): void {
  hud.gameOverOverlay.classList.add("active");
  if (hud.finalWave) hud.finalWave.textContent = String(state.miniWaveIndex + 1);
  if (hud.finalScore) hud.finalScore.textContent = String(state.score);
  if (hud.runRecapGrid) {
    hud.runRecapGrid.innerHTML = "";
    const recap = state.bossDefeated
      ? "Boss vaincu — clear complet"
      : `Mini-vague ${state.miniWaveIndex + 1}/${MINI_WAVE_COUNT}`;
    const items: { label: string; value: string }[] = [
      { label: "Résultat", value: recap },
      { label: "Temps", value: formatTime(state.runElapsedSeconds) },
      { label: "Score", value: String(state.score) },
      { label: "Kills", value: String(state.kills) },
    ];
    if (state.bossDefeated) {
      items.push({
        label: "Boss tué en",
        value: formatTime(Math.round(state.bossKillElapsed)),
      });
      items.push({ label: "Bonus rapidité", value: `+${state.bossSpeedBonus}` });
      items.push({ label: "Bonus PV", value: `+${state.bossHpBonus}` });
    }
    for (const item of items) {
      const article = document.createElement("article");
      article.className = "recap-stat";
      article.innerHTML = `<span>${item.label}</span><strong>${item.value}</strong>`;
      hud.runRecapGrid.appendChild(article);
    }
  }
}

const REVEAL_DURATION_MS = 1800;
let revealTimerHandle: ReturnType<typeof setTimeout> | null = null;
let revealReady = false;

function renderCardPick(): void {
  const offers = getPendingOffers();
  if (!offers) return;
  const xpMaxLocal = state.xpMax;
  const xpCollected = state.xpCollected;
  const xpPct = xpMaxLocal > 0 ? Math.min(100, Math.round((xpCollected / xpMaxLocal) * 100)) : 0;
  const cardCount = offers.length;

  hud.cardPickOverlay.innerHTML = "";
  const modal = document.createElement("div");
  modal.className = `card-pick-modal cards-${cardCount} is-rolling`;
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.innerHTML = `
    <header class="card-pick-head">
      <p class="eyebrow">Mini-vague ${state.miniWaveIndex + 1} terminée</p>
      <h2>Choisis une carte</h2>
      <div class="card-pick-roll" data-roll>
        <span class="card-pick-roll-label">XP collecté</span>
        <div class="card-pick-roll-bar">
          <span class="card-pick-roll-fill" style="--xp-pct:${xpPct}%"></span>
        </div>
        <span class="card-pick-roll-stat"><strong>${xpCollected}</strong>/${xpMaxLocal} (${xpPct}%)</span>
        <span class="card-pick-roll-spinner" aria-hidden="true"></span>
        <span class="card-pick-roll-result" data-result></span>
      </div>
      <p class="card-pick-hint" data-hint hidden></p>
    </header>
    <div class="card-pick-grid" data-grid hidden></div>
    <footer class="card-pick-foot">Mini-vague ${state.miniWaveIndex + 2}/${MINI_WAVE_COUNT} ${state.miniWaveIndex + 1 === MINI_WAVE_COUNT - 1 ? "(Boss)" : ""}</footer>
  `;
  hud.cardPickOverlay.appendChild(modal);

  if (revealTimerHandle) clearTimeout(revealTimerHandle);
  revealReady = false;
  revealTimerHandle = setTimeout(() => {
    revealCards(modal, offers, cardCount, xpPct);
  }, REVEAL_DURATION_MS);
}

function revealCards(
  modal: HTMLElement,
  offers: readonly CardOffer[],
  cardCount: number,
  xpPct: number,
): void {
  revealReady = true;
  modal.classList.remove("is-rolling");
  modal.classList.add("is-revealed");
  const result = modal.querySelector<HTMLElement>("[data-result]");
  if (result) {
    if (cardCount === 3) {
      result.className = "card-pick-roll-result is-bonus";
      result.textContent = `+1 carte bonus`;
    } else {
      result.className = "card-pick-roll-result is-standard";
      result.textContent = xpPct >= 100 ? "Pas de bonus cette fois" : `Atteins 100% pour 3 cartes`;
    }
  }
  const hint = modal.querySelector<HTMLElement>("[data-hint]");
  if (hint) {
    hint.hidden = false;
    hint.innerHTML = cardCount === 3
      ? `Touches <kbd>1</kbd>, <kbd>2</kbd> ou <kbd>3</kbd>`
      : `Touches <kbd>1</kbd> ou <kbd>2</kbd>`;
  }
  const grid = modal.querySelector<HTMLElement>("[data-grid]");
  if (grid) {
    grid.hidden = false;
    offers.forEach((offer, index) => {
      const card = buildCardElement(offer, index);
      card.style.setProperty("--card-delay", `${index * 80}ms`);
      grid.appendChild(card);
    });
  }
}

function buildCardElement(offer: CardOffer, index: number): HTMLElement {
  const card = document.createElement("button");
  card.type = "button";
  card.className = `card-pick-card rarity-${offer.card.rarity}`;
  card.dataset.cardIndex = String(index);
  const rarityLabel = offer.card.rarity === "mutation"
    ? "MUTATION"
    : offer.card.rarity === "rare"
      ? "RARE"
      : "COMMUN";
  let title = offer.card.name;
  let description = offer.card.description;
  let extra = "";
  if (offer.mutationPreview) {
    title = `${offer.mutationPreview.weaponName} → ${offer.mutationPreview.mutationName}`;
    description = offer.mutationPreview.description;
    extra = `<p class="card-pick-tag">Évolution finale · remplace l'arme</p>`;
  } else if (offer.promotionPreview) {
    const p = offer.promotionPreview;
    title = `${p.weaponName} T${p.fromTier} → T${p.toTier}`;
    description = p.deltas.length > 0 ? p.deltas.join(" · ") : offer.card.description;
    extra = `<p class="card-pick-tag">Promotion d'arme</p>`;
  }
  card.innerHTML = `
    <span class="card-pick-rarity">${rarityLabel}</span>
    <span class="card-pick-key">${index + 1}</span>
    <h3 class="card-pick-name">${title}</h3>
    <p class="card-pick-desc">${description}</p>
    ${extra}
  `;
  card.addEventListener("click", () => onPickCard(index));
  return card;
}

export function pickCardByIndex(index: number): void {
  if (state.mode !== "card-pick") return;
  if (!revealReady) return;
  const offers = getPendingOffers();
  if (!offers || index < 0 || index >= offers.length) return;
  onPickCard(index);
}

function onPickCard(index: number): void {
  if (!revealReady) return;
  if (revealTimerHandle) {
    clearTimeout(revealTimerHandle);
    revealTimerHandle = null;
  }
  applyCardAndAdvance(index);
  hideOverlays();
  updateHud();
}

export function updateHud(): void {
  if (hud.hudShell) {
    const visible = state.mode === "playing" || state.mode === "paused";
    hud.hudShell.dataset.hudMode = visible ? "visible" : "hidden";
  }
  if (hud.wave) {
    hud.wave.textContent = `${state.miniWaveIndex + 1}/${MINI_WAVE_COUNT}`;
  }
  if (hud.waveTimer) {
    if (state.miniWaveIndex === BOSS_MINI_WAVE_INDEX && state.mode === "playing" && !state.bossDefeated) {
      const fight = Math.max(0, state.runElapsedSeconds - state.bossFightStartedAt);
      hud.waveTimer.textContent = `BOSS ${formatTime(fight)}`;
    } else {
      hud.waveTimer.textContent = formatTime(state.waveTimer);
    }
  }
  if (hud.health) {
    const hpPct = clamp(player.hp / Math.max(1, player.maxHp), 0, 1);
    hud.health.style.width = `${hpPct * 100}%`;
    hud.health.style.background =
      hpPct > 0.4
        ? "linear-gradient(90deg, #72ffb1, #39d9ff)"
        : "linear-gradient(90deg, #ff5a69, #ffbf47)";
  }
  if (hud.bossPanel && hud.bossHealth) {
    const bossEnemy = state.mode === "playing" ? state.bossEnemy : null;
    if (bossEnemy) {
      hud.bossPanel.dataset.active = "true";
      const bossPct = clamp(bossEnemy.hp / Math.max(1, bossEnemy.maxHp), 0, 1);
      hud.bossHealth.style.width = `${bossPct * 100}%`;
    } else {
      hud.bossPanel.dataset.active = "false";
    }
  }
}

function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

export function renderHangar(): void {
  if (hud.recordWave) hud.recordWave.textContent = String(accountProgress.records.bestMiniWave);
  if (hud.recordScore) hud.recordScore.textContent = String(accountProgress.records.bestScore);
  if (hud.recordTime) hud.recordTime.textContent = formatTime(accountProgress.records.bestTimeSeconds);
  if (hud.recordsSummary) {
    hud.recordsSummary.textContent = `Records: vague ${accountProgress.records.bestMiniWave}/${MINI_WAVE_COUNT} · ${formatTime(accountProgress.records.bestTimeSeconds)}`;
  }

  if (!hud.hangarMeta) return;
  hud.hangarMeta.innerHTML = "";

  const cached = getCachedSeed();
  const todaySeed = cached?.date ?? getDailySeedString();
  const seedSourceLabel =
    cached?.source === "server"
      ? "Serveur ✓"
      : cached?.source === "offline"
        ? "Hors-ligne ⚠"
        : "Connexion…";
  const todayStarter = dailyStarterWeapon();
  const todayDef = findWeaponDef(todayStarter);

  // Derive the daily card pool from the same seed as the runtime so the player
  // can preview it from the hangar before starting the run.
  const seedNumber = cached?.seed ?? hashSeedString(todaySeed);
  const previewRng = createRng(seedNumber);
  const previewPool = rollDailyCardPool(previewRng);

  const seedBlock = document.createElement("section");
  seedBlock.className = "hangar-seed-block";
  seedBlock.innerHTML = `
    <p class="eyebrow">Daily run · <span class="hangar-seed-source">${seedSourceLabel}</span></p>
    <strong class="hangar-seed-value">${todaySeed}</strong>
    <p class="hangar-seed-hint">Arme du jour : <strong>${todayDef.name}</strong> — même seed pour tous, bats ton record.</p>
    <button type="button" class="hangar-seed-toggle" id="poolToggleBtn">Voir le pool de cartes</button>
  `;
  hud.hangarMeta.appendChild(seedBlock);
  seedBlock
    .querySelector<HTMLButtonElement>("#poolToggleBtn")
    ?.addEventListener("click", () => openPoolModal(todaySeed, previewPool));

  // Alias block (identity for online leaderboard).
  const aliasBlock = document.createElement("section");
  aliasBlock.className = "hangar-alias-block";
  hud.hangarMeta.appendChild(aliasBlock);
  renderAliasBlock(aliasBlock, { editing: false });

  const leaderboardBlock = document.createElement("section");
  leaderboardBlock.className = "hangar-leaderboard-block";
  leaderboardBlock.innerHTML = `<p class="eyebrow">Top 10 du jour</p><p class="hangar-leaderboard-empty">Chargement…</p>`;
  hud.hangarMeta.appendChild(leaderboardBlock);

  // Online leaderboard fetch (best-effort), fallback to local.
  fetchLeaderboard(todaySeed)
    .then((data) => renderOnlineLeaderboard(leaderboardBlock, data.entries))
    .catch(() => renderLocalLeaderboardFallback(leaderboardBlock, todaySeed));
}

let poolDialog: HTMLDialogElement | null = null;

function openPoolModal(
  seedDate: string,
  pool: ReadonlyArray<{ name: string; description: string; rarity: string }>,
): void {
  if (!poolDialog) {
    poolDialog = document.createElement("dialog");
    poolDialog.className = "pool-modal";
    document.body.appendChild(poolDialog);
    poolDialog.addEventListener("click", (event) => {
      // Click on backdrop = close.
      if (event.target === poolDialog) poolDialog?.close();
    });
  }
  poolDialog.innerHTML = `
    <header class="pool-modal-header">
      <div>
        <p class="eyebrow">Pool du jour · ${escapeHtml(seedDate)}</p>
        <h2>${pool.length} cartes disponibles</h2>
      </div>
      <button type="button" class="pool-modal-close" id="poolCloseBtn" aria-label="Fermer">×</button>
    </header>
    <ul class="pool-modal-list">
      ${pool
        .map(
          (c) => `
        <li>
          <div class="pool-modal-line">
            <strong>${escapeHtml(c.name)}</strong>
            <span class="hangar-pool-rarity hangar-pool-rarity-${escapeHtml(c.rarity)}">${escapeHtml(c.rarity)}</span>
          </div>
          <p class="pool-modal-desc">${escapeHtml(c.description)}</p>
        </li>`,
        )
        .join("")}
    </ul>
  `;
  poolDialog.querySelector<HTMLButtonElement>("#poolCloseBtn")?.addEventListener("click", () => {
    poolDialog?.close();
  });
  poolDialog.showModal();
}

interface AliasBlockState {
  editing: boolean;
  value?: string;
  error?: string;
  busy?: boolean;
}

function renderAliasBlock(container: HTMLElement, st: AliasBlockState): void {
  container.innerHTML = "";
  const current = getAlias();
  if (!st.editing) {
    if (current) {
      container.innerHTML = `
        <p class="eyebrow">Pseudo</p>
        <div class="hangar-alias-display">
          <strong class="hangar-alias-value">${escapeHtml(current)}</strong>
          <button type="button" class="hangar-alias-edit" id="aliasEditBtn">Modifier</button>
        </div>
      `;
      container
        .querySelector<HTMLButtonElement>("#aliasEditBtn")
        ?.addEventListener("click", () => renderAliasBlock(container, { editing: true, value: current }));
    } else {
      container.innerHTML = `
        <p class="eyebrow">Pseudo (optionnel)</p>
        <button type="button" class="hangar-alias-add" id="aliasAddBtn">Ajouter pseudo</button>
      `;
      container
        .querySelector<HTMLButtonElement>("#aliasAddBtn")
        ?.addEventListener("click", () => renderAliasBlock(container, { editing: true, value: "" }));
    }
    return;
  }

  const initial = st.value ?? current ?? "";
  const errorHtml = st.error
    ? `<p class="hangar-alias-error" id="aliasError" role="alert">${escapeHtml(st.error)}</p>`
    : "";
  const disabledAttr = st.busy ? "disabled" : "";
  const ariaDescribedBy = st.error ? ' aria-describedby="aliasError"' : "";
  container.innerHTML = `
    <label class="eyebrow" for="aliasInput">Pseudo</label>
    <div class="hangar-alias-edit-row">
      <input type="text" id="aliasInput" maxlength="24" placeholder="Anonyme" value="${escapeHtml(initial)}" ${disabledAttr}${ariaDescribedBy} />
      <button type="button" id="aliasSaveBtn" ${disabledAttr}>Valider</button>
      <button type="button" id="aliasCancelBtn" ${disabledAttr}>Annuler</button>
    </div>
    ${errorHtml}
  `;
  const input = container.querySelector<HTMLInputElement>("#aliasInput");
  const saveBtn = container.querySelector<HTMLButtonElement>("#aliasSaveBtn");
  const cancelBtn = container.querySelector<HTMLButtonElement>("#aliasCancelBtn");
  input?.focus();
  input?.setSelectionRange(initial.length, initial.length);

  const submit = async (): Promise<void> => {
    const raw = input?.value ?? "";
    renderAliasBlock(container, { editing: true, value: raw, busy: true });
    const cleaned = (raw || "").trim().slice(0, 24);
    if (!cleaned) {
      // Empty alias = clear it. Wait for server confirmation before mutating local state
      // so a network failure doesn't desync local and server identity.
      const result = await upsertPlayer(getOrCreatePlayerId(), null);
      if (!result.ok && result.reason === "network") {
        renderAliasBlock(container, { editing: true, value: raw, error: "Réseau indisponible. Réessaie." });
        return;
      }
      setAlias(null);
      renderAliasBlock(container, { editing: false });
      return;
    }
    const result = await upsertPlayer(getOrCreatePlayerId(), cleaned);
    if (result.ok) {
      setAlias(cleaned);
      renderAliasBlock(container, { editing: false });
      return;
    }
    if (result.reason === "taken") {
      renderAliasBlock(container, {
        editing: true,
        value: cleaned,
        error: `« ${cleaned} » est déjà pris. Choisis un autre pseudo.`,
      });
      return;
    }
    renderAliasBlock(container, {
      editing: true,
      value: cleaned,
      error: "Réseau indisponible. Réessaie.",
    });
  };

  saveBtn?.addEventListener("click", () => {
    void submit();
  });
  cancelBtn?.addEventListener("click", () => renderAliasBlock(container, { editing: false }));
  input?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void submit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      renderAliasBlock(container, { editing: false });
    }
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    if (c === "&") return "&amp;";
    if (c === "<") return "&lt;";
    if (c === ">") return "&gt;";
    if (c === '"') return "&quot;";
    return "&#39;";
  });
}

function renderOnlineLeaderboard(
  container: HTMLElement,
  entries: readonly LeaderboardEntryResponse[],
): void {
  container.innerHTML = `<p class="eyebrow">Top 10 du jour</p>`;
  if (entries.length === 0) {
    container.innerHTML += `<p class="hangar-leaderboard-empty">Pas encore de score — sois le premier.</p>`;
    return;
  }
  const list = document.createElement("ol");
  list.className = "hangar-leaderboard-list";
  entries.forEach((entry, idx) => {
    const item = document.createElement("li");
    const def = findWeaponDef(entry.starter_weapon as WeaponArchetypeId);
    const flag = entry.boss_defeated ? "★" : "";
    const alias = entry.alias ? escapeHtml(entry.alias) : "Anonyme";
    item.innerHTML = `<span class="lb-rank">#${idx + 1}</span><span class="lb-score">${entry.score}</span><span class="lb-meta">${alias} · ${def.name} · vague ${entry.mini_wave}/${MINI_WAVE_COUNT} · ${formatTime(entry.run_seconds)} ${flag}</span>`;
    list.appendChild(item);
  });
  container.appendChild(list);
}

function renderLocalLeaderboardFallback(container: HTMLElement, seed: string): void {
  const local = getDailyLeaderboard(seed);
  container.innerHTML = `<p class="eyebrow">Top du jour (local)</p>`;
  if (local.length === 0) {
    container.innerHTML += `<p class="hangar-leaderboard-empty">Pas encore de score — sois le premier.</p>`;
    return;
  }
  const list = document.createElement("ol");
  list.className = "hangar-leaderboard-list";
  local.forEach((entry, idx) => {
    const item = document.createElement("li");
    item.innerHTML = formatLeaderboardLine(entry, idx + 1);
    list.appendChild(item);
  });
  container.appendChild(list);
}

function formatLeaderboardLine(entry: LeaderboardEntry, rank: number): string {
  const def = findWeaponDef(entry.starterWeaponId);
  const flag = entry.bossDefeated ? "★" : "";
  return `<span class="lb-rank">#${rank}</span><span class="lb-score">${entry.score}</span><span class="lb-meta">${def.name} · vague ${entry.miniWave}/${MINI_WAVE_COUNT} · ${formatTime(entry.elapsedSeconds)} ${flag}</span>`;
}

export function triggerStartRun(): void {
  if (startRunHandler) startRunHandler();
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
}

import { enemies, ownedRelics, ownedUpgrades, player, state } from "../state";
import { clamp } from "../utils";
import { applyUpgrade, pickUpgrades } from "../systems/upgrades";
import { applyRelicChoice, pickRelicChoices } from "../systems/relics";
import { accountXpToNextLevel } from "../game/account-progression";
import { upgradeTiers } from "../game/balance";
import { canPurchaseShopItem, shopCatalog } from "../game/shop-catalog";
import { weaponCatalog } from "../game/weapon-catalog";
import type { BuildTag, ControlMode, RelicChoice, ShopItem, SynergyDefinition, Weapon } from "../types";
import { consumeSimulationEvents } from "../simulation/events";
import { activeSynergiesForLoadout, BUILD_TAG_META } from "../systems/synergies";
import {
  challengeCatalog,
  challengeValueLabel,
  nextChallengeThreshold,
  unlockedTierCount,
} from "../game/challenge-catalog";
import { challengeProgress, challengeSummary } from "../systems/challenges";
import {
  accountProgress,
  awardRunAccountProgress,
  equipWeapon,
  purchaseShopItem,
} from "../systems/account";

const hud = {
  wave: document.querySelector<HTMLElement>("#waveValue")!,
  kills: document.querySelector<HTMLElement>("#killsValue")!,
  target: document.querySelector<HTMLElement>("#targetValue")!,
  level: document.querySelector<HTMLElement>("#levelValue")!,
  xp: document.querySelector<HTMLElement>("#xpValue")!,
  xpBar: document.querySelector<HTMLElement>("#xpBar")!,
  score: document.querySelector<HTMLElement>("#scoreValue")!,
  health: document.querySelector<HTMLElement>("#healthBar")!,
  bossPanel: document.querySelector<HTMLElement>("#bossPanel")!,
  bossName: document.querySelector<HTMLElement>("#bossName")!,
  bossBar: document.querySelector<HTMLElement>("#bossBar")!,
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
  chestOverlay: document.querySelector<HTMLElement>("#chestOverlay")!,
  pauseOverlay: document.querySelector<HTMLElement>("#pauseOverlay")!,
  gameOverOverlay: document.querySelector<HTMLElement>("#gameOverOverlay")!,
  upgradeTitle: document.querySelector<HTMLElement>("#upgradeTitle")!,
  upgradeStep: document.querySelector<HTMLElement>("#upgradeStep")!,
  upgradeGrid: document.querySelector<HTMLElement>("#upgradeGrid")!,
  chestGrid: document.querySelector<HTMLElement>("#chestGrid")!,
  controlButtons: [
    ...document.querySelectorAll<HTMLButtonElement>("[data-control-mode]"),
  ],
  finalScore: document.querySelector<HTMLElement>("#finalScore")!,
  finalWave: document.querySelector<HTMLElement>("#finalWave")!,
  pickupZonesToggle: document.querySelector<HTMLInputElement>("#togglePickupZones")!,
  startChallengeList: document.querySelector<HTMLElement>("#startChallengeList")!,
  startChallengeSummary: document.querySelector<HTMLElement>("#startChallengeSummary")!,
  gameOverChallengeList: document.querySelector<HTMLElement>("#gameOverChallengeList")!,
  gameOverChallengeSummary: document.querySelector<HTMLElement>("#gameOverChallengeSummary")!,
  runRecapGrid: document.querySelector<HTMLElement>("#runRecapGrid")!,
  runRewardBreakdown: document.querySelector<HTMLElement>("#runRewardBreakdown")!,
  runRecapBadges: document.querySelector<HTMLElement>("#runRecapBadges")!,
  accountLevels: [...document.querySelectorAll<HTMLElement>("[data-account-level]")],
  accountXpTexts: [...document.querySelectorAll<HTMLElement>("[data-account-xp]")],
  accountXpBars: [...document.querySelectorAll<HTMLElement>("[data-account-xp-bar]")],
  accountTokens: [...document.querySelectorAll<HTMLElement>("[data-account-tokens]")],
  accountRarity: [...document.querySelectorAll<HTMLElement>("[data-account-rarity]")],
  accountReward: [...document.querySelectorAll<HTMLElement>("[data-account-reward]")],
  shopGrids: [...document.querySelectorAll<HTMLElement>("[data-shop-grid]")],
  weaponGrids: [...document.querySelectorAll<HTMLElement>("[data-weapon-grid]")],
};

const PICKUP_ZONES_KEY = "voidline:showPickupZones";

function loadPickupZonesPref(): boolean {
  try {
    return localStorage.getItem(PICKUP_ZONES_KEY) === "1";
  } catch {
    return false;
  }
}

function savePickupZonesPref(value: boolean): void {
  try {
    localStorage.setItem(PICKUP_ZONES_KEY, value ? "1" : "0");
  } catch {
    // localStorage unavailable (private mode, sandbox) — keep the in-memory toggle
  }
}

export function initPickupZonesToggle(): void {
  const initial = loadPickupZonesPref();
  state.showPickupZones = initial;
  hud.pickupZonesToggle.checked = initial;
  hud.pickupZonesToggle.addEventListener("change", () => {
    state.showPickupZones = hud.pickupZonesToggle.checked;
    savePickupZonesPref(state.showPickupZones);
  });
}

let modalReturnFocus: HTMLElement | null = null;
let upgradeRunTotal = 0;

const TIER_RANK_LOOKUP = new Map<string, number>(
  upgradeTiers.map((tier, idx) => [tier.id, idx + 1] as const),
);

function tierRank(tierId: string): number {
  return TIER_RANK_LOOKUP.get(tierId) ?? 1;
}

function renderBuildTags(tags: readonly BuildTag[]): string {
  if (tags.length === 0) return "";
  return `<span class="build-tags" aria-hidden="true">${tags
    .map((tag) => {
      const meta = BUILD_TAG_META[tag];
      return `<span class="build-tag" style="--tag-color: ${meta.color}">${meta.label}</span>`;
    })
    .join("")}</span>`;
}

function renderSynergyBadges(synergies: readonly SynergyDefinition[]): string {
  if (synergies.length === 0) return "";
  return `<span class="synergy-tags" aria-hidden="true">${synergies
    .map(
      (synergy) =>
        `<span class="synergy-badge" style="--tag-color: ${synergy.color}">${synergy.name}</span>`,
    )
    .join("")}</span>`;
}

function buildInfoText(
  tags: readonly BuildTag[],
  synergies: readonly SynergyDefinition[],
): string {
  const segments: string[] = [];
  if (tags.length > 0) {
    segments.push(`Tags de build: ${tags.map((tag) => BUILD_TAG_META[tag].label).join(", ")}`);
  }
  if (synergies.length > 0) {
    segments.push(`Synergies actives: ${synergies.map((synergy) => synergy.name).join(", ")}`);
  }
  return segments.join(". ");
}

function activeSynergiesForTags(tags: readonly BuildTag[]): SynergyDefinition[] {
  const active = activeSynergiesForLoadout(ownedUpgrades.values(), ownedRelics.values());
  return active.filter((synergy) =>
    (Object.keys(synergy.requiredTags) as BuildTag[]).some((tag) => tags.includes(tag)),
  );
}

function cipherFor(upgradeId: string, tierShort: string, index: number): string {
  const head = upgradeId.replace(/[^a-z0-9]/gi, "").slice(0, 3).toUpperCase().padEnd(3, "X");
  let hash = 0;
  for (let i = 0; i < upgradeId.length; i++) {
    hash = (hash * 31 + upgradeId.charCodeAt(i)) >>> 0;
  }
  const seed = (hash + index * 113) & 0xffff;
  return `${head}-${tierShort}-${seed.toString(16).toUpperCase().padStart(4, "0")}`;
}

export function getControlButtons(): HTMLButtonElement[] {
  return hud.controlButtons;
}

export function getUpgradeGrid(): HTMLElement {
  return hud.upgradeGrid;
}

type OverlayId =
  | "startOverlay"
  | "upgradeOverlay"
  | "chestOverlay"
  | "pauseOverlay"
  | "gameOverOverlay";

export function initOverlayFocusScope(): void {
  const active = document.querySelector<HTMLElement>(".overlay.active");
  setOverlayFocusScope(active?.id as OverlayId | undefined);
}

export function hideOverlays(): void {
  hud.startOverlay.classList.remove("active");
  hud.upgradeOverlay.classList.remove("active");
  hud.chestOverlay.classList.remove("active");
  hud.pauseOverlay.classList.remove("active");
  hud.gameOverOverlay.classList.remove("active");
  setOverlayFocusScope();
}

function setOverlayFocusScope(activeOverlay?: OverlayId): void {
  for (const element of document.querySelectorAll<HTMLElement>(
    ".game-shell > *",
  )) {
    const active = activeOverlay !== undefined && element.id !== activeOverlay;
    element.toggleAttribute("inert", active);
    if (active) {
      element.setAttribute("aria-hidden", "true");
    } else {
      element.removeAttribute("aria-hidden");
    }
  }
}

function rememberFocusBeforeModal(activeOverlay: HTMLElement): void {
  const active = document.activeElement;
  if (
    modalReturnFocus === null &&
    active instanceof HTMLElement &&
    !activeOverlay.contains(active)
  ) {
    modalReturnFocus = active;
  }
}

function restoreFocusAfterModal(): void {
  const target = modalReturnFocus;
  modalReturnFocus = null;
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
    chip.innerHTML = `<span class="loadout-main">${upgrade.icon} ${tier.short} x${count}</span>${renderBuildTags(upgrade.tags)}`;
    hud.loadout.appendChild(chip);
  }
  for (const owned of ownedRelics.values()) {
    const { relic, count } = owned;
    const chip = document.createElement("span");
    chip.className = "loadout-chip relic-chip";
    chip.style.setProperty("--tier-color", relic.color);
    chip.innerHTML = `<span class="loadout-main">${relic.icon} R x${count}</span>${renderBuildTags(relic.tags)}`;
    hud.loadout.appendChild(chip);
  }
  for (const synergy of activeSynergiesForLoadout(ownedUpgrades.values(), ownedRelics.values())) {
    const chip = document.createElement("span");
    chip.className = "loadout-chip synergy-chip";
    chip.style.setProperty("--tier-color", synergy.color);
    chip.textContent = synergy.name;
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

function accountRewardLabel(): string {
  const reward = accountProgress.lastRunReward;
  if (!reward || reward.xpGained <= 0) return "Aucun gain de compte";
  const parts = [`+${reward.xpGained.toLocaleString("fr-FR")} XP compte`];
  if (reward.levelsGained > 0) parts.push(`+${reward.levelsGained} niveau`);
  if (reward.tokensGained > 0) parts.push(`+${reward.tokensGained} jeton`);
  return parts.join(" - ");
}

function formatNumber(value: number): string {
  return Math.floor(value).toLocaleString("fr-FR");
}

function accountRarityLabel(): string {
  const rank = shopCatalog.reduce((value, item) => {
    if (item.kind !== "rarity" || !accountProgress.purchasedIds.includes(item.id)) return value;
    return Math.max(value, item.rarityRank ?? 0);
  }, 0);
  return `Rarete ${rank}/3`;
}

function renderChallengeList(target: HTMLElement): void {
  target.innerHTML = "";
  for (const challenge of challengeCatalog) {
    const value = challengeProgress[challenge.metric] ?? 0;
    const unlocked = unlockedTierCount(challenge, challengeProgress);
    const nextThreshold = nextChallengeThreshold(challenge, challengeProgress);
    const total = challenge.tiers.length;
    const progressMax = nextThreshold ?? challenge.tiers[total - 1]!.threshold;
    const pct = clamp(value / progressMax, 0, 1) * 100;
    const nextReward = challenge.tiers[unlocked]?.accountXp ?? null;
    const row = document.createElement("article");
    row.className = "challenge-row";
    row.dataset.complete = unlocked === total ? "true" : "false";
    row.innerHTML = `
      <span class="challenge-icon" aria-hidden="true">${challenge.icon}</span>
      <span class="challenge-copy">
        <strong>${challenge.name}</strong>
        <span>${challenge.description}</span>
        <span class="challenge-meter" aria-hidden="true"><span style="width: ${pct}%"></span></span>
      </span>
      <span class="challenge-progress">
        <strong>${unlocked}/${total}</strong>
        <span>${challengeValueLabel(challenge.metric, value)}${nextThreshold === null ? "" : `/${challengeValueLabel(challenge.metric, nextThreshold)}`}</span>
        <span>${nextReward === null ? "Complete" : `+${nextReward} XP`}</span>
      </span>
    `;
    target.appendChild(row);
  }
}

export function updateChallengePanels(): void {
  const summary = `${challengeSummary()} - objectifs d'XP compte`;
  hud.startChallengeSummary.textContent = summary;
  hud.gameOverChallengeSummary.textContent = summary;
  renderChallengeList(hud.startChallengeList);
  renderChallengeList(hud.gameOverChallengeList);
}

export function updateHangarPanels(): void {
  const xpTarget = accountXpToNextLevel(accountProgress.level);
  const xpPct = clamp(accountProgress.xp / xpTarget, 0, 1) * 100;
  for (const element of hud.accountLevels) {
    element.textContent = String(accountProgress.level);
  }
  for (const element of hud.accountXpTexts) {
    element.textContent = `${accountProgress.xp}/${xpTarget} XP`;
  }
  for (const element of hud.accountXpBars) {
    element.style.width = `${xpPct}%`;
  }
  for (const element of hud.accountTokens) {
    element.textContent = String(accountProgress.tokens);
  }
  for (const element of hud.accountRarity) {
    element.textContent = accountRarityLabel();
  }
  for (const element of hud.accountReward) {
    element.textContent = accountRewardLabel();
  }
  for (const grid of hud.shopGrids) {
    renderShopGrid(grid);
  }
  for (const grid of hud.weaponGrids) {
    renderWeaponGrid(grid);
  }
}

function renderShopGrid(target: HTMLElement): void {
  target.innerHTML = "";
  for (const item of shopCatalog.filter((candidate) => candidate.kind !== "weapon")) {
    target.appendChild(shopButton(item));
  }
}

function shopButton(item: ShopItem): HTMLButtonElement {
  const button = document.createElement("button");
  const purchased = accountProgress.purchasedIds.includes(item.id);
  const purchaseState = canPurchaseShopItem(accountProgress, item);
  button.className = "hangar-card";
  button.type = "button";
  button.disabled = purchased || !purchaseState.ok;
  button.dataset.owned = purchased ? "true" : "false";
  button.innerHTML = `
    <span class="hangar-card-title">${item.name}</span>
    ${renderBuildTags(item.tags)}
    <span class="hangar-card-copy">${item.description}</span>
    <span class="hangar-card-price">${purchased ? "Acquis" : `${item.cost} jeton${item.cost > 1 ? "s" : ""}`}</span>
  `;
  button.addEventListener("click", () => {
    const result = purchaseShopItem(item.id);
    if (result.ok) {
      updateHangarPanels();
    }
  });
  return button;
}

function renderWeaponGrid(target: HTMLElement): void {
  target.innerHTML = "";
  for (const weapon of weaponCatalog) {
    target.appendChild(weaponButton(weapon));
  }
}

function weaponButton(weapon: Weapon): HTMLButtonElement {
  const button = document.createElement("button");
  const shopItem = shopCatalog.find((item) => item.weaponId === weapon.id);
  const owned =
    weapon.id === "standard" ||
    (shopItem !== undefined && accountProgress.purchasedIds.includes(shopItem.id));
  const equipped = accountProgress.equippedWeaponId === weapon.id;
  const purchaseState = shopItem ? canPurchaseShopItem(accountProgress, shopItem) : { ok: false };
  button.className = "hangar-card weapon-card";
  button.type = "button";
  button.disabled = !owned && !purchaseState.ok;
  button.dataset.owned = owned ? "true" : "false";
  button.dataset.equipped = equipped ? "true" : "false";
  button.innerHTML = `
    <span class="hangar-card-title">${weapon.icon} ${weapon.name}</span>
    ${renderBuildTags(weapon.tags)}
    <span class="hangar-card-copy">${weapon.description}</span>
    <span class="hangar-card-price">${
      equipped
        ? "Equipe"
        : owned
          ? "Equiper"
          : shopItem
            ? `${shopItem.cost} jeton${shopItem.cost > 1 ? "s" : ""}`
            : "Verrouille"
    }</span>
  `;
  button.addEventListener("click", () => {
    if (!owned && shopItem) {
      const result = purchaseShopItem(shopItem.id);
      if (result.ok) updateHangarPanels();
      return;
    }
    if (owned && equipWeapon(weapon.id)) {
      updateHangarPanels();
    }
  });
  return button;
}

function renderRunRecap(): void {
  const reward = accountProgress.lastRunReward;
  const bossCount = state.runBossWaves.length;
  const tokensGained = reward?.tokensGained ?? 0;
  const levelsGained = reward?.levelsGained ?? 0;
  const breakdown = reward?.breakdown;
  hud.runRecapGrid.innerHTML = "";
  hud.runRewardBreakdown.innerHTML = "";

  const stats = [
    { label: "Score", value: formatNumber(state.score) },
    { label: "Vague", value: String(state.wave) },
    { label: "Niveau run", value: String(state.level) },
    { label: "Boss", value: String(bossCount) },
    { label: "XP compte", value: `+${formatNumber(reward?.xpGained ?? 0)}` },
    { label: "Jetons", value: tokensGained > 0 ? `+${tokensGained}` : "0" },
  ];

  for (const stat of stats) {
    const item = document.createElement("article");
    item.className = "recap-stat";
    item.innerHTML = `<span>${stat.label}</span><strong>${stat.value}</strong>`;
    hud.runRecapGrid.appendChild(item);
  }

  const badges: string[] = [];
  if (levelsGained > 0) badges.push(`Compte +${levelsGained}`);
  if (tokensGained > 0) badges.push(`Jeton +${tokensGained}`);
  if ((breakdown?.recordXp ?? 0) > 0) badges.push("Record battu");
  if ((breakdown?.firstBossXp ?? 0) > 0) badges.push("Premier boss");
  hud.runRecapBadges.textContent = badges.length > 0 ? badges.join(" - ") : "Run terminee";

  const rows = [
    ["Niveau de run", breakdown?.runLevelXp ?? 0],
    ["Vague atteinte", breakdown?.waveXp ?? 0],
    ["Boss detruits", breakdown?.bossXp ?? 0],
    ["Premiers boss", breakdown?.firstBossXp ?? 0],
    ["Records", breakdown?.recordXp ?? 0],
    ["Objectifs", breakdown?.challengeXp ?? 0],
  ] as const;

  for (const [label, value] of rows.filter(([, value]) => value > 0)) {
    const row = document.createElement("div");
    row.className = "breakdown-row";
    row.innerHTML = `<span>${label}</span><strong>+${formatNumber(value)} XP</strong>`;
    hud.runRewardBreakdown.appendChild(row);
  }

  if (!hud.runRewardBreakdown.childElementCount) {
    const row = document.createElement("div");
    row.className = "breakdown-row";
    row.innerHTML = "<span>Progression</span><strong>Aucun gain</strong>";
    hud.runRewardBreakdown.appendChild(row);
  }
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
  const boss = enemies.find((enemy) => enemy.role === "boss");
  hud.bossPanel.dataset.active = boss ? "true" : "false";
  if (boss) {
    hud.bossName.textContent = `Boss vague ${state.wave}`;
    hud.bossBar.style.width = `${clamp(boss.hp / boss.maxHp, 0, 1) * 100}%`;
  } else {
    hud.bossBar.style.width = "0%";
  }
  updateStats();
  updateItemBar();
  if (state.mode !== "playing" && state.mode !== "paused") {
    updateChallengePanels();
    updateHangarPanels();
  }
}

export function flushSimulationHud(force = false): void {
  const events = consumeSimulationEvents();
  if (events.gameOver) {
    showGameOver();
    return;
  }
  if (events.loadout) {
    updateLoadout();
  }
  if (events.upgrade && state.pendingUpgrades > 0 && state.mode === "playing") {
    showUpgrade();
    return;
  }
  if (events.chest && state.pendingChests > 0 && state.mode === "playing") {
    showChest();
    return;
  }
  if (force || events.hud) {
    updateHud();
  }
}

export function showUpgrade(): void {
  if (state.mode !== "upgrade") {
    rememberFocusBeforeModal(hud.upgradeOverlay);
    upgradeRunTotal = Math.max(1, state.pendingUpgrades);
  }
  state.mode = "upgrade";
  state.pendingUpgrades = Math.max(1, state.pendingUpgrades);
  if (state.pendingUpgrades > upgradeRunTotal) {
    upgradeRunTotal = state.pendingUpgrades;
  }
  const currentPick = Math.max(1, upgradeRunTotal - state.pendingUpgrades + 1);

  hud.upgradeTitle.textContent = `Niveau ${state.level} atteint`;
  hud.upgradeStep.textContent =
    upgradeRunTotal > 1 ? `${currentPick} / ${upgradeRunTotal}` : "";
  hud.upgradeStep.dataset.active = upgradeRunTotal > 1 ? "true" : "false";

  hud.upgradeGrid.innerHTML = "";

  const choices = pickUpgrades(3);
  for (const [index, choice] of choices.entries()) {
    const { upgrade, tier } = choice;
    const choiceId = `upgrade-choice-${index + 1}`;
    const tierId = `${choiceId}-tier`;
    const titleId = `${choiceId}-title`;
    const descriptionId = `${choiceId}-description`;
    const effectId = `${choiceId}-effect`;
    const buildInfoId = `${choiceId}-build-info`;
    const activeSynergies = activeSynergiesForTags(upgrade.tags);
    const rank = tierRank(tier.id);
    const cipher = cipherFor(upgrade.id, tier.short, index);
    const card = document.createElement("button");
    card.className = "upgrade-card";
    card.type = "button";
    card.dataset.choiceIndex = String(index + 1);
    card.dataset.tier = tier.id;
    card.dataset.tierRank = String(rank);
    card.setAttribute("aria-labelledby", `${choiceId} ${titleId} ${tierId}`);
    card.setAttribute("aria-describedby", `${descriptionId} ${effectId} ${buildInfoId}`);
    card.style.setProperty("--tier-color", tier.color);
    card.style.setProperty("--tier-glow", tier.glow);
    card.style.setProperty("--card-delay", `${index * 70}ms`);

    const chevrons = Array.from({ length: 4 }, (_, i) => {
      const filled = i < rank ? " is-filled" : "";
      return `<span class="tier-chevron${filled}" aria-hidden="true"></span>`;
    }).join("");

    card.innerHTML = `
      <span class="sr-only" id="${choiceId}">Choix ${index + 1}</span>
      <span class="lock-tick lt-tl" aria-hidden="true"></span>
      <span class="lock-tick lt-tr" aria-hidden="true"></span>
      <span class="lock-tick lt-bl" aria-hidden="true"></span>
      <span class="lock-tick lt-br" aria-hidden="true"></span>
      <span class="cipher-strip" aria-hidden="true">
        <span class="cipher-dot"></span>
        <span class="cipher-code">${cipher}</span>
        <span class="choice-key">${index + 1}</span>
      </span>
      <span class="tier-row" id="${tierId}" aria-label="Niveau ${tier.short} sur T4 - ${tier.name}">
        <span class="tier-chevrons" aria-hidden="true">${chevrons}</span>
        <span class="tier-name" aria-hidden="true">${tier.name}</span>
      </span>
      ${renderBuildTags(upgrade.tags)}
      ${renderSynergyBadges(activeSynergies)}
      <span class="sr-only" id="${buildInfoId}">${buildInfoText(upgrade.tags, activeSynergies)}</span>
      <span class="upgrade-stamp" aria-hidden="true">
        <span class="upgrade-stamp-rivet"></span>
        <span class="upgrade-stamp-glyph">${upgrade.icon}</span>
      </span>
      <span class="upgrade-copy">
        <h3 id="${titleId}">${upgrade.name}</h3>
        <p id="${descriptionId}">${upgrade.description}</p>
      </span>
      <strong class="upgrade-effect" id="${effectId}">
        <span class="upgrade-effect-arrow" aria-hidden="true">&#9656;</span>
        <span class="upgrade-effect-text">${upgrade.effect(tier)}</span>
      </strong>
    `;
    card.addEventListener("click", () => onUpgradeChoice(choice));
    hud.upgradeGrid.appendChild(card);
  }

  hud.upgradeOverlay.classList.add("active");
  setOverlayFocusScope("upgradeOverlay");
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

  upgradeRunTotal = 0;
  hud.upgradeStep.textContent = "";
  hud.upgradeStep.dataset.active = "false";
  hideOverlays();
  if (state.pendingChests > 0) {
    showChest();
    return;
  }

  state.mode = "playing";
  updateHud();
  restoreFocusAfterModal();
}

export function showChest(): void {
  if (state.mode !== "chest") {
    rememberFocusBeforeModal(hud.chestOverlay);
  }
  state.mode = "chest";
  hud.chestGrid.innerHTML = "";

  const choices = pickRelicChoices(3);
  for (const [index, choice] of choices.entries()) {
    const { relic } = choice;
    const choiceId = `relic-choice-${index + 1}`;
    const titleId = `${choiceId}-title`;
    const descriptionId = `${choiceId}-description`;
    const effectId = `${choiceId}-effect`;
    const buildInfoId = `${choiceId}-build-info`;
    const activeSynergies = activeSynergiesForTags(relic.tags);
    const cipher = cipherFor(relic.id, "R", index);
    const card = document.createElement("button");
    card.className = "upgrade-card relic-card";
    card.type = "button";
    card.dataset.choiceIndex = String(index + 1);
    card.dataset.tier = "relic";
    card.dataset.tierRank = "2";
    card.setAttribute("aria-labelledby", `${choiceId} ${titleId}`);
    card.setAttribute("aria-describedby", `${descriptionId} ${effectId} ${buildInfoId}`);
    card.style.setProperty("--tier-color", relic.color);
    card.style.setProperty("--tier-glow", "rgba(255, 191, 71, 0.24)");
    card.style.setProperty("--card-delay", `${index * 70}ms`);

    card.innerHTML = `
      <span class="sr-only" id="${choiceId}">Relique ${index + 1}</span>
      <span class="lock-tick lt-tl" aria-hidden="true"></span>
      <span class="lock-tick lt-tr" aria-hidden="true"></span>
      <span class="lock-tick lt-bl" aria-hidden="true"></span>
      <span class="lock-tick lt-br" aria-hidden="true"></span>
      <span class="cipher-strip" aria-hidden="true">
        <span class="cipher-dot"></span>
        <span class="cipher-code">${cipher}</span>
        <span class="choice-key">${index + 1}</span>
      </span>
      <span class="tier-row" aria-hidden="true">
        <span class="tier-chevrons">
          <span class="tier-chevron is-filled"></span>
          <span class="tier-chevron is-filled"></span>
          <span class="tier-chevron"></span>
          <span class="tier-chevron"></span>
        </span>
        <span class="tier-name">Relique de run</span>
      </span>
      ${renderBuildTags(relic.tags)}
      ${renderSynergyBadges(activeSynergies)}
      <span class="sr-only" id="${buildInfoId}">${buildInfoText(relic.tags, activeSynergies)}</span>
      <span class="upgrade-stamp" aria-hidden="true">
        <span class="upgrade-stamp-rivet"></span>
        <span class="upgrade-stamp-glyph">${relic.icon}</span>
      </span>
      <span class="upgrade-copy">
        <h3 id="${titleId}">${relic.name}</h3>
        <p id="${descriptionId}">${relic.description}</p>
      </span>
      <strong class="upgrade-effect" id="${effectId}">
        <span class="upgrade-effect-arrow" aria-hidden="true">&#9656;</span>
        <span class="upgrade-effect-text">${relic.effect}</span>
      </strong>
    `;
    card.addEventListener("click", () => onRelicChoice(choice));
    hud.chestGrid.appendChild(card);
  }

  hud.chestOverlay.classList.add("active");
  setOverlayFocusScope("chestOverlay");
  updateLoadout();
  requestAnimationFrame(() =>
    hud.chestGrid.querySelector<HTMLButtonElement>("button")?.focus(),
  );
}

function onRelicChoice(choice: RelicChoice): void {
  applyRelicChoice(choice);
  state.pendingChests = Math.max(0, state.pendingChests - 1);
  updateLoadout();
  if (state.pendingChests > 0) {
    showChest();
    return;
  }

  hideOverlays();
  if (state.pendingUpgrades > 0) {
    showUpgrade();
    return;
  }

  state.mode = "playing";
  updateHud();
  restoreFocusAfterModal();
}

export function showGameOver(): void {
  state.mode = "gameover";
  if (!state.runRewardClaimed) {
    awardRunAccountProgress({
      wave: state.wave,
      runLevel: state.level,
      score: state.score,
      bossWaves: state.runBossWaves,
    });
    state.runRewardClaimed = true;
  }
  hud.finalScore.textContent = Math.floor(state.score).toLocaleString("fr-FR");
  hud.finalWave.textContent = String(state.wave);
  renderRunRecap();
  updateChallengePanels();
  updateHangarPanels();
  hud.gameOverOverlay.classList.add("active");
  setOverlayFocusScope("gameOverOverlay");
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
  setOverlayFocusScope("pauseOverlay");
  requestAnimationFrame(() =>
    document.querySelector<HTMLButtonElement>("#resumeButton")?.focus(),
  );
}

export function resumeGame(): void {
  if (state.mode !== "paused") return;
  state.mode = "playing";
  hud.pauseOverlay.classList.remove("active");
  setOverlayFocusScope();
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

export function selectRelicByIndex(index: number): boolean {
  if (state.mode !== "chest") return false;
  const card = hud.chestGrid.querySelector<HTMLButtonElement>(
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

export function moveRelicFocus(direction: number): void {
  const cards = [...hud.chestGrid.querySelectorAll<HTMLButtonElement>(".upgrade-card")];
  if (!cards.length) return;

  const currentIndex = Math.max(
    0,
    cards.indexOf(document.activeElement as HTMLButtonElement),
  );
  const nextIndex = (currentIndex + direction + cards.length) % cards.length;
  cards[nextIndex]?.focus();
}

import {
  START_STAGE_CRYSTAL_BONUS_PER_STAGE,
} from "../game/account-progression";
import { characterCatalog, findCharacter } from "../game/character-catalog";
import {
  canPurchaseLevel,
  isMetaUpgradeRevealed,
  metaUpgradeCatalog,
  metaUpgradeLevel,
  nextLevelCost,
  recommendMetaUpgrade,
} from "../game/meta-upgrade-catalog";
import { weaponCatalog, findWeapon } from "../game/weapon-catalog";
import {
  accountProgress,
  equipWeapon,
  purchaseMetaUpgradeLevel,
  saveAccountProgress,
  selectCharacter,
  selectStartStage,
} from "../systems/account";
import { BUILD_TAG_META } from "../systems/synergies";
import type {
  CharacterId,
  MetaUpgrade,
  MetaUpgradeId,
  UnlockRequirement,
  WeaponId,
} from "../types";

const dom = {
  crystals: () => document.querySelectorAll<HTMLElement>("[data-account-crystals]"),
  rewards: () => document.querySelectorAll<HTMLElement>("[data-account-reward]"),
  recommendation: () => document.querySelector<HTMLElement>("[data-recommendation]"),
  uniquesList: () => document.querySelector<HTMLUListElement>("[data-uniques-list]"),
  categoriesList: () => document.querySelector<HTMLUListElement>("[data-categories-list]"),
  pillCharacter: () => document.querySelector<HTMLElement>("[data-pill-character]"),
  pillWeapon: () => document.querySelector<HTMLElement>("[data-pill-weapon]"),
  pillStage: () => document.querySelector<HTMLElement>("[data-pill-stage]"),
  recordsSummary: () => document.querySelector<HTMLElement>("[data-records-summary]"),
  recordStage: () => document.querySelector<HTMLElement>("#recordStage"),
  recordTime: () => document.querySelector<HTMLElement>("#recordTime"),
  recordScore: () => document.querySelector<HTMLElement>("#recordScore"),
  recordBosses: () => document.querySelector<HTMLElement>("#recordBosses"),
  recordLevel: () => document.querySelector<HTMLElement>("#recordLevel"),
  rewardBar: () => document.querySelector<HTMLElement>("[data-reward]"),
  rewardText: () => document.querySelector<HTMLElement>("[data-reward-text]"),
  rewardDismiss: () => document.querySelector<HTMLElement>("[data-reward-dismiss]"),
};

export function bindCockpit(): void {
  bindLoadoutPills();
  bindRewardDismiss();
}

export function renderCockpit(): void {
  for (const element of dom.crystals()) {
    element.textContent = formatNumber(accountProgress.crystals);
  }
  for (const element of dom.rewards()) {
    element.textContent = rewardLabel();
  }
  renderLoadoutPills();
  renderRecommendation();
  renderUniques();
  renderCategories();
  renderRecords();
  renderRewardBar();
}

function bindLoadoutPills(): void {
  const character = document.querySelector<HTMLElement>('[data-pill="character"]');
  const weapon = document.querySelector<HTMLElement>('[data-pill="weapon"]');
  const stage = document.querySelector<HTMLElement>('[data-pill="stage"]');

  bindArrowButtons(character, () => cyclePill("character", -1), () => cyclePill("character", 1));
  bindArrowButtons(weapon, () => cyclePill("weapon", -1), () => cyclePill("weapon", 1));
  bindArrowButtons(stage, () => cyclePill("stage", -1), () => cyclePill("stage", 1));
}

function bindArrowButtons(
  pill: HTMLElement | null,
  onPrev: () => void,
  onNext: () => void,
): void {
  if (!pill) return;
  pill.querySelector<HTMLButtonElement>("[data-pill-prev]")?.addEventListener("click", onPrev);
  pill.querySelector<HTMLButtonElement>("[data-pill-next]")?.addEventListener("click", onNext);
}

function bindRewardDismiss(): void {
  dom.rewardDismiss()?.addEventListener("click", () => {
    accountProgress.lastRunReward = null;
    saveAccountProgress();
    renderRewardBar();
  });
}

function cyclePill(kind: "character" | "weapon" | "stage", delta: 1 | -1): void {
  if (kind === "character") {
    const owned = ownedCharacters();
    const current = owned.indexOf(accountProgress.selectedCharacterId);
    const next = owned[(current + delta + owned.length) % owned.length];
    if (next && selectCharacter(next)) renderCockpit();
    return;
  }
  if (kind === "weapon") {
    const owned = ownedWeapons();
    const current = owned.indexOf(accountProgress.selectedWeaponId);
    const next = owned[(current + delta + owned.length) % owned.length];
    if (next && equipWeapon(next)) renderCockpit();
    return;
  }
  const max = accountProgress.highestStartStageUnlocked;
  const next = ((accountProgress.selectedStartStage - 1 + delta + max) % max) + 1;
  if (selectStartStage(next)) renderCockpit();
}

function ownedCharacters(): CharacterId[] {
  return characterCatalog
    .map((character) => character.id)
    .filter((id) => id === "pilot" || hasUniqueForCharacter(id));
}

function ownedWeapons(): WeaponId[] {
  return weaponCatalog
    .map((weapon) => weapon.id)
    .filter((id) => id === "pulse" || hasUniqueForWeapon(id));
}

function hasUniqueForCharacter(id: CharacterId): boolean {
  const upgrade = metaUpgradeCatalog.find((entry) => entry.characterId === id);
  return upgrade !== undefined && metaUpgradeLevel(accountProgress, upgrade.id) >= 1;
}

function hasUniqueForWeapon(id: WeaponId): boolean {
  const upgrade = metaUpgradeCatalog.find((entry) => entry.weaponId === id);
  return upgrade !== undefined && metaUpgradeLevel(accountProgress, upgrade.id) >= 1;
}

function renderLoadoutPills(): void {
  const character = findCharacter(accountProgress.selectedCharacterId);
  const weapon = findWeapon(accountProgress.selectedWeaponId);
  if (dom.pillCharacter()) dom.pillCharacter()!.textContent = character.name;
  if (dom.pillWeapon()) dom.pillWeapon()!.textContent = weapon.name;
  if (dom.pillStage()) dom.pillStage()!.textContent = stageLabel(accountProgress.selectedStartStage);
}

function stageLabel(stage: number): string {
  if (stage === 1) return "1";
  const bonus = Math.round((stage - 1) * START_STAGE_CRYSTAL_BONUS_PER_STAGE * 100);
  return `${stage}  +${bonus}% ◆`;
}

function renderUniques(): void {
  const list = dom.uniquesList();
  if (!list) return;
  const uniques = metaUpgradeCatalog.filter((entry) => entry.kind === "unique");
  const recommendedId = recommendationUpgradeId();
  list.replaceChildren(...uniques.map((upgrade) => renderUpgradeCard(upgrade, recommendedId)));
}

function renderCategories(): void {
  const list = dom.categoriesList();
  if (!list) return;
  const categories = metaUpgradeCatalog.filter((entry) => entry.kind === "category");
  const recommendedId = recommendationUpgradeId();
  list.replaceChildren(...categories.map((upgrade) => renderUpgradeCard(upgrade, recommendedId)));
}

function recommendationUpgradeId(): MetaUpgradeId | null {
  const recommendation = recommendMetaUpgrade(accountProgress);
  return recommendation.state === "complete" ? null : recommendation.upgrade.id;
}

function renderRecommendation(): void {
  const panel = dom.recommendation();
  if (!panel) return;

  const recommendation = recommendMetaUpgrade(accountProgress);
  panel.dataset.state = recommendation.state;
  panel.replaceChildren();

  const heading = document.createElement("div");
  heading.className = "hangar-recommendation-head";

  const eyebrow = document.createElement("span");
  eyebrow.className = "hangar-panel-kicker";
  eyebrow.textContent = "Prochain achat";

  const title = document.createElement("strong");
  title.className = "hangar-recommendation-title";

  heading.append(eyebrow, title);

  if (recommendation.state === "complete") {
    title.textContent = "Hangar complet";
    const detail = document.createElement("p");
    detail.className = "hangar-recommendation-copy";
    detail.textContent = "Tous les modules persistants sont au maximum.";
    panel.append(heading, detail);
    return;
  }

  const { upgrade, level, cost } = recommendation;
  panel.style.setProperty("--accent", upgradeAccent(upgrade));
  title.textContent = upgrade.name;

  const detail = document.createElement("p");
  detail.className = "hangar-recommendation-copy";
  detail.textContent = upgradeNextText(upgrade, level - 1);

  const footer = document.createElement("div");
  footer.className = "hangar-recommendation-foot";

  const state = document.createElement("span");
  state.className = "hangar-recommendation-state";
  if (recommendation.state === "purchase") {
    state.textContent = `Niveau ${level} pret`;
  } else if (recommendation.state === "save") {
    state.textContent = `Encore ${formatNumber(recommendation.missing)} cristaux`;
  } else {
    state.textContent = requirementLabel(upgrade.requirement);
  }

  const price = document.createElement("span");
  price.className = "hangar-recommendation-price";
  price.innerHTML = `<strong>${formatNumber(cost)}</strong> <span aria-hidden="true">&#9670;</span>`;
  price.setAttribute("aria-label", `${formatNumber(cost)} cristaux requis`);

  footer.append(state, price);
  const action = renderRecommendationAction(recommendation);
  if (action) footer.appendChild(action);
  panel.append(heading, detail, footer);
}

function renderRecommendationAction(
  recommendation: ReturnType<typeof recommendMetaUpgrade>,
): HTMLButtonElement | null {
  if (recommendation.state !== "purchase") return null;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "hangar-recommendation-action";
  button.textContent = "Acheter";
  button.addEventListener("click", () => {
    const result = purchaseMetaUpgradeLevel(recommendation.upgrade.id);
    if (result.ok) {
      renderCockpit();
    } else {
      flashCard(dom.recommendation());
    }
  });
  return button;
}

function renderUpgradeCard(
  upgrade: MetaUpgrade,
  recommendedId: MetaUpgradeId | null,
): HTMLLIElement {
  const li = document.createElement("li");
  li.className = "hangar-upgrade-card";
  li.dataset.kind = upgrade.kind;
  if (upgrade.tag) li.dataset.tag = upgrade.tag;
  li.style.setProperty("--accent", upgradeAccent(upgrade));

  const level = metaUpgradeLevel(accountProgress, upgrade.id);
  const purchase = canPurchaseLevel(accountProgress, upgrade.id);
  const revealed = isMetaUpgradeRevealed(accountProgress, upgrade);
  li.dataset.state = cardState(upgrade, level, purchase.ok, revealed);
  li.dataset.recommended = upgrade.id === recommendedId ? "true" : "false";

  li.append(
    renderCardHead(upgrade, level),
    renderCardDetail(upgrade, level),
    renderCardMeta(upgrade, level, purchase, revealed),
    renderCardAction(upgrade, level, purchase, revealed),
  );

  return li;
}

function cardState(
  upgrade: MetaUpgrade,
  level: number,
  canPurchase: boolean,
  revealed: boolean,
): HangarCardState {
  if (level >= upgrade.maxLevel) return upgrade.kind === "unique" ? "owned" : "max";
  if (!revealed) return "locked";
  if (canPurchase) return "available";
  return "insufficient";
}

function renderCardHead(upgrade: MetaUpgrade, level: number): HTMLElement {
  const head = document.createElement("div");
  head.className = "hangar-card-head";

  const titleBlock = document.createElement("div");
  titleBlock.className = "hangar-card-titleblock";

  const kind = document.createElement("span");
  kind.className = "hangar-card-kind";
  kind.textContent = upgrade.kind === "unique" ? "Deblocage" : "Specialisation";

  const name = document.createElement("span");
  name.className = "hangar-card-name";
  name.textContent = upgrade.name;
  titleBlock.append(kind, name);
  head.appendChild(titleBlock);

  if (upgrade.kind === "category") {
    head.appendChild(renderPips(upgrade, level));
  } else {
    const once = document.createElement("span");
    once.className = "hangar-card-once";
    once.textContent = level >= upgrade.maxLevel ? "Acquis" : "A vie";
    head.appendChild(once);
  }
  return head;
}

const PIP_COLOR_BY_TAG: Record<string, string> = {
  cannon: "var(--cyan)",
  pierce: "var(--cyan)",
  crit: "var(--red)",
  drone: "var(--mint)",
  shield: "var(--mint)",
  magnet: "var(--amber)",
  salvage: "var(--amber)",
};

type HangarCardState = "owned" | "max" | "locked" | "available" | "insufficient";

function renderPips(upgrade: MetaUpgrade, level: number): HTMLElement {
  const wrap = document.createElement("span");
  wrap.className = "hangar-card-pips";
  wrap.setAttribute("aria-label", `niveau ${level} sur ${upgrade.maxLevel}`);
  if (upgrade.tag) {
    wrap.style.setProperty("--pip-color", PIP_COLOR_BY_TAG[upgrade.tag] ?? "var(--cyan)");
  }
  for (let i = 0; i < upgrade.maxLevel; i += 1) {
    const pip = document.createElement("span");
    pip.className = "hangar-pip";
    pip.dataset.filled = i < level ? "true" : "false";
    pip.dataset.next = i === level ? "true" : "false";
    wrap.appendChild(pip);
  }
  return wrap;
}

function renderCardDetail(upgrade: MetaUpgrade, level: number): HTMLElement {
  const detail = document.createElement("p");
  detail.className = "hangar-card-detail";
  detail.textContent = upgradeNextText(upgrade, level);
  return detail;
}

function upgradeNextText(upgrade: MetaUpgrade, level: number): string {
  if (upgrade.kind === "unique") {
    return upgrade.description;
  }
  if (level >= upgrade.maxLevel) {
    return "Niveau maximum atteint.";
  }
  const next = upgrade.levels?.[level];
  return next?.summary ?? upgrade.description;
}

function renderCardMeta(
  upgrade: MetaUpgrade,
  level: number,
  purchase: ReturnType<typeof canPurchaseLevel>,
  revealed: boolean,
): HTMLElement {
  const meta = document.createElement("div");
  meta.className = "hangar-card-meta";

  const status = document.createElement("span");
  status.className = "hangar-card-status";
  status.textContent = cardStateLabel(upgrade, level, purchase.ok, revealed);

  const value = document.createElement("span");
  value.className = "hangar-card-cost";
  if (level >= upgrade.maxLevel) {
    value.textContent = upgrade.kind === "unique" ? "Possede" : `${level}/${upgrade.maxLevel}`;
    meta.append(status, value);
    return meta;
  }
  if (!revealed) {
    value.textContent = requirementLabel(upgrade.requirement);
    meta.append(status, value);
    return meta;
  }
  const cost = nextLevelCost(accountProgress, upgrade.id) ?? 0;
  value.dataset.affordable = purchase.ok ? "true" : "false";
  value.innerHTML = `<strong>${formatNumber(cost)}</strong> <span aria-hidden="true">&#9670;</span>`;
  value.setAttribute(
    "aria-label",
    `${formatNumber(cost)} cristaux requis`,
  );
  meta.append(status, value);
  return meta;
}

function cardStateLabel(
  upgrade: MetaUpgrade,
  level: number,
  canPurchase: boolean,
  revealed: boolean,
): string {
  const state = cardState(upgrade, level, canPurchase, revealed);
  switch (state) {
    case "owned":
      return "Acquis";
    case "max":
      return "Maximum";
    case "locked":
      return "Verrouille";
    case "available":
      return "Achetable";
    case "insufficient":
      return "A economiser";
  }
}

function renderCardAction(
  upgrade: MetaUpgrade,
  level: number,
  purchase: ReturnType<typeof canPurchaseLevel>,
  revealed: boolean,
): HTMLElement {
  if (level >= upgrade.maxLevel || !revealed) {
    const span = document.createElement("span");
    span.className = "hangar-card-action hangar-card-action--silent";
    span.textContent = level >= upgrade.maxLevel ? "Stable" : "Objectif";
    return span;
  }
  const button = document.createElement("button");
  button.type = "button";
  button.className = "hangar-card-action";
  button.dataset.kind = purchase.ok ? "buy" : "wait";
  button.disabled = !purchase.ok;
  button.textContent = purchase.ok
    ? upgrade.kind === "unique"
      ? "Acheter"
      : `Niveau ${level + 1}`
    : `Manque ${formatNumber(Math.max(0, (nextLevelCost(accountProgress, upgrade.id) ?? 0) - accountProgress.crystals))}`;
  button.setAttribute(
    "aria-label",
    `Acheter ${upgrade.name}, ${formatNumber(nextLevelCost(accountProgress, upgrade.id) ?? 0)} cristaux`,
  );
  button.addEventListener("click", () => {
    const result = purchaseMetaUpgradeLevel(upgrade.id);
    if (result.ok) {
      renderCockpit();
    } else {
      flashCard(button.closest<HTMLElement>(".hangar-upgrade-card"));
    }
  });
  return button;
}

function upgradeAccent(upgrade: MetaUpgrade): string {
  if (upgrade.tag) return BUILD_TAG_META[upgrade.tag]?.color ?? "var(--cyan)";
  if (upgrade.weaponId) return "var(--cyan)";
  if (upgrade.characterId) return "var(--mint)";
  return "var(--amber)";
}

function flashCard(card: HTMLElement | null): void {
  if (!card) return;
  card.dataset.refused = "true";
  setTimeout(() => card.removeAttribute("data-refused"), 220);
}

function requirementLabel(requirement: UnlockRequirement): string {
  switch (requirement) {
    case "available":
      return "";
    case "reach-10m":
      return "10 minutes de jeu";
    case "clear-stage-1":
      return "battre le boss du stage 1";
    case "reach-stage-2":
      return "atteindre le stage 2";
    case "boss-kill":
      return "battre un boss";
  }
}

function renderRecords(): void {
  const r = accountProgress.records;
  if (dom.recordStage()) dom.recordStage()!.textContent = String(Math.max(1, r.bestStage));
  if (dom.recordTime()) dom.recordTime()!.textContent = formatTime(r.bestTimeSeconds);
  if (dom.recordScore()) dom.recordScore()!.textContent = formatNumber(r.bestScore);
  if (dom.recordBosses()) dom.recordBosses()!.textContent = String(r.bossKills);
  if (dom.recordLevel()) dom.recordLevel()!.textContent = String(Math.max(1, r.bestRunLevel));
  if (dom.recordsSummary()) {
    dom.recordsSummary()!.textContent = `Records: stage ${Math.max(1, r.bestStage)} · ${formatTime(
      r.bestTimeSeconds,
    )} · ${r.bossKills} boss tues`;
  }
}

function renderRewardBar(): void {
  const bar = dom.rewardBar();
  const text = dom.rewardText();
  if (!bar || !text) return;
  const reward = accountProgress.lastRunReward;
  if (!reward || reward.crystalsGained <= 0) {
    bar.hidden = true;
    return;
  }
  bar.hidden = false;
  const parts = [`+${formatNumber(reward.crystalsGained)} ◆`];
  if (reward.newlyUnlockedStartStage) {
    parts.push(`stage ${reward.newlyUnlockedStartStage} debloque`);
  }
  if (reward.newRecords.length > 0) {
    parts.push(`record ${reward.newRecords.join(", ")}`);
  }
  text.textContent = parts.join(" · ");
}

function rewardLabel(): string {
  const reward = accountProgress.lastRunReward;
  if (!reward || reward.crystalsGained <= 0) return "Aucun cristal gagne";
  return `+${formatNumber(reward.crystalsGained)} cristaux`;
}

function formatNumber(value: number): string {
  return Math.floor(value).toLocaleString("fr-FR");
}

function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

export type { MetaUpgradeId };

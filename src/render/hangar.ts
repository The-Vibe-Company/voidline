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
} from "../game/meta-upgrade-catalog";
import { weaponCatalog, findWeapon } from "../game/weapon-catalog";
import {
  accountProgress,
  equipWeapon,
  purchaseMetaUpgradeLevel,
  selectCharacter,
  selectStartStage,
} from "../systems/account";
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
  list.replaceChildren(...uniques.map((upgrade) => renderRow(upgrade)));
}

function renderCategories(): void {
  const list = dom.categoriesList();
  if (!list) return;
  const categories = metaUpgradeCatalog.filter((entry) => entry.kind === "category");
  list.replaceChildren(...categories.map((upgrade) => renderRow(upgrade)));
}

function renderRow(upgrade: MetaUpgrade): HTMLLIElement {
  const li = document.createElement("li");
  li.className = "hangar-row";
  li.dataset.kind = upgrade.kind;
  if (upgrade.tag) li.dataset.tag = upgrade.tag;

  const level = metaUpgradeLevel(accountProgress, upgrade.id);
  const purchase = canPurchaseLevel(accountProgress, upgrade.id);
  const revealed = isMetaUpgradeRevealed(accountProgress, upgrade);
  li.dataset.state = rowState(upgrade, level, purchase.ok, revealed);

  li.append(
    renderRowHead(upgrade, level),
    renderRowDetail(upgrade, level),
    renderRowMeta(upgrade, level, purchase, revealed),
    renderRowAction(upgrade, level, purchase, revealed),
  );

  return li;
}

function rowState(
  upgrade: MetaUpgrade,
  level: number,
  canPurchase: boolean,
  revealed: boolean,
): string {
  if (level >= upgrade.maxLevel) return upgrade.kind === "unique" ? "owned" : "max";
  if (!revealed) return "locked";
  if (canPurchase) return "available";
  return "insufficient";
}

function renderRowHead(upgrade: MetaUpgrade, level: number): HTMLElement {
  const head = document.createElement("div");
  head.className = "hangar-row-head";
  const name = document.createElement("span");
  name.className = "hangar-row-name";
  name.textContent = upgrade.name;
  head.appendChild(name);
  if (upgrade.kind === "category") {
    head.appendChild(renderPips(upgrade, level));
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

function renderPips(upgrade: MetaUpgrade, level: number): HTMLElement {
  const wrap = document.createElement("span");
  wrap.className = "hangar-row-pips";
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

function renderRowDetail(upgrade: MetaUpgrade, level: number): HTMLElement {
  const detail = document.createElement("p");
  detail.className = "hangar-row-detail";
  if (upgrade.kind === "unique") {
    detail.textContent = upgrade.description;
    return detail;
  }
  if (level >= upgrade.maxLevel) {
    detail.textContent = "Niveau maximum atteint.";
    return detail;
  }
  const next = upgrade.levels?.[level];
  detail.textContent = next?.summary ?? upgrade.description;
  return detail;
}

function renderRowMeta(
  upgrade: MetaUpgrade,
  level: number,
  purchase: ReturnType<typeof canPurchaseLevel>,
  revealed: boolean,
): HTMLElement {
  const meta = document.createElement("span");
  meta.className = "hangar-row-meta";
  if (level >= upgrade.maxLevel) {
    meta.textContent = upgrade.kind === "unique" ? "Possede" : "Max";
    return meta;
  }
  if (!revealed) {
    meta.textContent = requirementLabel(upgrade.requirement);
    return meta;
  }
  const cost = nextLevelCost(accountProgress, upgrade.id) ?? 0;
  meta.dataset.affordable = purchase.ok ? "true" : "false";
  meta.innerHTML = `<strong>${formatNumber(cost)}</strong> <span aria-hidden="true">&#9670;</span>`;
  meta.setAttribute(
    "aria-label",
    `${formatNumber(cost)} cristaux requis`,
  );
  return meta;
}

function renderRowAction(
  upgrade: MetaUpgrade,
  level: number,
  purchase: ReturnType<typeof canPurchaseLevel>,
  revealed: boolean,
): HTMLElement {
  if (level >= upgrade.maxLevel || !revealed) {
    const span = document.createElement("span");
    span.className = "hangar-row-action hangar-row-action--silent";
    return span;
  }
  const button = document.createElement("button");
  button.type = "button";
  button.className = "hangar-row-action";
  button.dataset.kind = purchase.ok ? "buy" : "wait";
  button.disabled = !purchase.ok;
  button.textContent = upgrade.kind === "unique" ? "Acheter" : `Lv ${level + 1}`;
  button.setAttribute(
    "aria-label",
    `Acheter ${upgrade.name}, ${formatNumber(nextLevelCost(accountProgress, upgrade.id) ?? 0)} cristaux`,
  );
  button.addEventListener("click", () => {
    const result = purchaseMetaUpgradeLevel(upgrade.id);
    if (result.ok) {
      renderCockpit();
    } else {
      flashRow(button.closest<HTMLElement>(".hangar-row"));
    }
  });
  return button;
}

function flashRow(row: HTMLElement | null): void {
  if (!row) return;
  row.dataset.refused = "true";
  setTimeout(() => row.removeAttribute("data-refused"), 220);
}

function requirementLabel(requirement: UnlockRequirement): string {
  switch (requirement) {
    case "available":
      return "";
    case "reach-10m":
      return "verrouille, 10 minutes de jeu";
    case "clear-stage-1":
      return "verrouille, battre le boss du stage 1";
    case "reach-stage-2":
      return "verrouille, atteindre le stage 2";
    case "boss-kill":
      return "verrouille, battre un boss";
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

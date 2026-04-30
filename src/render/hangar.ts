import { START_STAGE_CRYSTAL_BONUS_PER_STAGE } from "../game/account-progression";
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
  saveAccountProgress,
  selectCharacter,
  selectStartStage,
} from "../systems/account";
import { resetGame } from "../systems/waves";
import type {
  CharacterId,
  MetaUpgrade,
  MetaUpgradeId,
  Player,
  UnlockRequirement,
  WeaponId,
} from "../types";

type ScreenId = "title" | "loadout" | "shop";

type ShopGroupId = "weapons" | "pilots" | "specs" | "options";

interface ShopGroup {
  id: ShopGroupId;
  title: string;
  kicker: string;
  accent: "cyan" | "mint" | "amber" | "red";
  items: readonly MetaUpgrade[];
}

const SHOP_GROUP_IDS: readonly ShopGroupId[] = ["weapons", "pilots", "specs", "options"];

const SHOP_GROUP_DEFS: Record<ShopGroupId, Omit<ShopGroup, "items"> & { match: (upgrade: MetaUpgrade) => boolean }> = {
  weapons: {
    id: "weapons",
    title: "Armes",
    kicker: "Débloque de nouvelles armes de départ",
    accent: "cyan",
    match: (u) => u.kind === "unique" && Boolean(u.weaponId),
  },
  pilots: {
    id: "pilots",
    title: "Pilotes",
    kicker: "Vaisseaux alternatifs avec un profil de stats unique",
    accent: "mint",
    match: (u) => u.kind === "unique" && Boolean(u.characterId),
  },
  specs: {
    id: "specs",
    title: "Spécialisations",
    kicker: "4 chemins de build · niveaux 1 à 4 · 40 · 75 · 130 · 220",
    accent: "amber",
    match: (u) => u.kind === "category",
  },
  options: {
    id: "options",
    title: "Options",
    kicker: "Bonus définitifs",
    accent: "red",
    match: (u) => u.kind === "unique" && !u.weaponId && !u.characterId,
  },
};

const SHOP_TAG_LABEL: Record<ShopGroupId, string> = {
  weapons: "Arme",
  pilots: "Pilote",
  specs: "Spécialisation",
  options: "Bonus",
};

const dom = {
  stage: () => document.querySelector<HTMLElement>("[data-screen-stage]"),
  screens: () => document.querySelectorAll<HTMLElement>(".hangar-screen[data-screen]"),
  titleScreen: () => document.querySelector<HTMLElement>('[data-screen="title"]'),
  loadoutScreen: () => document.querySelector<HTMLElement>('[data-screen="loadout"]'),
  shopScreen: () => document.querySelector<HTMLElement>('[data-screen="shop"]'),
  crystals: () => document.querySelectorAll<HTMLElement>("[data-account-crystals]"),
  crystalHud: () => document.querySelector<HTMLElement>(".hangar-crystal-hud"),
  rewards: () => document.querySelectorAll<HTMLElement>("[data-account-reward]"),
  loadoutSummary: () => document.querySelector<HTMLElement>("[data-loadout-summary]"),
  shopSummary: () => document.querySelector<HTMLElement>("[data-shop-summary]"),
  recordsSummary: () => document.querySelector<HTMLElement>("[data-records-summary]"),
  recordStage: () => document.querySelector<HTMLElement>("#recordStage"),
  recordTime: () => document.querySelector<HTMLElement>("#recordTime"),
  recordScore: () => document.querySelector<HTMLElement>("#recordScore"),
  recordBosses: () => document.querySelector<HTMLElement>("#recordBosses"),
  recordLevel: () => document.querySelector<HTMLElement>("#recordLevel"),
  rewardBar: () => document.querySelector<HTMLElement>("[data-reward]"),
  rewardText: () => document.querySelector<HTMLElement>("[data-reward-text]"),
  rewardDismiss: () => document.querySelector<HTMLElement>("[data-reward-dismiss]"),
  characterList: () => document.querySelector<HTMLElement>('[data-loadout-list="character"]'),
  weaponList: () => document.querySelector<HTMLElement>('[data-loadout-list="weapon"]'),
  stageList: () => document.querySelector<HTMLElement>('[data-loadout-list="stage"]'),
  characterCount: () => document.querySelector<HTMLElement>('[data-loadout-count="character"]'),
  weaponCount: () => document.querySelector<HTMLElement>('[data-loadout-count="weapon"]'),
  summaryCharacter: () => document.querySelector<HTMLElement>("[data-summary-character]"),
  summaryWeapon: () => document.querySelector<HTMLElement>("[data-summary-weapon]"),
  summaryStage: () => document.querySelector<HTMLElement>("[data-summary-stage]"),
  shopTabs: () => document.querySelector<HTMLElement>("[data-shop-tabs]"),
  shopGrid: () => document.querySelector<HTMLElement>("[data-shop-grid]"),
  shopKicker: () => document.querySelector<HTMLElement>("[data-shop-kicker]"),
  toast: () => document.querySelector<HTMLElement>("[data-hangar-toast]"),
  back: () => document.querySelector<HTMLButtonElement>("[data-hangar-back]"),
  startButton: () => document.querySelector<HTMLButtonElement>("#startButton"),
  playSubButton: () => document.querySelector<HTMLButtonElement>('[data-action="play-sub"]'),
  loadoutMenu: () => document.querySelector<HTMLButtonElement>('[data-action="loadout"]'),
  shopMenu: () => document.querySelector<HTMLButtonElement>('[data-action="shop"]'),
};

let activeScreen: ScreenId = "title";
let activeShopGroup: ShopGroupId = "weapons";
let toastTimer: number | null = null;

export function bindCockpit(): void {
  bindMenuActions();
  bindBackButton();
  bindShopTabs();
  bindRewardDismiss();
  bindKeyboard();
}

export function showHangarTitle(): void {
  setActiveScreen("title", { focus: true });
}

export function renderCockpit(): void {
  for (const element of dom.crystals()) {
    element.textContent = formatNumber(accountProgress.crystals);
  }
  for (const element of dom.rewards()) {
    element.textContent = rewardLabel();
  }
  renderLoadoutSummary();
  renderShopSummary();
  renderLoadout();
  renderShop();
  renderRecords();
  renderRewardBar();
  setActiveScreen(activeScreen);
}

function bindMenuActions(): void {
  // #startButton is already wired to resetGame() in src/game/input.ts.
  dom.playSubButton()?.addEventListener("click", () => resetGame());
  dom.loadoutMenu()?.addEventListener("click", () => setActiveScreen("loadout"));
  dom.shopMenu()?.addEventListener("click", () => setActiveScreen("shop"));
}

function bindBackButton(): void {
  dom.back()?.addEventListener("click", () => setActiveScreen("title"));
}

function bindShopTabs(): void {
  const tabs = dom.shopTabs();
  if (!tabs) return;
  tabs.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const button = target.closest<HTMLButtonElement>("[data-shop-group]");
    if (!button) return;
    const id = button.dataset.shopGroup as ShopGroupId | undefined;
    if (!id || !SHOP_GROUP_IDS.includes(id)) return;
    activeShopGroup = id;
    renderShop();
  });
}

function bindRewardDismiss(): void {
  dom.rewardDismiss()?.addEventListener("click", () => {
    accountProgress.lastRunReward = null;
    saveAccountProgress();
    renderRewardBar();
  });
}

function bindKeyboard(): void {
  window.addEventListener("keydown", (event) => {
    if (!isHangarActive()) return;
    if (event.defaultPrevented) return;
    const target = event.target as HTMLElement | null;
    if (target?.matches("input, select, textarea")) return;

    if (event.code === "Escape") {
      if (activeScreen !== "title") {
        event.preventDefault();
        setActiveScreen("title");
      }
      return;
    }

    if (activeScreen !== "title") return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.code === "KeyL") {
      event.preventDefault();
      setActiveScreen("loadout");
    } else if (event.code === "KeyB") {
      event.preventDefault();
      setActiveScreen("shop");
    }
  });
}

function isHangarActive(): boolean {
  return document.querySelector<HTMLElement>("#hangarOverlay")?.classList.contains("active") ?? false;
}

function setActiveScreen(screen: ScreenId, options: { focus?: boolean } = {}): void {
  const focusChange = options.focus ?? activeScreen !== screen;
  activeScreen = screen;
  const stage = dom.stage();
  if (stage) stage.dataset.screen = screen;
  for (const element of dom.screens()) {
    const active = element.dataset.screen === screen;
    element.dataset.active = active ? "true" : "false";
    element.toggleAttribute("inert", !active);
  }
  if (!focusChange) return;
  if (screen === "title") {
    requestAnimationFrame(() => dom.startButton()?.focus({ preventScroll: true }));
  } else if (screen === "loadout") {
    requestAnimationFrame(() =>
      dom
        .loadoutScreen()
        ?.querySelector<HTMLButtonElement>(".hangar-loadout-card[data-selected='true']")
        ?.focus({ preventScroll: true }),
    );
  } else {
    requestAnimationFrame(() =>
      dom
        .shopScreen()
        ?.querySelector<HTMLButtonElement>(".hangar-shop-tab[data-active='true']")
        ?.focus({ preventScroll: true }),
    );
  }
}

function renderLoadoutSummary(): void {
  const summary = dom.loadoutSummary();
  if (!summary) return;
  const character = findCharacter(accountProgress.selectedCharacterId);
  const weapon = findWeapon(accountProgress.selectedWeaponId);
  summary.textContent = `${character.name} · ${weapon.name} · ${stageLabel(accountProgress.selectedStartStage)}`;
}

function renderShopSummary(): void {
  const summary = dom.shopSummary();
  if (!summary) return;
  const owned = metaUpgradeCatalog.filter(
    (upgrade) => metaUpgradeLevel(accountProgress, upgrade.id) >= upgrade.maxLevel,
  ).length;
  summary.textContent = `${owned}/${metaUpgradeCatalog.length} acquis · ${formatNumber(
    accountProgress.crystals,
  )} ◆`;
}

function renderLoadout(): void {
  renderCharacterList();
  renderWeaponList();
  renderStageList();
  renderLoadoutFooter();
}

function renderCharacterList(): void {
  const list = dom.characterList();
  const count = dom.characterCount();
  if (!list) return;

  const cards: HTMLElement[] = [];
  let unlocked = 0;
  for (const character of characterCatalog) {
    const upgrade = metaUpgradeCatalog.find((entry) => entry.characterId === character.id);
    const owned = character.id === "pilot" ? true : Boolean(upgrade && metaUpgradeLevel(accountProgress, upgrade.id) >= 1);
    if (owned) unlocked += 1;
    cards.push(
      renderLoadoutCard({
        kind: "character",
        id: character.id,
        name: character.name,
        icon: character.icon,
        bonus: character.bonusLabel,
        description: character.description,
        stats: characterStats(character.id),
        statKeys: ["hp", "speed", "fire"],
        statLabels: { hp: "PV", speed: "VIT", fire: "TIR" },
        selected: character.id === accountProgress.selectedCharacterId,
        locked: !owned,
        lockCost: upgrade ? upgrade.costAt(1) : undefined,
      }),
    );
  }
  list.replaceChildren(...cards);
  if (count) count.textContent = `${unlocked}/${characterCatalog.length}`;
}

function renderWeaponList(): void {
  const list = dom.weaponList();
  const count = dom.weaponCount();
  if (!list) return;
  const cards: HTMLElement[] = [];
  let unlocked = 0;
  for (const weapon of weaponCatalog) {
    const upgrade = metaUpgradeCatalog.find((entry) => entry.weaponId === weapon.id);
    const owned = weapon.id === "pulse" ? true : Boolean(upgrade && metaUpgradeLevel(accountProgress, upgrade.id) >= 1);
    if (owned) unlocked += 1;
    cards.push(
      renderLoadoutCard({
        kind: "weapon",
        id: weapon.id,
        name: weapon.name,
        icon: weapon.icon,
        bonus: weapon.id === "pulse" ? "Profil neutre · sans faiblesse" : weaponBonusLabel(weapon.id),
        description: weapon.description,
        stats: weaponStats(weapon.id),
        statKeys: ["dmg", "rate", "salvo"],
        statLabels: { dmg: "DMG", rate: "TIR", salvo: "SLV" },
        tags: weapon.tags,
        selected: weapon.id === accountProgress.selectedWeaponId,
        locked: !owned,
        lockCost: upgrade ? upgrade.costAt(1) : undefined,
      }),
    );
  }
  list.replaceChildren(...cards);
  if (count) count.textContent = `${unlocked}/${weaponCatalog.length}`;
}

function renderStageList(): void {
  const list = dom.stageList();
  if (!list) return;
  const total = Math.max(3, accountProgress.highestStartStageUnlocked + 1);
  const cards: HTMLElement[] = [];
  for (let stage = 1; stage <= total; stage += 1) {
    cards.push(renderStageCard(stage));
  }
  list.replaceChildren(...cards);
}

interface LoadoutCardSpec {
  kind: "character" | "weapon";
  id: string;
  name: string;
  icon: string;
  bonus?: string;
  description: string;
  stats: Record<string, string | number>;
  statKeys: readonly string[];
  statLabels: Record<string, string>;
  tags?: readonly string[];
  selected: boolean;
  locked: boolean;
  lockCost?: number;
}

function renderLoadoutCard(spec: LoadoutCardSpec): HTMLElement {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "hangar-loadout-card";
  card.dataset.selected = String(spec.selected);
  card.dataset.locked = String(spec.locked);
  card.setAttribute("aria-pressed", String(spec.selected));

  const icon = document.createElement("span");
  icon.className = "hangar-lc-icon";
  icon.textContent = spec.icon;

  const body = document.createElement("div");
  body.className = "hangar-lc-body";

  const name = document.createElement("p");
  name.className = "hangar-lc-name";
  name.textContent = spec.name;
  body.appendChild(name);

  if (spec.bonus) {
    const bonus = document.createElement("p");
    bonus.className = "hangar-lc-bonus";
    bonus.textContent = spec.bonus;
    body.appendChild(bonus);
  }

  const desc = document.createElement("p");
  desc.className = "hangar-lc-desc";
  desc.textContent = spec.description;
  body.appendChild(desc);

  if (spec.tags && spec.tags.length > 0) {
    const tagRow = document.createElement("div");
    tagRow.className = "hangar-lc-tags";
    for (const tag of spec.tags) {
      const chip = document.createElement("span");
      chip.className = "hangar-lc-tag";
      chip.textContent = tag;
      tagRow.appendChild(chip);
    }
    body.appendChild(tagRow);
  }

  const stats = document.createElement("div");
  stats.className = "hangar-lc-stats";
  for (const key of spec.statKeys) {
    const stat = document.createElement("span");
    stat.className = "hangar-lc-stat";
    const k = document.createElement("span");
    k.className = "key";
    k.textContent = spec.statLabels[key] ?? key;
    const v = document.createElement("span");
    v.textContent = String(spec.stats[key] ?? "—");
    stat.append(k, v);
    stats.appendChild(stat);
  }

  card.append(icon, body, stats);

  if (spec.locked && spec.lockCost !== undefined) {
    const lock = document.createElement("span");
    lock.className = "hangar-lc-lock";
    lock.textContent = `◆ ${spec.lockCost}`;
    card.appendChild(lock);
  }

  if (!spec.locked) {
    card.addEventListener("click", () => {
      if (spec.kind === "character") {
        if (selectCharacter(spec.id as CharacterId)) renderCockpit();
      } else if (equipWeapon(spec.id as WeaponId)) {
        renderCockpit();
      }
    });
  }

  return card;
}

function renderStageCard(stage: number): HTMLElement {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "hangar-stage-card";
  const unlocked = stage <= accountProgress.highestStartStageUnlocked;
  const selected = stage === accountProgress.selectedStartStage;
  card.dataset.selected = String(selected);
  card.dataset.locked = String(!unlocked);
  card.setAttribute("aria-pressed", String(selected));
  if (!unlocked) card.setAttribute("aria-disabled", "true");

  const name = document.createElement("span");
  name.className = "stage-name";
  name.textContent = `Stage ${stage}`;
  card.appendChild(name);

  const sub = document.createElement("span");
  sub.className = "stage-sub";
  sub.textContent = stage === 1 ? "Le départ habituel" : unlocked ? "Saut direct" : "Verrouillé";
  card.appendChild(sub);

  if (unlocked && stage > 1) {
    const bonus = document.createElement("span");
    bonus.className = "stage-bonus";
    const bonusPct = Math.round((stage - 1) * START_STAGE_CRYSTAL_BONUS_PER_STAGE * 100);
    bonus.textContent = `+${bonusPct}% cristaux`;
    card.appendChild(bonus);
  } else if (!unlocked) {
    const bonus = document.createElement("span");
    bonus.className = "stage-bonus";
    bonus.textContent = "Battre le boss du stage précédent";
    bonus.style.color = "var(--muted)";
    card.appendChild(bonus);
  }

  if (unlocked) {
    card.addEventListener("click", () => {
      if (selectStartStage(stage)) renderCockpit();
    });
  }

  return card;
}

function renderLoadoutFooter(): void {
  const character = findCharacter(accountProgress.selectedCharacterId);
  const weapon = findWeapon(accountProgress.selectedWeaponId);
  const stage = accountProgress.selectedStartStage;
  const c = dom.summaryCharacter();
  const w = dom.summaryWeapon();
  const s = dom.summaryStage();
  if (c) c.textContent = character.name;
  if (w) w.textContent = weapon.name;
  if (s) s.textContent = stageLabel(stage);
}

function renderShop(): void {
  const groups = buildShopGroups();
  renderShopTabs(groups);
  const group = groups.find((g) => g.id === activeShopGroup) ?? groups[0];
  if (!group) return;
  activeShopGroup = group.id;
  const grid = dom.shopGrid();
  const kicker = dom.shopKicker();
  if (kicker) kicker.textContent = group.kicker;
  if (!grid) return;
  const cards = group.items.map((upgrade, i) => renderShopCard(upgrade, group, i));
  grid.replaceChildren(...cards);
}

function buildShopGroups(): ShopGroup[] {
  return SHOP_GROUP_IDS.map((id) => ({
    ...SHOP_GROUP_DEFS[id],
    items: metaUpgradeCatalog.filter(SHOP_GROUP_DEFS[id].match),
  }));
}

function renderShopTabs(groups: readonly ShopGroup[]): void {
  const container = dom.shopTabs();
  if (!container) return;
  const buttons = groups.map((group) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "hangar-shop-tab";
    button.dataset.shopGroup = group.id;
    button.dataset.active = String(group.id === activeShopGroup);
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(group.id === activeShopGroup));
    const owned = group.items.filter(
      (upgrade) => metaUpgradeLevel(accountProgress, upgrade.id) >= upgrade.maxLevel,
    ).length;
    button.innerHTML = `${group.title}<span class="count">${owned}/${group.items.length}</span>`;
    return button;
  });
  container.replaceChildren(...buttons);
}

function renderShopCard(upgrade: MetaUpgrade, group: ShopGroup, idx: number): HTMLElement {
  const card = document.createElement("article");
  card.className = "hangar-shop-card";
  card.dataset.upgradeId = upgrade.id;
  card.style.setProperty("--accent", `var(--${group.accent})`);
  card.style.setProperty("--d", `${idx * 40}ms`);

  const level = metaUpgradeLevel(accountProgress, upgrade.id);
  const purchase = canPurchaseLevel(accountProgress, upgrade.id);
  const revealed = isMetaUpgradeRevealed(accountProgress, upgrade);
  const max = upgrade.maxLevel;
  const isCategory = upgrade.kind === "category";
  const state = shopCardState(upgrade, level, purchase.ok, revealed);
  card.dataset.state = state;

  card.append(renderShopHead(upgrade, group));
  card.append(renderShopDesc(upgrade));

  if (isCategory) {
    card.append(renderShopLevels(upgrade, level));
    card.append(renderShopSummaryLine(upgrade, level));
  } else {
    const spacer = document.createElement("span");
    spacer.style.height = "0";
    card.appendChild(spacer);
  }

  card.append(renderShopFoot(upgrade, group, level, max, purchase, state, card));
  return card;
}

function renderShopHead(upgrade: MetaUpgrade, group: ShopGroup): HTMLElement {
  const head = document.createElement("div");
  head.className = "hangar-shop-head";

  const icon = document.createElement("span");
  icon.className = "hangar-shop-icon";
  icon.textContent = upgradeIcon(upgrade);

  const titles = document.createElement("div");
  titles.className = "hangar-shop-titles";
  const name = document.createElement("p");
  name.className = "hangar-shop-name";
  name.textContent = upgrade.name;
  const tag = document.createElement("span");
  tag.className = "hangar-shop-tag";
  tag.textContent = SHOP_TAG_LABEL[group.id];
  titles.append(name, tag);

  head.append(icon, titles);
  return head;
}

function renderShopDesc(upgrade: MetaUpgrade): HTMLElement {
  const desc = document.createElement("p");
  desc.className = "hangar-shop-desc";
  desc.textContent = upgrade.description;
  return desc;
}

function renderShopLevels(upgrade: MetaUpgrade, level: number): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "hangar-shop-levels";
  wrap.setAttribute("aria-label", `Niveau ${level} sur ${upgrade.maxLevel}`);
  for (let i = 0; i < upgrade.maxLevel; i += 1) {
    const pip = document.createElement("span");
    pip.className = "hangar-shop-pip";
    pip.dataset.on = String(i < level);
    wrap.appendChild(pip);
  }
  return wrap;
}

function renderShopSummaryLine(upgrade: MetaUpgrade, level: number): HTMLElement {
  const summary = document.createElement("p");
  summary.className = "hangar-shop-summary";
  if (level >= upgrade.maxLevel) {
    summary.textContent = `Niveau max · ${upgrade.levels?.[upgrade.maxLevel - 1]?.summary ?? upgrade.description}`;
  } else {
    const next = upgrade.levels?.[level]?.summary ?? upgrade.description;
    summary.textContent = `Niveau ${level + 1} → ${next}`;
  }
  return summary;
}

function renderShopFoot(
  upgrade: MetaUpgrade,
  group: ShopGroup,
  level: number,
  max: number,
  purchase: ReturnType<typeof canPurchaseLevel>,
  state: ShopCardState,
  card: HTMLElement,
): HTMLElement {
  const foot = document.createElement("div");
  foot.className = "hangar-shop-foot";

  if (state === "locked") {
    const lock = document.createElement("span");
    lock.className = "hangar-lock-pill";
    lock.textContent = `⚿ ${requirementLabel(upgrade.requirement) || "Verrouillé"}`;
    foot.append(lock, document.createElement("span"));
    return foot;
  }

  if (state === "owned" || state === "max") {
    const owned = document.createElement("span");
    owned.className = "hangar-owned-pill";
    owned.textContent = state === "owned" ? "✓ Acquis" : `✓ Niveau ${max}`;
    foot.append(owned, document.createElement("span"));
    return foot;
  }

  const cost = nextLevelCost(accountProgress, upgrade.id) ?? upgrade.costAt(level + 1);
  const affordable = purchase.ok;

  const costEl = document.createElement("span");
  costEl.className = "hangar-cost";
  costEl.dataset.affordable = String(affordable);
  costEl.innerHTML = `<span class="glyph" aria-hidden="true">◆</span><strong>${formatNumber(cost)}</strong>`;
  costEl.setAttribute("aria-label", `${formatNumber(cost)} cristaux requis`);

  const button = document.createElement("button");
  button.type = "button";
  button.className = "hangar-buy-button";
  button.style.setProperty("--accent", `var(--${group.accent})`);
  button.disabled = !affordable;
  button.textContent = upgrade.kind === "category" ? `Niveau ${level + 1}` : "Acheter";
  button.addEventListener("click", () => {
    const result = purchaseMetaUpgradeLevel(upgrade.id);
    if (result.ok) {
      flashCrystals();
      flashToast(toastForPurchase(upgrade, level + 1, result.cost));
      renderCockpit();
    } else {
      flashCard(card);
    }
  });

  foot.append(costEl, button);
  return foot;
}

type ShopCardState = "available" | "insufficient" | "locked" | "owned" | "max";

function shopCardState(
  upgrade: MetaUpgrade,
  level: number,
  canPurchase: boolean,
  revealed: boolean,
): ShopCardState {
  if (level >= upgrade.maxLevel) return upgrade.kind === "unique" ? "owned" : "max";
  if (!revealed) return "locked";
  return canPurchase ? "available" : "insufficient";
}

function flashCard(card: HTMLElement | null): void {
  if (!card) return;
  card.dataset.refused = "true";
  setTimeout(() => card.removeAttribute("data-refused"), 220);
}

function flashCrystals(): void {
  const hud = dom.crystalHud();
  if (!hud) return;
  hud.classList.remove("is-flashing");
  void hud.offsetWidth;
  hud.classList.add("is-flashing");
}

function flashToast(message: string, ms = 2200): void {
  const toast = dom.toast();
  if (!toast) return;
  toast.textContent = message;
  toast.hidden = false;
  if (toastTimer !== null) {
    window.clearTimeout(toastTimer);
  }
  toastTimer = window.setTimeout(() => {
    toast.hidden = true;
    toastTimer = null;
  }, ms);
}

function toastForPurchase(upgrade: MetaUpgrade, level: number, cost: number): string {
  if (upgrade.kind === "category") {
    return `✓ ${upgrade.name} niveau ${level} · −${formatNumber(cost)} ◆`;
  }
  return `✓ ${upgrade.name} · −${formatNumber(cost)} ◆`;
}

function requirementLabel(requirement: UnlockRequirement): string {
  switch (requirement) {
    case "available":
      return "";
    case "reach-10m":
      return "10 minutes de jeu";
    case "clear-stage-1":
      return "Battre le boss du stage 1";
    case "reach-stage-2":
      return "Atteindre le stage 2";
    case "boss-kill":
      return "Battre un boss";
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
    )} · ${r.bossKills} boss tués`;
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
    parts.push(`stage ${reward.newlyUnlockedStartStage} débloqué`);
  }
  if (reward.newRecords.length > 0) {
    parts.push(`record ${reward.newRecords.join(", ")}`);
  }
  text.textContent = parts.join(" · ");
}

function rewardLabel(): string {
  const reward = accountProgress.lastRunReward;
  if (!reward || reward.crystalsGained <= 0) return "Aucun cristal gagné";
  return `+${formatNumber(reward.crystalsGained)} cristaux`;
}

function stageLabel(stage: number): string {
  if (stage === 1) return "Stage 1";
  const bonus = Math.round((stage - 1) * START_STAGE_CRYSTAL_BONUS_PER_STAGE * 100);
  return `Stage ${stage} · +${bonus}% ◆`;
}

function characterStats(id: CharacterId): Record<string, string | number> {
  const target = makeBaselinePlayer();
  findCharacter(id).apply(target);
  return {
    hp: Math.round(target.maxHp),
    speed: Math.round(target.speed),
    fire: target.fireRate.toFixed(1),
  };
}

function weaponStats(id: WeaponId): Record<string, string | number> {
  const target = makeBaselinePlayer();
  findWeapon(id).apply(target);
  return {
    dmg: Math.round(target.damage),
    rate: target.fireRate.toFixed(1),
    salvo: target.projectileCount,
  };
}

function weaponBonusLabel(id: WeaponId): string {
  switch (id) {
    case "scatter":
      return "+1 projectile · −16% dégâts";
    case "lance":
      return "+48% dégâts · −34% cadence · pierce";
    case "drone":
      return "+1 drone · −10% dégâts · −12% cadence";
    case "pulse":
      return "Profil neutre · sans faiblesse";
  }
}

function makeBaselinePlayer(): Player {
  return {
    x: 0,
    y: 0,
    radius: 14,
    hp: 100,
    maxHp: 100,
    speed: 265,
    damage: 24,
    fireRate: 3,
    bulletSpeed: 600,
    projectileCount: 1,
    pierce: 0,
    drones: 0,
    shield: 0,
    shieldMax: 0,
    shieldRegen: 0,
    critChance: 0,
    lifesteal: 0,
    pickupRadius: 1,
    bulletRadius: 1,
    invuln: 0,
    fireTimer: 0,
    droneTimer: 0,
    aimAngle: 0,
    vx: 0,
    vy: 0,
    bonus: {
      fireRatePct: 0,
      damagePct: 0,
      bulletSpeedPct: 0,
      speedPct: 0,
      pickupRadiusPct: 0,
      bulletRadiusPct: 0,
    },
    traits: {
      railSplitter: false,
      droneSwarm: false,
      kineticRam: false,
      magnetStorm: false,
    },
    ramTimer: 0,
    magnetStormCharge: 0,
    magnetStormTimer: 0,
  };
}

function upgradeIcon(upgrade: MetaUpgrade): string {
  if (upgrade.weaponId) {
    const weapon = weaponCatalog.find((w) => w.id === upgrade.weaponId);
    if (weapon) return weapon.icon;
  }
  if (upgrade.characterId) {
    const character = characterCatalog.find((c) => c.id === upgrade.characterId);
    if (character) return character.icon;
  }
  switch (upgrade.id) {
    case "category:attack":
      return "ATK";
    case "category:defense":
      return "DEF";
    case "category:salvage":
      return "SLV";
    case "category:tempo":
      return "TMP";
    case "unique:extra-choice":
      return "BNK";
    default:
      return "•";
  }
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

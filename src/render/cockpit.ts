import { characterCatalog } from "../game/character-catalog";
import {
  canPurchaseShopItem,
  isShopItemRevealed,
  shopCatalog,
} from "../game/shop-catalog";
import { weaponCatalog } from "../game/weapon-catalog";
import {
  accountProgress,
  equipWeapon,
  purchaseShopItem,
  selectCharacter,
  selectStartStage,
} from "../systems/account";
import type {
  Character,
  ShopItem,
  ShopItemId,
  UnlockRequirement,
  Weapon,
} from "../types";
import { getAllTreeNodes } from "../game/upgrade-tree-routes";
import { openTreeOverlay } from "./orbital-tree";

const dom = {
  crystals: () => document.querySelectorAll<HTMLElement>("[data-account-crystals]"),
  records: () => document.querySelectorAll<HTMLElement>("[data-account-record]"),
  rewards: () => document.querySelectorAll<HTMLElement>("[data-account-reward]"),
  characterLists: () => document.querySelectorAll<HTMLElement>("[data-character-list]"),
  weaponLists: () => document.querySelectorAll<HTMLElement>("[data-weapon-list]"),
  stageLists: () => document.querySelectorAll<HTMLElement>("[data-stage-list]"),
  treeProgress: () => document.querySelectorAll<HTMLElement>("[data-tree-progress]"),
  nextUnlock: () => document.querySelectorAll<HTMLElement>("[data-next-unlock]"),
  treeButtons: () => document.querySelectorAll<HTMLButtonElement>("[data-open-tree]"),
};

export function bindCockpit(): void {
  for (const button of dom.treeButtons()) {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      openTreeOverlay();
    });
  }
}

export function renderCockpit(): void {
  for (const element of dom.crystals()) {
    element.textContent = formatNumber(accountProgress.crystals);
  }
  for (const element of dom.records()) {
    element.textContent = recordLabel();
  }
  for (const element of dom.rewards()) {
    element.textContent = rewardLabel();
  }
  for (const target of dom.characterLists()) {
    renderCharacterList(target);
  }
  for (const target of dom.weaponLists()) {
    renderWeaponList(target);
  }
  for (const target of dom.stageLists()) {
    renderStageList(target);
  }
  for (const target of dom.treeProgress()) {
    target.textContent = treeProgressLabel();
  }
  for (const target of dom.nextUnlock()) {
    target.textContent = nextUnlockLabel();
  }
}

function renderCharacterList(target: HTMLElement): void {
  target.replaceChildren(
    ...characterCatalog.map((character) => characterCard(character)),
  );
}

function characterCard(character: Character): HTMLButtonElement {
  const button = document.createElement("button");
  const shopItem = shopCatalog.find((entry) => entry.characterId === character.id);
  const owned =
    character.id === "pilot" ||
    (shopItem !== undefined && accountProgress.purchasedUnlockIds.includes(shopItem.id));
  const equipped = accountProgress.selectedCharacterId === character.id;
  const purchase = shopItem ? canPurchaseShopItem(accountProgress, shopItem) : null;
  const revealed = shopItem ? isShopItemRevealed(accountProgress, shopItem) : true;

  button.type = "button";
  button.className = "cockpit-card";
  button.dataset.owned = owned ? "true" : "false";
  button.dataset.equipped = equipped ? "true" : "false";
  button.dataset.locked = revealed ? "false" : "true";
  button.disabled = !owned && !(purchase?.ok ?? false);

  const tag = !owned
    ? lockedTag(shopItem, revealed)
    : equipped
      ? statusTag("EQUIP", "equip")
      : statusTag("Choisir", "switch");

  button.append(
    cardBody(
      character.icon ? `${character.icon} ${character.name}` : character.name,
      character.bonusLabel,
    ),
    tag,
  );

  button.addEventListener("click", () => {
    if (!owned && shopItem) {
      const result = purchaseShopItem(shopItem.id);
      if (result.ok) renderCockpit();
      return;
    }
    if (owned && selectCharacter(character.id)) {
      renderCockpit();
    }
  });
  return button;
}

function renderWeaponList(target: HTMLElement): void {
  target.replaceChildren(...weaponCatalog.map((weapon) => weaponCard(weapon)));
}

function weaponCard(weapon: Weapon): HTMLButtonElement {
  const button = document.createElement("button");
  const shopItem = shopCatalog.find((entry) => entry.weaponId === weapon.id);
  const owned =
    weapon.id === "pulse" ||
    (shopItem !== undefined && accountProgress.purchasedUnlockIds.includes(shopItem.id));
  const equipped = accountProgress.selectedWeaponId === weapon.id;
  const purchase = shopItem ? canPurchaseShopItem(accountProgress, shopItem) : null;
  const revealed = shopItem ? isShopItemRevealed(accountProgress, shopItem) : true;

  button.type = "button";
  button.className = "cockpit-card";
  button.dataset.owned = owned ? "true" : "false";
  button.dataset.equipped = equipped ? "true" : "false";
  button.dataset.locked = revealed ? "false" : "true";
  button.disabled = !owned && !(purchase?.ok ?? false);

  const tag = !owned
    ? lockedTag(shopItem, revealed)
    : equipped
      ? statusTag("EQUIP", "equip")
      : weaponTier(weapon);

  button.append(
    cardBody(
      `${weapon.icon} ${weapon.name}`,
      weapon.tags.join(" · "),
    ),
    tag,
  );

  button.addEventListener("click", () => {
    if (!owned && shopItem) {
      const result = purchaseShopItem(shopItem.id);
      if (result.ok) renderCockpit();
      return;
    }
    if (owned && equipWeapon(weapon.id)) {
      renderCockpit();
    }
  });
  return button;
}

function weaponTier(weapon: Weapon): HTMLSpanElement {
  const tier = document.createElement("span");
  tier.className = "cockpit-card-tier";
  const filled = weapon.id === "pulse" ? 1 : 2;
  for (let i = 0; i < 4; i += 1) {
    const dot = document.createElement("span");
    dot.className = i < filled ? "cockpit-card-tier-dot is-on" : "cockpit-card-tier-dot";
    tier.appendChild(dot);
  }
  return tier;
}

function renderStageList(target: HTMLElement): void {
  target.replaceChildren();
  const maxStage = Math.max(accountProgress.highestStartStageUnlocked, 3);
  for (let stage = 1; stage <= maxStage; stage += 1) {
    target.appendChild(stagePill(stage));
  }
}

function stagePill(stage: number): HTMLButtonElement {
  const unlocked = stage <= accountProgress.highestStartStageUnlocked;
  const selected = accountProgress.selectedStartStage === stage;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "cockpit-stage-pill";
  button.dataset.locked = unlocked ? "false" : "true";
  button.dataset.selected = selected ? "true" : "false";
  button.disabled = !unlocked;
  button.textContent =
    stage === 1 ? "N1" : unlocked ? `N${stage} · skip +35%¢` : `N${stage} verrouillé`;
  button.addEventListener("click", () => {
    if (selectStartStage(stage)) renderCockpit();
  });
  return button;
}

function cardBody(title: string, copy: string): HTMLSpanElement {
  const body = document.createElement("span");
  body.className = "cockpit-card-body";
  const titleEl = document.createElement("span");
  titleEl.className = "cockpit-card-title";
  titleEl.textContent = title;
  const copyEl = document.createElement("span");
  copyEl.className = "cockpit-card-copy";
  copyEl.textContent = copy;
  body.append(titleEl, copyEl);
  return body;
}

function statusTag(label: string, kind: "equip" | "switch"): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = `cockpit-card-tag cockpit-card-tag--${kind}`;
  span.textContent = label;
  return span;
}

function lockedTag(shopItem: ShopItem | undefined, revealed: boolean): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = "cockpit-card-tag cockpit-card-tag--locked";
  if (!shopItem) {
    span.textContent = "—";
    return span;
  }
  span.textContent = revealed
    ? `${shopItem.cost}¢`
    : requirementShortLabel(shopItem.requirement);
  return span;
}

function requirementShortLabel(requirement: UnlockRequirement): string {
  switch (requirement) {
    case "available":
      return "—";
    case "reach-10m":
      return "10:00";
    case "clear-stage-1":
      return "Boss N1";
    case "reach-stage-2":
      return "N2";
    case "boss-kill":
      return "Boss";
  }
}

function recordLabel(): string {
  const bestTime = formatTime(accountProgress.records.bestTimeSeconds);
  return `Record N${accountProgress.records.bestStage} · ${bestTime} · score ${formatNumber(
    accountProgress.records.bestScore,
  )} · niv ${accountProgress.records.bestRunLevel}`;
}

function rewardLabel(): string {
  const reward = accountProgress.lastRunReward;
  if (!reward || reward.crystalsGained <= 0) return "Aucun cristal gagné";
  const parts = [`+${formatNumber(reward.crystalsGained)} cristaux`];
  if (reward.newlyUnlockedStartStage) parts.push(`départ N${reward.newlyUnlockedStartStage}`);
  if (reward.newRecords.length > 0) parts.push("record");
  return parts.join(" · ");
}

function treeProgressLabel(): string {
  const nodes = getAllTreeNodes();
  const owned = nodes.filter((node) =>
    accountProgress.purchasedUnlockIds.includes(node.item.id as ShopItemId),
  ).length;
  return `${owned}/${nodes.length} noeuds`;
}

function nextUnlockLabel(): string {
  const candidates = shopCatalog
    .filter(
      (item) =>
        !accountProgress.purchasedUnlockIds.includes(item.id) &&
        isShopItemRevealed(accountProgress, item),
    )
    .sort((a, b) => a.cost - b.cost);
  if (candidates.length === 0) return "—";
  const next = candidates[0]!;
  return `${next.name} — ${formatNumber(next.cost)}¢`;
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

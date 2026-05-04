import type {
  CardDef,
  CardEffect,
  CardOffer,
  CardStat,
  Player,
  Weapon,
} from "../types";
import { canPromoteWeapon, applyMutation, promoteWeapon } from "./weapon-catalog";
import { mutationsFor } from "./mutation-catalog";
import type { RngHandle } from "./daily-seed";

const CARD_ICON = "/icons/upgrades";

function statEffect(stat: CardStat, amount: number): CardEffect {
  return { kind: "stat", stat, amount };
}

export const cardCatalog: readonly CardDef[] = [
  {
    id: "damage-up",
    name: "Calibre",
    description: "+20% dégâts",
    icon: `${CARD_ICON}/damage-up.png`,
    rarity: "common",
    weight: 5,
    effects: [statEffect("damageMul", 0.2)],
  },
  {
    id: "fire-rate-up",
    name: "Cadence",
    description: "+20% cadence",
    icon: `${CARD_ICON}/fire-rate-up.png`,
    rarity: "common",
    weight: 5,
    effects: [statEffect("fireRateMul", 0.2)],
  },
  {
    id: "speed-up",
    name: "Boost",
    description: "+30 vitesse",
    icon: `${CARD_ICON}/speed-up.png`,
    rarity: "common",
    weight: 4,
    effects: [statEffect("speed", 30)],
  },
  {
    id: "max-hp-up",
    name: "Blindage",
    description: "+25 PV max",
    icon: `${CARD_ICON}/max-hp-up.png`,
    rarity: "common",
    weight: 4,
    effects: [statEffect("maxHp", 25)],
  },
  {
    id: "bullet-radius-up",
    name: "Ogive",
    description: "+30% taille balle",
    icon: `${CARD_ICON}/bullet-radius-up.png`,
    rarity: "common",
    weight: 3,
    effects: [statEffect("bulletRadius", 0.3)],
  },
  {
    id: "crit-up",
    name: "Critique",
    description: "+15% chance crit (x2)",
    icon: `${CARD_ICON}/crit-up.png`,
    rarity: "common",
    weight: 4,
    effects: [statEffect("critChance", 0.15)],
  },
  {
    id: "bullet-speed-up",
    name: "Vélocité",
    description: "+15% vitesse balle",
    icon: `${CARD_ICON}/bullet-speed-up.png`,
    rarity: "common",
    weight: 3,
    effects: [statEffect("bulletSpeed", 0.15)],
  },
  {
    id: "range-up",
    name: "Portée",
    description: "+80 portée",
    icon: `${CARD_ICON}/range-up.png`,
    rarity: "common",
    weight: 3,
    effects: [statEffect("range", 80)],
  },
  {
    id: "projectile-up",
    name: "Salve",
    description: "+1 projectile",
    icon: `${CARD_ICON}/damage-up.png`,
    rarity: "rare",
    weight: 2,
    effects: [statEffect("projectileCount", 1)],
  },
  {
    id: "pierce-up",
    name: "Perforation",
    description: "+1 pierce",
    icon: `${CARD_ICON}/damage-up.png`,
    rarity: "rare",
    weight: 2,
    effects: [statEffect("pierce", 1)],
  },
  {
    id: "lifesteal",
    name: "Vampire",
    description: "1% des dégâts en PV",
    icon: `${CARD_ICON}/max-hp-up.png`,
    rarity: "rare",
    weight: 1.5,
    effects: [{ kind: "lifesteal", amount: 0.01 }],
  },
  {
    id: "weapon-promote",
    name: "Promotion",
    description: "Arme +1 tier (T1→T4)",
    icon: `${CARD_ICON}/fire-rate-up.png`,
    rarity: "rare",
    weight: 3,
    effects: [statEffect("damageMul", 0)],
  },
  {
    id: "weapon-mutation",
    name: "Mutation",
    description: "Évolution finale de l'arme",
    icon: `${CARD_ICON}/crit-up.png`,
    rarity: "mutation",
    weight: 1,
    effects: [{ kind: "mutation" }],
  },
];

export function findCard(id: string): CardDef {
  const card = cardCatalog.find((entry) => entry.id === id);
  if (!card) throw new Error(`Unknown card: ${id}`);
  return card;
}

export function rollCards(
  rng: RngHandle,
  player: Player,
  picksTaken: number,
  count: 2 | 3,
): readonly CardOffer[] {
  const pool = cardCatalog.filter((card) => isCardEligible(card, player.activeWeapon, picksTaken));
  const offers: CardOffer[] = [];
  const taken = new Set<string>();
  for (let i = 0; i < count; i += 1) {
    const remaining = pool.filter((card) => !taken.has(card.id));
    if (remaining.length === 0) break;
    const picked = weightedPick(rng, remaining);
    taken.add(picked.id);
    offers.push({ card: picked });
  }
  return offers;
}

/** @deprecated kept for tests — prefer rollCards */
export function rollTwoCards(rng: RngHandle, player: Player, picksTaken: number): readonly [CardOffer, CardOffer] {
  const offers = rollCards(rng, player, picksTaken, 2);
  return [offers[0]!, offers[1] ?? offers[0]!] as const;
}

function isCardEligible(card: CardDef, weapon: Weapon, picksTaken: number): boolean {
  if (card.id === "weapon-promote") {
    return canPromoteWeapon(weapon);
  }
  if (card.id === "weapon-mutation") {
    if (weapon.mutationId !== null) return false;
    if (weapon.tier < 3 && picksTaken < 3) return false;
    return mutationsFor(weapon.defId).length > 0;
  }
  return true;
}

function weightedPick(rng: RngHandle, pool: readonly CardDef[]): CardDef {
  const totalWeight = pool.reduce((acc, card) => acc + card.weight, 0);
  if (totalWeight <= 0) return pool[0]!;
  let roll = rng.next() * totalWeight;
  for (const card of pool) {
    roll -= card.weight;
    if (roll <= 0) return card;
  }
  return pool[pool.length - 1]!;
}

export function applyCardToPlayer(card: CardDef, player: Player, rng: RngHandle): void {
  for (const effect of card.effects) {
    applyEffect(effect, player);
  }
  if (card.id === "weapon-promote") {
    promoteWeapon(player.activeWeapon);
  } else if (card.id === "weapon-mutation") {
    const mutations = mutationsFor(player.activeWeapon.defId);
    if (mutations.length > 0 && player.activeWeapon.mutationId === null) {
      const mutation = rng.pick(mutations);
      applyMutation(player.activeWeapon, mutation.id);
    }
  }
}

function applyEffect(effect: CardEffect, target: Player): void {
  if (effect.kind === "lifesteal") {
    target.lifesteal += effect.amount;
    return;
  }
  if (effect.kind === "mutation") {
    return;
  }
  switch (effect.stat) {
    case "damage":
      target.damage += effect.amount;
      break;
    case "damageMul":
      target.damageMul += effect.amount;
      break;
    case "fireRate":
      target.fireRate += effect.amount;
      break;
    case "fireRateMul":
      target.fireRateMul += effect.amount;
      break;
    case "speed":
      target.speed += effect.amount;
      break;
    case "maxHp":
      target.maxHp += effect.amount;
      target.hp = Math.min(target.maxHp, target.hp + effect.amount);
      break;
    case "projectileCount":
      target.projectileCount += effect.amount;
      break;
    case "pierce":
      target.pierce += effect.amount;
      break;
    case "bulletRadius":
      target.bulletRadius *= 1 + effect.amount;
      break;
    case "critChance":
      target.critChance = Math.min(0.95, target.critChance + effect.amount);
      break;
    case "bulletSpeed":
      target.bulletSpeed *= 1 + effect.amount;
      break;
    case "range":
      target.range += effect.amount;
      break;
  }
}


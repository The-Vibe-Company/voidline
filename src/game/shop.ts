import { player, state } from "../state";
import {
  applyUpgradeToPlayer,
  upgradeCatalog,
} from "./upgrade-catalog";
import {
  shop as shopBalance,
  weaponOfferWeight,
  weaponUnlockWaves,
} from "./balance";
import {
  acquireWeapon,
  mergeWeapons,
  playerLoadoutFull,
  sellWeapon,
  weaponCatalog,
  weaponTierStats,
} from "./weapon-catalog";
import type { ShopOffer, WeaponDef, WeaponTier } from "../types";

interface ShopRuntime {
  offers: ShopOffer[];
  rerollCost: number;
}

const runtime: ShopRuntime = {
  offers: [],
  rerollCost: shopBalance.rerollBaseCost,
};

export function currentShopOffers(): readonly ShopOffer[] {
  return runtime.offers;
}

export function currentRerollCost(): number {
  return runtime.rerollCost;
}

export function rerollShop(initialDraw = false): void {
  if (initialDraw) {
    runtime.rerollCost = shopBalance.rerollBaseCost;
  }
  runtime.offers = drawOffers(shopBalance.offers);
}

export function maxUnlockedTier(waveNumber: number): WeaponTier {
  if (waveNumber >= weaponUnlockWaves.t4) return 4;
  if (waveNumber >= weaponUnlockWaves.t3) return 3;
  if (waveNumber >= weaponUnlockWaves.t2) return 2;
  return 1;
}

function weaponOfferTierFor(_def: WeaponDef, waveNumber: number): WeaponTier {
  return maxUnlockedTier(waveNumber);
}

function buildWeaponOffer(def: WeaponDef, waveNumber: number): ShopOffer {
  const tier = weaponOfferTierFor(def, waveNumber);
  const stats = weaponTierStats(def, tier);
  return { kind: "weapon", defId: def.id, tier, cost: stats.cost };
}

interface OfferCandidate {
  offer: ShopOffer;
  weight: number;
  key: string;
}

function buildCandidates(waveNumber: number): OfferCandidate[] {
  const candidates: OfferCandidate[] = [];
  for (const upgrade of upgradeCatalog) {
    candidates.push({
      offer: { kind: "upgrade", upgrade, cost: upgrade.cost },
      weight: 1,
      key: `upgrade:${upgrade.id}`,
    });
  }
  for (const def of weaponCatalog) {
    candidates.push({
      offer: buildWeaponOffer(def, waveNumber),
      weight: weaponOfferWeight,
      key: `weapon:${def.id}`,
    });
  }
  return candidates;
}

function drawOffers(count: number): ShopOffer[] {
  const pool = buildCandidates(state.wave);
  const offers: ShopOffer[] = [];
  for (let i = 0; i < count && pool.length > 0; i += 1) {
    const totalWeight = pool.reduce((acc, c) => acc + c.weight, 0);
    let roll = Math.random() * totalWeight;
    let pickIdx = 0;
    for (let k = 0; k < pool.length; k += 1) {
      roll -= pool[k]!.weight;
      if (roll <= 0) {
        pickIdx = k;
        break;
      }
    }
    const picked = pool.splice(pickIdx, 1)[0]!;
    offers.push(picked.offer);
  }
  return offers;
}

export function tryRerollShop(): boolean {
  const cost = runtime.rerollCost;
  if (state.runCurrency < cost) return false;
  state.runCurrency -= cost;
  runtime.rerollCost += shopBalance.rerollGrowth;
  rerollShop(false);
  return true;
}

export function canAcceptOffer(offer: ShopOffer): boolean {
  if (state.runCurrency < offer.cost) return false;
  if (offer.kind === "upgrade") return true;
  return !playerLoadoutFull(player);
}

export function tryBuyOffer(index: number): boolean {
  const offer = runtime.offers[index];
  if (!offer) return false;
  if (!canAcceptOffer(offer)) return false;
  state.runCurrency -= offer.cost;
  if (offer.kind === "upgrade") {
    applyUpgradeToPlayer(offer.upgrade, player);
  } else {
    acquireWeapon(player, offer.defId, offer.tier, offer.cost);
  }
  runtime.offers.splice(index, 1);
  return true;
}

export function trySellWeapon(index: number): boolean {
  if (index < 0 || index >= player.weapons.length) return false;
  if (player.weapons.length <= 1) return false;
  const refund = sellWeapon(player, index);
  state.runCurrency += refund;
  return true;
}

export function tryMergeWeapons(indexA: number, indexB: number): boolean {
  return mergeWeapons(player, indexA, indexB) !== null;
}

export function resetShopState(): void {
  runtime.offers = [];
  runtime.rerollCost = shopBalance.rerollBaseCost;
}

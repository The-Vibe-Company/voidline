import { player, state } from "../state";
import {
  applyUpgradeToPlayer,
  upgradeCatalog,
} from "./upgrade-catalog";
import { shop as shopBalance } from "./balance";
import type { ShopOffer } from "../types";

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

function drawOffers(count: number): ShopOffer[] {
  const pool = [...upgradeCatalog];
  const offers: ShopOffer[] = [];
  for (let i = 0; i < count && pool.length > 0; i += 1) {
    const idx = Math.floor(Math.random() * pool.length);
    const upgrade = pool.splice(idx, 1)[0]!;
    offers.push({ upgrade, cost: upgrade.cost });
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

export function tryBuyOffer(index: number): boolean {
  const offer = runtime.offers[index];
  if (!offer) return false;
  if (state.runCurrency < offer.cost) return false;
  state.runCurrency -= offer.cost;
  applyUpgradeToPlayer(offer.upgrade, player);
  // Remove the bought offer from the grid (cannot rebuy the same slot)
  runtime.offers.splice(index, 1);
  return true;
}

export function resetShopState(): void {
  runtime.offers = [];
  runtime.rerollCost = shopBalance.rerollBaseCost;
}

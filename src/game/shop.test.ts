import { describe, expect, it, beforeEach } from "vitest";
import {
  currentRerollCost,
  currentShopOffers,
  rerollShop,
  resetShopState,
  tryBuyOffer,
  tryRerollShop,
} from "./shop";
import { state, resetPlayerToBase } from "../state";
import { shop as shopBalance } from "./balance";

beforeEach(() => {
  resetShopState();
  resetPlayerToBase();
  state.runCurrency = 0;
});

describe("shop", () => {
  it("re-roll fails when no currency", () => {
    rerollShop(true);
    expect(tryRerollShop()).toBe(false);
  });

  it("re-roll consumes currency and grows in cost", () => {
    rerollShop(true);
    state.runCurrency = 200;
    const baseCost = currentRerollCost();
    expect(baseCost).toBe(shopBalance.rerollBaseCost);
    expect(tryRerollShop()).toBe(true);
    expect(state.runCurrency).toBe(200 - baseCost);
    expect(currentRerollCost()).toBe(baseCost + shopBalance.rerollGrowth);
  });

  it("buying an offer removes it from the grid", () => {
    rerollShop(true);
    state.runCurrency = 1000;
    const before = currentShopOffers().length;
    expect(before).toBeGreaterThan(0);
    expect(tryBuyOffer(0)).toBe(true);
    expect(currentShopOffers().length).toBe(before - 1);
  });

  it("buying fails when underfunded", () => {
    rerollShop(true);
    state.runCurrency = 0;
    expect(tryBuyOffer(0)).toBe(false);
    expect(currentShopOffers().length).toBeGreaterThan(0);
  });
});

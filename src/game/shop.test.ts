import { describe, expect, it, beforeEach } from "vitest";
import {
  canAcceptOffer,
  currentRerollCost,
  currentShopOffers,
  rerollShop,
  resetShopState,
  tryBuyOffer,
  tryMergeWeapons,
  tryRerollShop,
  trySellWeapon,
} from "./shop";
import { player, state, resetPlayerToBase } from "../state";
import { shop as shopBalance } from "./balance";
import { acquireWeapon, playerOwnsWeapon } from "./weapon-catalog";
import type { ShopOffer } from "../types";

beforeEach(() => {
  resetShopState();
  resetPlayerToBase();
  state.runCurrency = 0;
  state.wave = 1;
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

describe("shop weapons", () => {
  it("wave 1 only offers T1 weapons", () => {
    state.wave = 1;
    state.runCurrency = 0;
    for (let i = 0; i < 30; i += 1) {
      rerollShop(true);
      for (const offer of currentShopOffers()) {
        if (offer.kind === "weapon") {
          expect(offer.tier).toBe(1);
        }
      }
    }
  });

  it("wave 5 may offer T2 weapons", () => {
    state.wave = 5;
    let sawT2 = false;
    for (let i = 0; i < 80 && !sawT2; i += 1) {
      rerollShop(true);
      for (const offer of currentShopOffers()) {
        if (offer.kind === "weapon" && offer.tier === 2) {
          sawT2 = true;
        }
      }
    }
    expect(sawT2).toBe(true);
  });

  it("buying a new weapon adds it to the loadout", () => {
    state.wave = 1;
    state.runCurrency = 1000;
    const offer: ShopOffer = { kind: "weapon", defId: "smg", tier: 1, cost: 25 };
    rerollShop(true);
    (currentShopOffers() as ShopOffer[]).unshift(offer);
    expect(playerOwnsWeapon(player, "smg")).toBe(false);
    expect(tryBuyOffer(0)).toBe(true);
    expect(playerOwnsWeapon(player, "smg")).toBe(true);
    const smg = player.weapons.find((w) => w.defId === "smg")!;
    expect(smg.purchaseCost).toBe(25);
  });

  it("buying a duplicate weapon adds a second instance at the offered tier", () => {
    state.wave = 1;
    state.runCurrency = 1000;
    acquireWeapon(player, "smg", 1, 25);
    const dup: ShopOffer = { kind: "weapon", defId: "smg", tier: 1, cost: 25 };
    rerollShop(true);
    (currentShopOffers() as ShopOffer[]).unshift(dup);
    expect(tryBuyOffer(0)).toBe(true);
    const owned = player.weapons.filter((w) => w.defId === "smg");
    expect(owned.length).toBe(2);
    expect(owned.every((w) => w.tier === 1)).toBe(true);
  });

  it("weapon offer is rejected when loadout is full", () => {
    state.wave = 1;
    state.runCurrency = 1000;
    acquireWeapon(player, "smg", 1);
    acquireWeapon(player, "shotgun", 1);
    acquireWeapon(player, "sniper", 1);
    acquireWeapon(player, "minigun", 1);
    acquireWeapon(player, "railgun", 1);
    expect(player.weapons.length).toBe(6);
    const offer: ShopOffer = { kind: "weapon", defId: "smg", tier: 1, cost: 25 };
    expect(canAcceptOffer(offer)).toBe(false);
  });

  it("trySellWeapon refunds half the purchase cost into runCurrency", () => {
    state.wave = 1;
    state.runCurrency = 0;
    acquireWeapon(player, "smg", 1, 27);
    expect(player.weapons.length).toBe(2);
    expect(trySellWeapon(1)).toBe(true);
    expect(player.weapons.length).toBe(1);
    expect(state.runCurrency).toBe(13);
  });

  it("trySellWeapon fails on invalid index", () => {
    expect(trySellWeapon(99)).toBe(false);
    expect(trySellWeapon(-1)).toBe(false);
  });

  it("trySellWeapon refuses to remove the last weapon", () => {
    expect(player.weapons.length).toBe(1);
    expect(trySellWeapon(0)).toBe(false);
    expect(player.weapons.length).toBe(1);
  });

  it("tryMergeWeapons merges two same-archetype same-tier weapons", () => {
    state.wave = 1;
    acquireWeapon(player, "smg", 1, 25);
    acquireWeapon(player, "smg", 1, 25);
    expect(tryMergeWeapons(1, 2)).toBe(true);
    const smgs = player.weapons.filter((w) => w.defId === "smg");
    expect(smgs.length).toBe(1);
    expect(smgs[0]!.tier).toBe(2);
    expect(smgs[0]!.purchaseCost).toBe(50);
  });

  it("tryMergeWeapons rejects mismatched weapons", () => {
    state.wave = 1;
    acquireWeapon(player, "smg", 1, 25);
    acquireWeapon(player, "shotgun", 1, 30);
    expect(tryMergeWeapons(1, 2)).toBe(false);
  });
});

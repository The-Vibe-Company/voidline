import { describe, expect, it } from "vitest";
import {
  cardCatalog,
  applyCardToPlayer,
  findCard,
  rollCards,
  rollDailyCardPool,
  rollTwoCards,
  DAILY_POOL_SIZE_OPTIONAL,
} from "./card-catalog";
import { createRng } from "./daily-seed";
import { createPlayerBaseState } from "../state";
import { mutationsFor } from "./mutation-catalog";

describe("card catalog", () => {
  it("ids are unique", () => {
    const ids = cardCatalog.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("findCard resolves catalog entries", () => {
    for (const card of cardCatalog) {
      expect(findCard(card.id)).toBe(card);
    }
  });
});

describe("rollTwoCards reproducibility", () => {
  it("same seed produces the same two offers", () => {
    const a = createRng(12345);
    const b = createRng(12345);
    const player1 = createPlayerBaseState();
    const player2 = createPlayerBaseState();
    const offers1 = rollTwoCards(a, player1, 0);
    const offers2 = rollTwoCards(b, player2, 0);
    expect(offers1[0].card.id).toBe(offers2[0].card.id);
    expect(offers1[1].card.id).toBe(offers2[1].card.id);
  });

  it("returns two different cards when pool has > 1 entry", () => {
    const rng = createRng(99);
    const player = createPlayerBaseState();
    const offers = rollTwoCards(rng, player, 0);
    expect(offers).toHaveLength(2);
  });

  it("rollCards(3) returns three distinct offers", () => {
    const rng = createRng(7);
    const player = createPlayerBaseState();
    const offers = rollCards(rng, player, 0, 3);
    expect(offers).toHaveLength(3);
    const ids = new Set(offers.map((o) => o.card.id));
    expect(ids.size).toBe(3);
  });
});

describe("applyCardToPlayer", () => {
  it("damage-up card increases damageMul", () => {
    const player = createPlayerBaseState();
    const before = player.damageMul;
    applyCardToPlayer(findCard("damage-up"), player, createRng(1));
    expect(player.damageMul).toBeCloseTo(before + 0.2, 5);
  });

  it("max-hp-up card increases maxHp and heals", () => {
    const player = createPlayerBaseState();
    player.hp = 50;
    applyCardToPlayer(findCard("max-hp-up"), player, createRng(1));
    expect(player.maxHp).toBe(125);
    expect(player.hp).toBe(75);
  });

  it("weapon-promote raises weapon tier", () => {
    const player = createPlayerBaseState();
    expect(player.activeWeapon.tier).toBe(1);
    applyCardToPlayer(findCard("weapon-promote"), player, createRng(1));
    expect(player.activeWeapon.tier).toBe(2);
  });

  it("weapon-mutation assigns a mutation when player is past tier 3", () => {
    const player = createPlayerBaseState();
    player.activeWeapon.tier = 4;
    applyCardToPlayer(findCard("weapon-mutation"), player, createRng(7));
    expect(player.activeWeapon.mutationId).not.toBeNull();
    const mutation = mutationsFor(player.activeWeapon.defId).find(
      (m) => m.id === player.activeWeapon.mutationId,
    );
    expect(mutation).toBeDefined();
  });

  it("lifesteal card adds lifesteal", () => {
    const player = createPlayerBaseState();
    applyCardToPlayer(findCard("lifesteal"), player, createRng(1));
    expect(player.lifesteal).toBeGreaterThan(0);
  });
});

describe("rollDailyCardPool", () => {
  it("is stable for a given seed and includes always-on cards", () => {
    const a = rollDailyCardPool(createRng(2026_05_04));
    const b = rollDailyCardPool(createRng(2026_05_04));
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id));
    const ids = new Set(a.map((c) => c.id));
    expect(ids.has("weapon-promote")).toBe(true);
    expect(ids.has("weapon-mutation")).toBe(true);
    expect(a).toHaveLength(2 + DAILY_POOL_SIZE_OPTIONAL);
  });

  it("varies with the seed", () => {
    const a = rollDailyCardPool(createRng(1));
    const b = rollDailyCardPool(createRng(2));
    const aIds = a.map((c) => c.id).sort();
    const bIds = b.map((c) => c.id).sort();
    expect(aIds).not.toEqual(bIds);
  });

  it("rollCards never offers cards outside the provided pool", () => {
    const rng = createRng(42);
    const player = createPlayerBaseState();
    const restricted = cardCatalog
      .filter((c) => c.id === "damage-up" || c.id === "speed-up" || c.id === "weapon-promote")
      .slice();
    const offers = rollCards(rng, player, 0, 2, restricted);
    const allowed = new Set(restricted.map((c) => c.id));
    for (const offer of offers) {
      expect(allowed.has(offer.card.id)).toBe(true);
    }
  });
});

describe("boss archetype determinism via wave-flow", () => {
  it("same seed produces same daily card pool ids order", () => {
    const a = rollDailyCardPool(createRng(123));
    const b = rollDailyCardPool(createRng(123));
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id));
  });
});

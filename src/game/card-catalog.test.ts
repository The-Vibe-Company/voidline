import { describe, expect, it } from "vitest";
import { cardCatalog, applyCardToPlayer, findCard, rollCards, rollTwoCards } from "./card-catalog";
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

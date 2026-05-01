import { describe, expect, it } from "vitest";
import { balance, createPlayerState } from "./balance";
import { applyEffect } from "./effect-dsl";

function setDamageMultiplier(multiplier: number) {
  const target = createPlayerState();
  applyEffect({ type: "addPct", stat: "damage", amount: multiplier - 1, scale: 1 }, 1, target);
  return target;
}

describe("percentage effect semantics", () => {
  it("adds positive percentage points to the current additive bonus", () => {
    const target = setDamageMultiplier(2);

    applyEffect({ type: "addPct", stat: "damage", amount: 0.1, scale: 1 }, 1, target);

    expect(target.damage).toBeCloseTo(balance.player.stats.damage * 2.1);
    expect(target.bonus.damagePct).toBeCloseTo(1.1);
  });

  it("adds negative percentage points to the current additive bonus", () => {
    const target = setDamageMultiplier(2);

    applyEffect({ type: "addPct", stat: "damage", amount: -0.1, scale: 1 }, 1, target);

    expect(target.damage).toBeCloseTo(balance.player.stats.damage * 1.9);
    expect(target.bonus.damagePct).toBeCloseTo(0.9);
  });

  it("scales current percentage once, then future additive bonuses remain additive", () => {
    const target = setDamageMultiplier(2);

    applyEffect({ type: "scaleCurrentPct", stat: "damage", factor: 1.1 }, 1, target);
    applyEffect({ type: "addPct", stat: "damage", amount: 0.1, scale: 1 }, 1, target);

    expect(target.damage).toBeCloseTo(balance.player.stats.damage * 2.3);
    expect(target.bonus.damagePct).toBeCloseTo(1.3);
  });

  it("scales current percentage down once, then future additive bonuses remain additive", () => {
    const target = setDamageMultiplier(2);

    applyEffect({ type: "scaleCurrentPct", stat: "damage", factor: 0.7 }, 1, target);
    applyEffect({ type: "addPct", stat: "damage", amount: 0.1, scale: 1 }, 1, target);

    expect(target.damage).toBeCloseTo(balance.player.stats.damage * 1.5);
    expect(target.bonus.damagePct).toBeCloseTo(0.5);
  });
});

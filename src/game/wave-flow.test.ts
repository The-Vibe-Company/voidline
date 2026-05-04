import { describe, expect, it, beforeEach } from "vitest";
import { state } from "../state";
import { startRun, thirdCardChance } from "./wave-flow";

describe("thirdCardChance", () => {
  beforeEach(() => {
    startRun("pulse");
  });

  it("returns 0 when no XP has dropped yet", () => {
    state.xpDropped = 0;
    state.xpCollected = 0;
    expect(thirdCardChance()).toBe(0);
  });

  it("returns full collection ratio when below 100%", () => {
    state.xpDropped = 100;
    state.xpCollected = 35;
    expect(thirdCardChance()).toBeCloseTo(0.35, 5);
  });

  it("clamps to 1 when collected exceeds dropped (boss orbs etc.)", () => {
    state.xpDropped = 50;
    state.xpCollected = 60;
    expect(thirdCardChance()).toBe(1);
  });

  it("returns 0 when nothing collected", () => {
    state.xpDropped = 200;
    state.xpCollected = 0;
    expect(thirdCardChance()).toBe(0);
  });
});

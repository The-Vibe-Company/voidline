import { describe, expect, it, beforeEach } from "vitest";
import { state } from "../state";
import { startRun, thirdCardChance } from "./wave-flow";

describe("thirdCardChance", () => {
  beforeEach(() => {
    startRun("pulse");
  });

  it("returns 0 before any enemy has spawned", () => {
    state.xpMax = 0;
    state.xpCollected = 0;
    expect(thirdCardChance()).toBe(0);
  });

  it("returns full collection ratio when below 100%", () => {
    state.xpMax = 100;
    state.xpCollected = 35;
    expect(thirdCardChance()).toBeCloseTo(0.35, 5);
  });

  it("clamps to 1 when collected exceeds spawned XP (boss orbs etc.)", () => {
    state.xpMax = 50;
    state.xpCollected = 60;
    expect(thirdCardChance()).toBe(1);
  });

  it("returns 0 when nothing collected", () => {
    state.xpMax = 200;
    state.xpCollected = 0;
    expect(thirdCardChance()).toBe(0);
  });
});

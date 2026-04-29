import { describe, expect, it } from "vitest";
import { shouldCollectOrb } from "./experience-pickup";
import { balance, createPlayerState } from "../game/balance";
import type { ExperienceOrb } from "../types";

function makeOrb(overrides: Partial<ExperienceOrb> = {}): ExperienceOrb {
  return {
    id: 1,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    radius: balance.xp.orbRadiusBase,
    value: 1,
    age: 0,
    magnetized: false,
    ...overrides,
  };
}

describe("shouldCollectOrb", () => {
  it("collects a non-magnetized orb anywhere inside the pickup radius", () => {
    const target = createPlayerState();
    const radius = balance.xp.pickupBaseRadius * target.pickupRadius;
    const inside = makeOrb({ x: radius - 1, y: 0 });
    const outside = makeOrb({ x: radius + 1, y: 0 });

    expect(shouldCollectOrb(inside, target, 1 / 60)).toBe(true);
    expect(shouldCollectOrb(outside, target, 1 / 60)).toBe(false);
  });

  it("never aspires non-magnetized orbs", () => {
    const target = createPlayerState();
    const radius = balance.xp.pickupBaseRadius * target.pickupRadius;
    const orb = makeOrb({ x: radius - 5, y: 0, vx: 0, vy: 0 });

    shouldCollectOrb(orb, target, 1 / 60);

    expect(orb.vx).toBe(0);
    expect(orb.vy).toBe(0);
  });

  it("scales the pickup radius with the player's pickupRadius multiplier", () => {
    const base = createPlayerState();
    const boosted = createPlayerState({ pickupRadius: 2 });
    const farOrb = makeOrb({ x: balance.xp.pickupBaseRadius * 1.5, y: 0 });

    expect(shouldCollectOrb(farOrb, base, 1 / 60)).toBe(false);
    expect(shouldCollectOrb(farOrb, boosted, 1 / 60)).toBe(true);
  });

  it("pulls magnetized orbs toward the player and collects them at contact range only", () => {
    const target = createPlayerState();
    const farMagnetized = makeOrb({ x: 1000, y: 0, magnetized: true });
    const contactMagnetized = makeOrb({ x: target.radius, y: 0, magnetized: true });

    expect(shouldCollectOrb(farMagnetized, target, 1 / 60)).toBe(false);
    expect(farMagnetized.vx).toBeLessThan(0);

    expect(shouldCollectOrb(contactMagnetized, target, 1 / 60)).toBe(true);
  });
});

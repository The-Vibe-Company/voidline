import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  experienceOrbs,
  floaters,
  particles,
  player,
  state,
  world,
} from "../state";
import { updateExperience } from "./experience";
import type { ExperienceOrb } from "../types";

function placeOrb(x: number, y: number, opts: Partial<ExperienceOrb> = {}): ExperienceOrb {
  return {
    x,
    y,
    vx: 0,
    vy: 0,
    radius: 6,
    value: 1,
    age: 0,
    magnetized: false,
    ...opts,
  };
}

function resetWorld(): void {
  world.width = 1280;
  world.height = 720;
  world.cameraX = 0;
  world.cameraY = 0;
  world.time = 0;
  world.shake = 0;
  player.x = 1000;
  player.y = 1000;
  player.radius = 18;
  player.pickupRadius = 1;
  player.hp = 100;
  player.maxHp = 100;
  state.mode = "playing";
  state.wave = 1;
  state.level = 1;
  state.xp = 0;
  state.xpTarget = 1000;
  state.pendingUpgrades = 0;
  experienceOrbs.length = 0;
  particles.length = 0;
  floaters.length = 0;
}

describe("experience orb update", () => {
  beforeEach(resetWorld);
  afterEach(resetWorld);

  it("collects an orb that overlaps the player", () => {
    experienceOrbs.push(placeOrb(player.x, player.y, { value: 4 }));

    updateExperience(0.016);

    expect(experienceOrbs.length).toBe(0);
    expect(state.xp).toBe(4);
  });

  it("does not collect an orb that sits well outside the pickup radius", () => {
    experienceOrbs.push(placeOrb(player.x + 400, player.y, { value: 4 }));

    updateExperience(0.016);

    expect(experienceOrbs.length).toBe(1);
    expect(state.xp).toBe(0);
  });

  it("pulls an orb toward the player when within pull radius", () => {
    const orb = placeOrb(player.x + 60, player.y);
    experienceOrbs.push(orb);

    updateExperience(0.05);

    expect(orb.vx).toBeLessThan(0);
    expect(Math.abs(orb.vy)).toBeLessThan(1);
  });

  it("does not pull an orb that is far away and not magnetized", () => {
    const orb = placeOrb(player.x + 600, player.y);
    experienceOrbs.push(orb);

    updateExperience(0.05);

    expect(Math.abs(orb.vx)).toBeLessThan(0.001);
    expect(Math.abs(orb.vy)).toBeLessThan(0.001);
  });

  it("pulls a magnetized orb regardless of distance", () => {
    const orb = placeOrb(player.x + 1500, player.y, { magnetized: true });
    experienceOrbs.push(orb);

    updateExperience(0.05);

    expect(orb.vx).toBeLessThan(-1);
  });

  it("pickup radius scales with player.pickupRadius", () => {
    player.pickupRadius = 1;
    const farOrb = placeOrb(player.x + 60, player.y);
    experienceOrbs.push(farOrb);
    updateExperience(0.05);
    const baselinePull = -farOrb.vx;
    expect(baselinePull).toBeGreaterThan(0);

    resetWorld();
    player.pickupRadius = 4;
    const sameOrb = placeOrb(player.x + 60, player.y);
    experienceOrbs.push(sameOrb);
    updateExperience(0.05);
    expect(-sameOrb.vx).toBeGreaterThan(baselinePull);
  });
});

import { describe, expect, it } from "vitest";
import { balance, createPlayerState } from "./balance";
import { applyWeapon } from "./weapon-catalog";

describe("weapon catalog", () => {
  it("keeps pulse weapon as the baseline", () => {
    const target = createPlayerState();

    applyWeapon("pulse", target);

    expect(target.damage).toBe(balance.player.stats.damage);
    expect(target.projectileCount).toBe(balance.player.stats.projectileCount);
  });

  it("applies scatter as a wider lower-damage start", () => {
    const target = createPlayerState();

    applyWeapon("scatter", target);

    expect(target.projectileCount).toBe(2);
    expect(target.damage).toBeLessThan(balance.player.stats.damage);
  });

  it("applies lance as a slower piercing start", () => {
    const target = createPlayerState();

    applyWeapon("lance", target);

    expect(target.pierce).toBe(1);
    expect(target.damage).toBeGreaterThan(balance.player.stats.damage);
    expect(target.fireRate).toBeLessThan(balance.player.stats.fireRate);
  });

  it("applies drone as an autonomous low-burst start", () => {
    const target = createPlayerState();

    applyWeapon("drone", target);

    expect(target.drones).toBe(1);
    expect(target.damage).toBeLessThan(balance.player.stats.damage);
  });
});

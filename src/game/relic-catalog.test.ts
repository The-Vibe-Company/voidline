import { describe, expect, it } from "vitest";
import { balance, createPlayerState } from "./balance";
import {
  applyRelic,
  defaultUnlockedRelicIds,
  fallbackRelic,
  findRelic,
  pickChestRelics,
  relicUnlocksForBossStage,
} from "./relic-catalog";

describe("chest relic choices", () => {
  it("offers three unlocked and unowned relics when possible", () => {
    const unlocked = defaultUnlockedRelicIds();
    const choices = pickChestRelics(3, new Set(), unlocked, undefined, () => 0);
    const ids = choices.map((choice) => choice.relic.id);

    expect(choices.length).toBe(3);
    expect(new Set(ids).size).toBe(3);
    expect(ids.every((id) => unlocked.has(id))).toBe(true);
  });

  it("excludes owned relics and falls back to repair when the pool is empty", () => {
    const unlocked = defaultUnlockedRelicIds();
    const owned = new Set(unlocked);
    const choices = pickChestRelics(3, owned, unlocked, undefined, () => 0);

    expect(choices).toHaveLength(1);
    expect(choices[0]!.relic).toBe(fallbackRelic);
  });
});

describe("relic effects", () => {
  it("respects existing projectile, drone, pierce, and crit caps", () => {
    const target = createPlayerState({
      projectileCount: balance.upgrade.caps.projectiles,
      drones: balance.upgrade.caps.drones,
      pierce: balance.upgrade.caps.pierce,
      critChance: 0.94,
    });

    applyRelic(findRelic("splitter-matrix"), target);
    applyRelic(findRelic("drone-contract"), target);
    applyRelic(findRelic("critical-orbit"), target);

    expect(target.projectileCount).toBe(balance.upgrade.caps.projectiles);
    expect(target.drones).toBe(balance.upgrade.caps.drones);
    expect(target.pierce).toBe(balance.upgrade.caps.pierce);
    expect(target.critChance).toBe(balance.upgrade.caps.critChance);
  });

  it("changes only the current player state", () => {
    const target = createPlayerState();

    applyRelic(findRelic("rail-focus"), target);

    expect(target.damage).toBeGreaterThan(balance.player.stats.damage);
    expect(createPlayerState().damage).toBe(balance.player.stats.damage);
  });
});

describe("relic unlocks", () => {
  it("unlocks new relic ids from boss stage milestones", () => {
    expect(relicUnlocksForBossStage(0)).toEqual([]);
    expect(relicUnlocksForBossStage(1)).toContain("splitter-matrix");
    expect(relicUnlocksForBossStage(2)).toEqual(
      expect.arrayContaining(["splitter-matrix", "drone-contract"]),
    );
    expect(relicUnlocksForBossStage(3)).toEqual(
      expect.arrayContaining(["splitter-matrix", "drone-contract", "critical-orbit"]),
    );
  });
});

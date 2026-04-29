import { describe, expect, it } from "vitest";
import { createPlayerState, upgradeTiers } from "../game/balance";
import { findRelic } from "../game/relic-catalog";
import { findUpgrade } from "../game/upgrade-catalog";
import {
  activeSynergiesFromTagCounts,
  buildTagCountsFromLoadout,
  refreshPlayerTraits,
} from "./synergies";

const tier = upgradeTiers[0]!;

describe("build synergy calculation", () => {
  it("activates rail splitter from cannon, crit, and pierce tags", () => {
    const upgradeLoadout = [
      { upgrade: findUpgrade("rail-slug"), tier, count: 1 },
      { upgrade: findUpgrade("piercer"), tier, count: 1 },
      { upgrade: findUpgrade("crit-array"), tier, count: 1 },
    ];
    const counts = buildTagCountsFromLoadout(upgradeLoadout, []);

    expect(activeSynergiesFromTagCounts(counts).map((synergy) => synergy.id)).toContain(
      "rail-splitter",
    );
  });

  it("refreshes player trait flags without stacking stat effects", () => {
    const target = createPlayerState({ magnetStormCharge: 30, ramTimer: 1 });
    const upgradeLoadout = [
      { upgrade: findUpgrade("kinetic-shield"), tier, count: 1 },
      { upgrade: findUpgrade("repair-bay"), tier, count: 1 },
    ];

    refreshPlayerTraits(target, upgradeLoadout, []);

    expect(target.traits.kineticRam).toBe(true);
    expect(target.traits.magnetStorm).toBe(false);
    expect(target.magnetStormCharge).toBe(0);
  });

  it("counts repeated tags toward magnet storm", () => {
    const counts = buildTagCountsFromLoadout(
      [{ upgrade: findUpgrade("magnet-array"), tier, count: 2 }],
      [{ relic: findRelic("magnetized-map"), count: 1 }],
    );

    expect(counts.get("magnet")).toBe(3);
    expect(activeSynergiesFromTagCounts(counts).map((synergy) => synergy.id)).toContain(
      "magnet-storm",
    );
  });

  it("refreshes every player trait from real upgrade and relic loadouts", () => {
    const target = createPlayerState();
    const upgradeLoadout = [
      { upgrade: findUpgrade("rail-slug"), tier, count: 1 },
      { upgrade: findUpgrade("piercer"), tier, count: 1 },
      { upgrade: findUpgrade("crit-array"), tier, count: 1 },
      { upgrade: findUpgrade("orbital-drone"), tier, count: 1 },
      { upgrade: findUpgrade("kinetic-shield"), tier, count: 1 },
      { upgrade: findUpgrade("repair-bay"), tier, count: 1 },
      { upgrade: findUpgrade("magnet-array"), tier, count: 1 },
    ];
    const relicLoadout = [{ relic: findRelic("magnetized-map"), count: 1 }];

    refreshPlayerTraits(target, upgradeLoadout, relicLoadout);

    expect(target.traits).toEqual({
      railSplitter: true,
      droneSwarm: true,
      kineticRam: true,
      magnetStorm: true,
    });
  });
});

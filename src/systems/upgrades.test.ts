import { beforeEach, describe, expect, it } from "vitest";
import { ownedRelics, ownedUpgrades, player, state } from "../state";
import { createPlayerState, upgradeTiers } from "../game/balance";
import { findUpgrade } from "../game/upgrade-catalog";
import { setSimulationSeed } from "../simulation/random";
import { pickUpgrades } from "./upgrades";

const tier = upgradeTiers[0]!;

function resetDraftState(): void {
  setSimulationSeed(7);
  Object.assign(player, createPlayerState());
  ownedUpgrades.clear();
  ownedRelics.clear();
  state.wave = 1;
}

describe("upgrade draft", () => {
  beforeEach(resetDraftState);

  it("offers both build support and off-build options once a build starts", () => {
    ownedUpgrades.set("rail-slug:standard", {
      upgrade: findUpgrade("rail-slug"),
      tier,
      count: 1,
    });

    const choices = pickUpgrades(3);
    const supportsCannon = choices.some((choice) => choice.upgrade.tags.includes("cannon"));
    const offersOffBuild = choices.some((choice) => !choice.upgrade.tags.includes("cannon"));

    expect(choices).toHaveLength(3);
    expect(supportsCannon).toBe(true);
    expect(offersOffBuild).toBe(true);
  });
});

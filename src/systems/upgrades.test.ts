import { beforeEach, describe, expect, it } from "vitest";
import { ownedRelics, ownedUpgrades, state } from "../state";
import { upgradeTiers } from "../game/balance";
import { findUpgrade } from "../game/upgrade-catalog";
import { createDefaultAccountProgress } from "../game/account-progression";
import { resetAccountProgress, restoreAccountProgress } from "./account";
import { resetSimulation } from "../simulation/simulation";
import { applyUpgrade, pickUpgrades } from "./upgrades";

const tier = upgradeTiers[0]!;

function resetDraftState(): void {
  ownedUpgrades.clear();
  ownedRelics.clear();
  resetAccountProgress(null);
  resetSimulation(7);
  state.pressure = 1;
}

describe("upgrade draft", () => {
  beforeEach(resetDraftState);

  it("offers both build support and off-build options once a build starts", () => {
    applyUpgrade({
      upgrade: findUpgrade("rail-slug"),
      tier,
    });

    const choices = pickUpgrades(3);
    const supportsCannon = choices.some((choice) => choice.upgrade.tags.includes("cannon"));
    const offersOffBuild = choices.some((choice) => !choice.upgrade.tags.includes("cannon"));

    expect(choices).toHaveLength(3);
    expect(supportsCannon).toBe(true);
    expect(offersOffBuild).toBe(true);
  });

  it("does not offer locked technologies until bought", () => {
    let ids = pickUpgrades(12).map((choice) => choice.upgrade.id);
    expect(ids).not.toContain("kinetic-shield");

    restoreAccountProgress({
      ...createDefaultAccountProgress(),
      upgradeLevels: { "category:defense": 1 },
    });
    ids = pickUpgrades(12).map((choice) => choice.upgrade.id);

    expect(ids).toContain("kinetic-shield");
  });

  it("offers level-ups only for the selected weapon", () => {
    let ids = pickUpgrades(12).map((choice) => choice.upgrade.id);
    expect(ids).toContain("pulse-overdrive");
    expect(ids).not.toContain("lance-capacitor");

    restoreAccountProgress({
      ...createDefaultAccountProgress(),
      upgradeLevels: { "unique:weapon-lance": 1 },
      selectedWeaponId: "lance",
    });
    ids = pickUpgrades(12).map((choice) => choice.upgrade.id);

    expect(ids).toContain("lance-capacitor");
    expect(ids).not.toContain("pulse-overdrive");
  });
});

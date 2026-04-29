import { beforeEach, describe, expect, it } from "vitest";
import { ownedRelics, ownedUpgrades, player, state } from "../state";
import { createPlayerState, upgradeTiers } from "../game/balance";
import { findUpgrade } from "../game/upgrade-catalog";
import { setSimulationSeed } from "../simulation/random";
import type { BuildTag, Upgrade } from "../types";
import { createDefaultAccountProgress } from "../game/account-progression";
import { resetAccountProgress, restoreAccountProgress } from "./account";
import { pickUpgradeDraft, pickUpgrades } from "./upgrades";

const tier = upgradeTiers[0]!;

function resetDraftState(): void {
  setSimulationSeed(7);
  Object.assign(player, createPlayerState());
  ownedUpgrades.clear();
  ownedRelics.clear();
  resetAccountProgress(null);
  state.wave = 1;
}

function draftUpgrade(id: string, tags: BuildTag[]): Upgrade {
  return {
    id,
    kind: "technology",
    icon: id.slice(0, 2).toUpperCase(),
    name: id,
    description: id,
    tags,
    effect: () => id,
    apply: () => undefined,
  };
}

function tagCounts(entries: [BuildTag, number][] = []): ReadonlyMap<BuildTag, number> {
  return new Map(entries);
}

describe("upgrade draft", () => {
  beforeEach(resetDraftState);

  it("returns the available pool when fewer choices exist than requested", () => {
    const candidates = [
      draftUpgrade("one", ["cannon"]),
      draftUpgrade("two", ["crit"]),
    ];

    const draft = pickUpgradeDraft(candidates, 3, tagCounts());

    expect(draft).toHaveLength(2);
    expect(new Set(draft.map((upgrade) => upgrade.id))).toEqual(new Set(["one", "two"]));
  });

  it("keeps a draft valid when every available option supports the current build", () => {
    const candidates = [
      draftUpgrade("cannon-one", ["cannon"]),
      draftUpgrade("cannon-two", ["cannon", "pierce"]),
      draftUpgrade("cannon-three", ["cannon"]),
    ];

    const draft = pickUpgradeDraft(candidates, 3, tagCounts([["cannon", 1]]));

    expect(draft).toHaveLength(3);
    expect(draft.every((upgrade) => upgrade.tags.includes("cannon"))).toBe(true);
  });

  it("adds a missing synergy tag before a generic off-build option", () => {
    setSimulationSeed(1);
    const candidates = [
      draftUpgrade("support-one", ["cannon"]),
      draftUpgrade("support-two", ["cannon"]),
      draftUpgrade("support-three", ["cannon"]),
      draftUpgrade("crit-bridge", ["crit"]),
      draftUpgrade("generic", ["salvage"]),
    ];

    const draft = pickUpgradeDraft(candidates, 3, tagCounts([["cannon", 1]]));

    expect(draft.some((upgrade) => upgrade.tags.includes("cannon"))).toBe(true);
    expect(draft.map((upgrade) => upgrade.id)).toContain("crit-bridge");
  });

  it("adds repeated tags that advance stacked synergy requirements", () => {
    setSimulationSeed(2);
    const candidates = [
      draftUpgrade("shield-support", ["shield"]),
      draftUpgrade("salvage-support", ["salvage"]),
      draftUpgrade("cannon-offbuild", ["cannon"]),
      draftUpgrade("drone-offbuild", ["drone"]),
      draftUpgrade("magnet-bridge", ["magnet"]),
    ];

    const draft = pickUpgradeDraft(candidates, 3, tagCounts([["magnet", 1], ["shield", 1]]));

    expect(draft.some((upgrade) => upgrade.tags.includes("shield"))).toBe(true);
    expect(draft.map((upgrade) => upgrade.id)).toContain("magnet-bridge");
  });

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

  it("does not offer locked technologies until bought", () => {
    let ids = pickUpgrades(12).map((choice) => choice.upgrade.id);
    expect(ids).not.toContain("kinetic-shield");
    expect(ids).not.toContain("crit-array");

    restoreAccountProgress({
      ...createDefaultAccountProgress(),
      purchasedUnlockIds: ["technology:kinetic-shield", "technology:crit-array"],
    });
    ids = pickUpgrades(12).map((choice) => choice.upgrade.id);

    expect(ids).toContain("kinetic-shield");
    expect(ids).toContain("crit-array");
  });

  it("offers level-ups only for the selected weapon", () => {
    let ids = pickUpgrades(12).map((choice) => choice.upgrade.id);
    expect(ids).toContain("pulse-overdrive");
    expect(ids).not.toContain("lance-capacitor");

    restoreAccountProgress({
      ...createDefaultAccountProgress(),
      purchasedUnlockIds: ["weapon:lance"],
      selectedWeaponId: "lance",
    });
    ids = pickUpgrades(12).map((choice) => choice.upgrade.id);

    expect(ids).toContain("lance-capacitor");
    expect(ids).not.toContain("pulse-overdrive");
  });
});

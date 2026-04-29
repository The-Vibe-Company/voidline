import { beforeEach, describe, expect, it } from "vitest";
import { ownedRelics, ownedUpgrades, player, state } from "../state";
import { createPlayerState, upgradeTiers } from "../game/balance";
import { findUpgrade } from "../game/upgrade-catalog";
import { setSimulationSeed } from "../simulation/random";
import type { BuildTag, Upgrade } from "../types";
import { pickUpgradeDraft, pickUpgrades } from "./upgrades";

const tier = upgradeTiers[0]!;

function resetDraftState(): void {
  setSimulationSeed(7);
  Object.assign(player, createPlayerState());
  ownedUpgrades.clear();
  ownedRelics.clear();
  state.wave = 1;
}

function draftUpgrade(id: string, tags: BuildTag[]): Upgrade {
  return {
    id,
    icon: id.slice(0, 2).toUpperCase(),
    name: id,
    description: id,
    tags,
    effect: () => id,
    apply: () => undefined,
  };
}

describe("upgrade draft", () => {
  beforeEach(resetDraftState);

  it("returns the available pool when fewer choices exist than requested", () => {
    const candidates = [
      draftUpgrade("one", ["cannon"]),
      draftUpgrade("two", ["crit"]),
    ];

    const draft = pickUpgradeDraft(candidates, 3, new Set());

    expect(draft).toHaveLength(2);
    expect(new Set(draft.map((upgrade) => upgrade.id))).toEqual(new Set(["one", "two"]));
  });

  it("keeps a draft valid when every available option supports the current build", () => {
    const candidates = [
      draftUpgrade("cannon-one", ["cannon"]),
      draftUpgrade("cannon-two", ["cannon", "pierce"]),
      draftUpgrade("cannon-three", ["cannon"]),
    ];

    const draft = pickUpgradeDraft(candidates, 3, new Set<BuildTag>(["cannon"]));

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

    const draft = pickUpgradeDraft(candidates, 3, new Set<BuildTag>(["cannon"]));

    expect(draft.some((upgrade) => upgrade.tags.includes("cannon"))).toBe(true);
    expect(draft.map((upgrade) => upgrade.id)).toContain("crit-bridge");
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
});

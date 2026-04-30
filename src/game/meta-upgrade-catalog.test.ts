import { describe, expect, it } from "vitest";
import { createDefaultAccountProgress } from "./account-progression";
import {
  canPurchaseLevel,
  findMetaUpgrade,
  metaUpgradeCatalog,
  metaUpgradeLevel,
  nextLevelCost,
  unlockedBuildTagsFromMeta,
  unlockedTechnologyIdsFromMeta,
} from "./meta-upgrade-catalog";
import type { MetaUpgradeId } from "../types";

const ALL_IDS: MetaUpgradeId[] = [
  "unique:weapon-scatter",
  "unique:weapon-lance",
  "unique:weapon-drone",
  "unique:char-runner",
  "unique:char-tank",
  "unique:extra-choice",
  "unique:reroll",
  "category:attack",
  "category:defense",
  "category:salvage",
  "category:tempo",
];

describe("meta upgrade catalog", () => {
  it("has an entry for every MetaUpgradeId", () => {
    for (const id of ALL_IDS) {
      expect(() => findMetaUpgrade(id)).not.toThrow();
    }
    expect(metaUpgradeCatalog).toHaveLength(ALL_IDS.length);
  });

  it("uses strictly increasing cost per category level", () => {
    for (const upgrade of metaUpgradeCatalog) {
      if (upgrade.kind !== "category") continue;
      for (let level = 1; level < upgrade.maxLevel; level += 1) {
        expect(upgrade.costAt(level + 1)).toBeGreaterThan(upgrade.costAt(level));
      }
    }
  });

  it("describes every level of every category", () => {
    for (const upgrade of metaUpgradeCatalog) {
      if (upgrade.kind !== "category") continue;
      expect(upgrade.levels).toBeDefined();
      expect(upgrade.levels).toHaveLength(upgrade.maxLevel);
    }
  });
});

describe("metaUpgradeLevel", () => {
  it("clamps stored levels to [0, maxLevel]", () => {
    const progress = createDefaultAccountProgress();
    progress.upgradeLevels["category:attack"] = 99;
    expect(metaUpgradeLevel(progress, "category:attack")).toBe(4);

    progress.upgradeLevels["category:attack"] = -3;
    expect(metaUpgradeLevel(progress, "category:attack")).toBe(0);
  });

  it("returns 0 for unrecorded ids", () => {
    const progress = createDefaultAccountProgress();
    expect(metaUpgradeLevel(progress, "category:tempo")).toBe(0);
  });
});

describe("nextLevelCost", () => {
  it("returns the cost of the next purchasable level", () => {
    const progress = createDefaultAccountProgress();
    expect(nextLevelCost(progress, "category:attack")).toBe(40);
    progress.upgradeLevels["category:attack"] = 1;
    expect(nextLevelCost(progress, "category:attack")).toBe(75);
    progress.upgradeLevels["category:attack"] = 3;
    expect(nextLevelCost(progress, "category:attack")).toBe(220);
  });

  it("returns null at max level", () => {
    const progress = createDefaultAccountProgress();
    progress.upgradeLevels["category:attack"] = 4;
    expect(nextLevelCost(progress, "category:attack")).toBeNull();
  });
});

describe("canPurchaseLevel", () => {
  it("rejects when the requirement is not met", () => {
    const progress = createDefaultAccountProgress();
    progress.crystals = 999;
    const result = canPurchaseLevel(progress, "unique:weapon-drone");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("locked");
  });

  it("rejects when crystals are insufficient", () => {
    const progress = createDefaultAccountProgress();
    progress.crystals = 10;
    const result = canPurchaseLevel(progress, "category:attack");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("crystals");
  });

  it("rejects at max level", () => {
    const progress = createDefaultAccountProgress();
    progress.crystals = 9999;
    progress.upgradeLevels["unique:extra-choice"] = 1;
    const result = canPurchaseLevel(progress, "unique:extra-choice");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("max-level");
  });

  it("accepts when reveal + crystals are sufficient", () => {
    const progress = createDefaultAccountProgress();
    progress.crystals = 200;
    const result = canPurchaseLevel(progress, "category:attack");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.cost).toBe(40);
  });
});

describe("derived unlocks from meta levels", () => {
  it("injects technology ids when matching category levels >= 1", () => {
    const progress = createDefaultAccountProgress();
    expect(unlockedTechnologyIdsFromMeta(progress).size).toBe(0);

    progress.upgradeLevels["category:attack"] = 1;
    progress.upgradeLevels["category:defense"] = 2;
    progress.upgradeLevels["category:tempo"] = 3;
    const techs = unlockedTechnologyIdsFromMeta(progress);
    expect(techs.has("heavy-caliber")).toBe(true);
    expect(techs.has("kinetic-shield")).toBe(true);
    expect(techs.has("crit-array")).toBe(true);
  });

  it("injects build tags when matching category levels >= 1", () => {
    const progress = createDefaultAccountProgress();
    progress.upgradeLevels["category:attack"] = 1;
    progress.upgradeLevels["category:salvage"] = 2;
    const tags = unlockedBuildTagsFromMeta(progress);
    expect(tags.has("cannon")).toBe(true);
    expect(tags.has("salvage")).toBe(true);
    expect(tags.has("shield")).toBe(false);
  });
});

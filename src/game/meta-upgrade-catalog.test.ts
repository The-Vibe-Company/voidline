import { describe, expect, it } from "vitest";
import { createDefaultAccountProgress } from "./account-progression";
import {
  bossBountyBonusFromMeta,
  canPurchaseLevel,
  cardTierCapAtLevel,
  findMetaUpgrade,
  metaUpgradeCatalog,
  metaUpgradeLevel,
  nextLevelCost,
  rarityProfileFromMeta,
  recommendMetaUpgrade,
  unlockedBuildTagsFromMeta,
  unlockedTechnologyIdsFromMeta,
  upgradeTierCapsFromMeta,
} from "./meta-upgrade-catalog";
import type { MetaUpgradeId } from "../types";

const ALL_IDS: MetaUpgradeId[] = [
  "unique:weapon-scatter",
  "unique:weapon-lance",
  "unique:weapon-drone",
  "unique:char-runner",
  "unique:char-tank",
  "unique:char-engineer",
  "unique:extra-choice",
  "card:twin-cannon",
  "card:plasma-core",
  "card:rail-slug",
  "card:velocity-driver",
  "card:ion-engine",
  "card:magnet-array",
  "card:kinetic-shield",
  "card:crit-array",
  "card:heavy-caliber",
  "rarity:rare-signal",
  "rarity:prototype-lab",
  "rarity:singularity-core",
  "utility:crystal-contract",
  "utility:boss-bounty",
];

describe("meta upgrade catalog", () => {
  it("has an entry for every MetaUpgradeId", () => {
    for (const id of ALL_IDS) {
      expect(() => findMetaUpgrade(id)).not.toThrow();
    }
    expect(metaUpgradeCatalog).toHaveLength(ALL_IDS.length);
  });

  it("does not expose deleted category or reroll upgrades", () => {
    const ids = metaUpgradeCatalog.map((upgrade) => upgrade.id as string);
    expect(ids.some((id) => id.startsWith("category:"))).toBe(false);
    expect(ids).not.toContain("unique:reroll");
  });

  it("describes every level of every multi-level upgrade", () => {
    for (const upgrade of metaUpgradeCatalog) {
      if (upgrade.maxLevel <= 1) continue;
      expect(upgrade.levels).toBeDefined();
      expect(upgrade.levels).toHaveLength(upgrade.maxLevel);
    }
  });
});

describe("metaUpgradeLevel", () => {
  it("starts starter cards at level 1 without storing them", () => {
    const progress = createDefaultAccountProgress();

    expect(metaUpgradeLevel(progress, "card:plasma-core")).toBe(1);
    expect(metaUpgradeLevel(progress, "card:twin-cannon")).toBe(0);
  });

  it("clamps stored levels to [baseLevel, maxLevel]", () => {
    const progress = createDefaultAccountProgress();
    progress.upgradeLevels["card:twin-cannon"] = 99;
    expect(metaUpgradeLevel(progress, "card:twin-cannon")).toBe(4);

    progress.upgradeLevels["card:plasma-core"] = -3;
    expect(metaUpgradeLevel(progress, "card:plasma-core")).toBe(1);
  });
});

describe("nextLevelCost", () => {
  it("returns the next purchasable card level cost", () => {
    const progress = createDefaultAccountProgress();
    expect(nextLevelCost(progress, "card:twin-cannon")).toBe(40);
    expect(nextLevelCost(progress, "card:plasma-core")).toBe(80);
    progress.upgradeLevels["card:twin-cannon"] = 1;
    expect(nextLevelCost(progress, "card:twin-cannon")).toBe(85);
    progress.upgradeLevels["card:twin-cannon"] = 3;
    expect(nextLevelCost(progress, "card:twin-cannon")).toBe(460);
  });

  it("returns null at max level", () => {
    const progress = createDefaultAccountProgress();
    progress.upgradeLevels["card:twin-cannon"] = 4;
    expect(nextLevelCost(progress, "card:twin-cannon")).toBeNull();
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
    const result = canPurchaseLevel(progress, "card:twin-cannon");
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
    const result = canPurchaseLevel(progress, "card:twin-cannon");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.cost).toBe(40);
  });
});

describe("recommendMetaUpgrade", () => {
  it("recommends the cheapest purchasable revealed upgrade", () => {
    const progress = createDefaultAccountProgress();
    progress.crystals = 40;

    const recommendation = recommendMetaUpgrade(progress);

    expect(recommendation.state).toBe("purchase");
    if (recommendation.state === "purchase") {
      expect(recommendation.upgrade.id).toBe("card:twin-cannon");
      expect(recommendation.cost).toBe(40);
      expect(recommendation.level).toBe(1);
    }
  });

  it("recommends saving toward the cheapest revealed upgrade when crystals are low", () => {
    const progress = createDefaultAccountProgress();
    progress.crystals = 10;

    const recommendation = recommendMetaUpgrade(progress);

    expect(recommendation.state).toBe("save");
    if (recommendation.state === "save") {
      expect(recommendation.upgrade.id).toBe("card:twin-cannon");
      expect(recommendation.missing).toBe(30);
    }
  });

  it("returns complete when every meta upgrade is maxed", () => {
    const progress = createDefaultAccountProgress();
    progress.crystals = 99999;
    for (const upgrade of metaUpgradeCatalog) {
      progress.upgradeLevels[upgrade.id] = upgrade.maxLevel;
    }

    expect(recommendMetaUpgrade(progress)).toEqual({ state: "complete" });
  });
});

describe("derived unlocks from meta levels", () => {
  it("injects technology ids from starter and purchased cards", () => {
    const progress = createDefaultAccountProgress();
    let techs = unlockedTechnologyIdsFromMeta(progress);
    expect(techs.has("plasma-core")).toBe(true);
    expect(techs.has("twin-cannon")).toBe(false);

    progress.upgradeLevels["card:twin-cannon"] = 1;
    progress.upgradeLevels["card:kinetic-shield"] = 2;
    techs = unlockedTechnologyIdsFromMeta(progress);
    expect(techs.has("twin-cannon")).toBe(true);
    expect(techs.has("kinetic-shield")).toBe(true);
  });

  it("injects build tags when matching cards are unlocked", () => {
    const progress = createDefaultAccountProgress();
    progress.upgradeLevels["card:crit-array"] = 1;
    const tags = unlockedBuildTagsFromMeta(progress);
    expect(tags.has("crit")).toBe(true);
    expect(tags.has("shield")).toBe(false);
  });

  it("derives per-upgrade tier caps from card levels", () => {
    const progress = createDefaultAccountProgress();
    progress.upgradeLevels["card:twin-cannon"] = 3;
    const caps = upgradeTierCapsFromMeta(progress);

    expect(caps["plasma-core"]).toBe("standard");
    expect(caps["twin-cannon"]).toBe("prototype");
  });

  it("derives rarity profile from dedicated rarity cards", () => {
    const progress = createDefaultAccountProgress();
    progress.upgradeLevels["rarity:rare-signal"] = 2;
    progress.upgradeLevels["rarity:singularity-core"] = 1;

    expect(rarityProfileFromMeta(progress)).toEqual({
      rare: 2,
      prototype: 0,
      singularity: 1,
    });
  });

  it("maps card levels to tier caps", () => {
    expect(cardTierCapAtLevel(0)).toBeNull();
    expect(cardTierCapAtLevel(1)).toBe("standard");
    expect(cardTierCapAtLevel(2)).toBe("rare");
    expect(cardTierCapAtLevel(3)).toBe("prototype");
    expect(cardTierCapAtLevel(4)).toBe("singularity");
  });

  it("returns the boss-bounty bonus per level and clamps overflow", () => {
    const progress = createDefaultAccountProgress();
    expect(bossBountyBonusFromMeta(progress)).toBe(0);

    progress.upgradeLevels["utility:boss-bounty"] = 1;
    expect(bossBountyBonusFromMeta(progress)).toBe(8);

    progress.upgradeLevels["utility:boss-bounty"] = 2;
    expect(bossBountyBonusFromMeta(progress)).toBe(16);

    progress.upgradeLevels["utility:boss-bounty"] = 3;
    expect(bossBountyBonusFromMeta(progress)).toBe(25);

    progress.upgradeLevels["utility:boss-bounty"] = 99;
    expect(bossBountyBonusFromMeta(progress)).toBe(25);
  });
});

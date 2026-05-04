import { describe, expect, it } from "vitest";
import { metaUpgradeCatalog } from "./meta-upgrade-catalog";

describe("meta upgrade catalog", () => {
  it("exposes an icon asset path for every entry", () => {
    for (const upgrade of metaUpgradeCatalog) {
      expect(upgrade.icon).toMatch(/^\/icons\/upgrades\/.+\.png$/);
    }
  });

  it("ids are unique", () => {
    const ids = metaUpgradeCatalog.map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

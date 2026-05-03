import { describe, expect, it } from "vitest";
import { upgradePool } from "./upgrade-catalog";
import type { EffectOp } from "./effect-dsl";

type EffectClass = "buff" | "malus" | "neutral";

function classifyEffectsContribution(op: EffectOp): EffectClass[] {
  switch (op.type) {
    case "addPct":
    case "addCappedPct":
    case "addCappedPctBonus":
      return [op.amount > 0 ? "buff" : op.amount < 0 ? "malus" : "neutral"];
    case "addCapped":
      return [op.amount > 0 ? "buff" : op.amount < 0 ? "malus" : "neutral"];
    case "scaleCurrentPct":
      return [op.factor < 1 ? "malus" : op.factor > 1 ? "buff" : "neutral"];
    case "shieldGrant": {
      const buffs: EffectClass[] = [];
      if (op.shield > 0) buffs.push("buff");
      if (op.regen > 0) buffs.push("buff");
      if ((op.maxHpBonus ?? 0) > 0) buffs.push("buff");
      return buffs.length === 0 ? ["neutral"] : buffs;
    }
    case "addLifesteal":
      return [op.amount > 0 ? "buff" : op.amount < 0 ? "malus" : "neutral"];
    case "healFlat":
    case "healPct":
      return [op.amount > 0 ? "buff" : "neutral"];
    case "addMaxHp":
      return [op.amount > 0 ? "buff" : op.amount < 0 ? "malus" : "neutral"];
    case "setMin":
      return ["buff"];
  }
}

// kinetic-shield grants shield + regen + maxHp via shieldGrant. Tracked here as
// a known violation of the single-stat rule pending a follow-up split.
const LEGACY_MULTI_STAT_UPGRADES = new Set<string>([
  "kinetic-shield",
]);

function touchesStat(op: EffectOp, stat: "projectileCount" | "pierce"): boolean {
  return op.type === "addCapped" && op.stat === stat && op.amount > 0;
}

function hasDamageMalus(effects: readonly EffectOp[]): boolean {
  return effects.some(
    (op) =>
      (op.type === "scaleCurrentPct" && op.stat === "damage" && op.factor < 1) ||
      (op.type === "addPct" && op.stat === "damage" && op.amount < 0) ||
      (op.type === "addCappedPctBonus" && op.stat === "damage" && op.amount < 0),
  );
}

describe("upgrade catalog shape — single-stat with malus exception", () => {
  it("never stacks more than one buff op without a malus", () => {
    const offenders = upgradePool
      .filter((upgrade) => !LEGACY_MULTI_STAT_UPGRADES.has(upgrade.id))
      .map((upgrade) => {
        const classes = upgrade.effects.flatMap(classifyEffectsContribution);
        const buffs = classes.filter((c) => c === "buff").length;
        const maluses = classes.filter((c) => c === "malus").length;
        return { id: upgrade.id, buffs, maluses };
      })
      .filter((entry) => entry.buffs > 1 && entry.maluses === 0);

    expect(offenders, JSON.stringify(offenders, null, 2)).toEqual([]);
  });

  it("documents legacy multi-stat exceptions explicitly", () => {
    const legacyMultiStat = upgradePool.filter((upgrade) => {
      const classes = upgrade.effects.flatMap(classifyEffectsContribution);
      const buffs = classes.filter((c) => c === "buff").length;
      const maluses = classes.filter((c) => c === "malus").length;
      return buffs > 1 && maluses === 0;
    });

    const ids = legacyMultiStat.map((u) => u.id).sort();
    const expected = [...LEGACY_MULTI_STAT_UPGRADES].sort();
    expect(ids).toEqual(expected);
  });

  it("requires a damage malus when a card adds projectiles", () => {
    const offenders = upgradePool.filter(
      (upgrade) =>
        upgrade.effects.some((op) => touchesStat(op, "projectileCount")) &&
        !hasDamageMalus(upgrade.effects),
    );

    expect(offenders.map((u) => u.id)).toEqual([]);
  });

  it("requires a damage malus when a card adds pierce", () => {
    const offenders = upgradePool.filter(
      (upgrade) =>
        upgrade.effects.some((op) => touchesStat(op, "pierce")) &&
        !hasDamageMalus(upgrade.effects),
    );

    expect(offenders.map((u) => u.id)).toEqual([]);
  });
});

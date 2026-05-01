import { it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { balance, enemySpawnRules } from "../src/game/balance";
import { upgradePool } from "../src/game/upgrade-catalog";
import { relicPool, fallbackRelic, RELIC_UNLOCKS, DEFAULT_RELIC_IDS } from "../src/game/relic-catalog";
import { metaUpgradeCatalog } from "../src/game/meta-upgrade-catalog";
import {
  shopCatalog,
  STARTER_TECHNOLOGY_IDS,
  STARTER_BUILD_TAGS,
} from "../src/game/shop-catalog";
import { characterCatalog } from "../src/game/character-catalog";
import { weaponCatalog } from "../src/game/weapon-catalog";
import { bossCatalog } from "../src/game/boss-catalog";

const RUN = process.env.RUN_DATA_EXPORT === "1";
const CHECK = process.env.CHECK_DATA_EXPORT === "1";

interface ExportedUpgrade {
  id: string;
  kind: "technology" | "weapon";
  weaponId?: string;
  icon: string;
  name: string;
  description: string;
  tags: readonly string[];
  effects: unknown;
  softCap?: { stat: string; max: number };
}

interface ExportedRelic {
  id: string;
  icon: string;
  name: string;
  description: string;
  tags: readonly string[];
  color: string;
  effect: string;
  repeatable?: boolean;
  effects: unknown;
}

interface ExportedCharacter {
  id: string;
  name: string;
  icon: string;
  description: string;
  bonusLabel: string;
  effects: unknown;
}

interface ExportedWeapon {
  id: string;
  name: string;
  icon: string;
  description: string;
  tags: readonly string[];
  effects: unknown;
}

interface ExportedMetaUpgrade {
  id: string;
  kind: "unique" | "category";
  name: string;
  description: string;
  maxLevel: number;
  costs: number[];
  requirement: string;
  tag?: string;
  weaponId?: string;
  characterId?: string;
  technologyId?: string;
  upgradeId?: string;
  rarityTier?: string;
  baseLevel?: number;
  levels?: ReadonlyArray<{ summary: string }>;
}

function toExportedUpgrade(u: (typeof upgradePool)[number]): ExportedUpgrade {
  return {
    id: u.id,
    kind: u.kind,
    weaponId: u.weaponId,
    icon: u.icon,
    name: u.name,
    description: u.description,
    tags: u.tags,
    effects: u.effects,
    softCap: u.softCap,
  };
}

function toExportedRelic(r: (typeof relicPool)[number]): ExportedRelic {
  return {
    id: r.id,
    icon: r.icon,
    name: r.name,
    description: r.description,
    tags: r.tags,
    color: r.color,
    effect: r.effect,
    repeatable: r.repeatable,
    effects: r.effects,
  };
}

function toExportedCharacter(c: (typeof characterCatalog)[number]): ExportedCharacter {
  return {
    id: c.id,
    name: c.name,
    icon: c.icon,
    description: c.description,
    bonusLabel: c.bonusLabel,
    effects: c.effects,
  };
}

function toExportedWeapon(w: (typeof weaponCatalog)[number]): ExportedWeapon {
  return {
    id: w.id,
    name: w.name,
    icon: w.icon,
    description: w.description,
    tags: w.tags,
    effects: w.effects,
  };
}

function toExportedMetaUpgrade(m: (typeof metaUpgradeCatalog)[number]): ExportedMetaUpgrade {
  const costs = Array.from({ length: m.maxLevel }, (_, i) => m.costAt(i + 1));
  return {
    id: m.id,
    kind: m.kind,
    name: m.name,
    description: m.description,
    maxLevel: m.maxLevel,
    costs,
    requirement: m.requirement,
    tag: m.tag,
    weaponId: m.weaponId,
    characterId: m.characterId,
    technologyId: m.technologyId,
    upgradeId: m.upgradeId,
    rarityTier: m.rarityTier,
    baseLevel: m.baseLevel,
    levels: m.levels,
  };
}

function buildPayload() {
  return {
    schemaVersion: 1,
    balance,
    enemySpawnRules,
    upgrades: upgradePool.map(toExportedUpgrade),
    relics: relicPool.map(toExportedRelic),
    fallbackRelic: toExportedRelic(fallbackRelic),
    relicUnlocks: RELIC_UNLOCKS,
    defaultRelicIds: [...DEFAULT_RELIC_IDS],
    metaUpgrades: metaUpgradeCatalog.map(toExportedMetaUpgrade),
    shopItems: shopCatalog,
    characters: characterCatalog.map(toExportedCharacter),
    weapons: weaponCatalog.map(toExportedWeapon),
    bosses: bossCatalog,
    starterTechnologyIds: [...STARTER_TECHNOLOGY_IDS],
    starterBuildTags: [...STARTER_BUILD_TAGS],
  };
}

function serialize(payload: ReturnType<typeof buildPayload>): string {
  return JSON.stringify(payload, null, 2) + "\n";
}

it.skipIf(!RUN && !CHECK)(
  RUN ? "writes data/balance.json" : "checks data/balance.json is up to date",
  () => {
    const payload = buildPayload();
    const content = serialize(payload);
    const outPath = path.join(process.cwd(), "data", "balance.json");

    if (RUN) {
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, content);
      console.log(`balance.json: ${content.length} bytes → ${outPath}`);
      return;
    }

    const onDisk = fs.readFileSync(outPath, "utf8");
    if (onDisk !== content) {
      throw new Error(
        `data/balance.json is out of date — run 'npm run data:export' to regenerate.`,
      );
    }
  },
);

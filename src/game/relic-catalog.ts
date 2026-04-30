import type { Player, Relic, RelicChoice } from "../types";
import { balance } from "./balance";
import { runEffects, type EffectOp } from "./effect-dsl";
import { STARTER_BUILD_TAGS, hasUnlockedTags } from "./shop-catalog";
import type { BuildTag } from "../types";

export const DEFAULT_RELIC_IDS = [
  "rail-focus",
  "reactor-surge",
  "magnetized-map",
  "salvage-plating",
  "emergency-nanites",
] as const;

const RELIC_UNLOCK_IDS: ReadonlyArray<readonly string[]> = [
  ["splitter-matrix"],
  ["drone-contract"],
  ["critical-orbit"],
];

if (RELIC_UNLOCK_IDS.length !== balance.progression.relicUnlockWaves.length) {
  throw new Error(
    `Relic unlock config mismatch: ${balance.progression.relicUnlockWaves.length} waves in balance.progression.relicUnlockWaves vs ${RELIC_UNLOCK_IDS.length} id groups in RELIC_UNLOCK_IDS. Update both together.`,
  );
}

export const RELIC_UNLOCKS = balance.progression.relicUnlockWaves.map((wave, index) => ({
  wave,
  relicIds: RELIC_UNLOCK_IDS[index]!,
}));

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

type RelicSpec = Omit<Relic, "apply"> & { effects: readonly EffectOp[] };

function defineRelic(spec: RelicSpec): Relic {
  return {
    ...spec,
    apply: (target) => runEffects(spec.effects, 1, target),
  };
}

export const relicPool: Relic[] = [
  defineRelic({
    id: "rail-focus",
    icon: "DMG",
    name: "Lentille rail",
    description: "Concentre les impacts de la salve principale.",
    tags: ["cannon"],
    color: "#ff5a69",
    effect: `+${percent(0.22)} degats`,
    effects: [{ type: "addPct", stat: "damage", amount: 0.22, scale: 1 }],
  }),
  defineRelic({
    id: "reactor-surge",
    icon: "Hz",
    name: "Reacteur surcharge",
    description: "Fait monter les canons en frequence instable.",
    tags: ["cannon"],
    color: "#39d9ff",
    effect: `+${percent(0.18)} cadence`,
    effects: [{ type: "addPct", stat: "fireRate", amount: 0.18, scale: 1 }],
  }),
  defineRelic({
    id: "magnetized-map",
    icon: "MAG",
    name: "Carte aimantee",
    description: "Trace les fragments d'XP proches du vaisseau.",
    tags: ["magnet"],
    color: "#72ffb1",
    effect: `+${percent(0.4)} portee de ramassage`,
    effects: [{ type: "addPct", stat: "pickupRadius", amount: 0.4, scale: 1 }],
  }),
  defineRelic({
    id: "salvage-plating",
    icon: "ARM",
    name: "Blindage de recuperation",
    description: "Soude les plaques trouvees sur les epaves.",
    tags: ["shield", "salvage"],
    color: "#ffbf47",
    effect: "+35 integrite max, +35 soin",
    effects: [
      { type: "addMaxHp", amount: 35 },
      { type: "healFlat", amount: 35 },
    ],
  }),
  defineRelic({
    id: "emergency-nanites",
    icon: "NAN",
    name: "Nanites de secours",
    description: "Transforme les eliminations en reparations lentes.",
    tags: ["salvage"],
    color: "#d9f6ff",
    effect: "+1.0 vampire, +40% soin",
    effects: [
      { type: "addLifesteal", amount: 1 },
      { type: "healPct", amount: 0.4 },
    ],
  }),
  defineRelic({
    id: "splitter-matrix",
    icon: "II",
    name: "Matrice separatrice",
    description: "Divise la salve sans destabiliser le noyau.",
    tags: ["cannon", "pierce"],
    color: "#39d9ff",
    effect: "+1 projectile par salve",
    effects: [{ type: "addCapped", stat: "projectileCount", amount: 1, cap: "projectiles" }],
  }),
  defineRelic({
    id: "drone-contract",
    icon: "O",
    name: "Contrat drone",
    description: "Rallie une tourelle autonome au convoi.",
    tags: ["drone"],
    color: "#ffbf47",
    effect: "+1 drone orbital",
    effects: [{ type: "addCapped", stat: "drones", amount: 1, cap: "drones" }],
  }),
  defineRelic({
    id: "critical-orbit",
    icon: "X2",
    name: "Orbite critique",
    description: "Synchronise les tirs sur les failles d'armure.",
    tags: ["crit", "pierce"],
    color: "#ff5af0",
    effect: "+12% critique, +1 penetration",
    effects: [
      { type: "addCappedPct", stat: "critChance", amount: 0.12, cap: "critChance", scale: 1 },
      { type: "addCapped", stat: "pierce", amount: 1, cap: "pierce" },
    ],
  }),
];

export const fallbackRelic: Relic = defineRelic({
  id: "field-repair",
  icon: "HP",
  name: "Reparation de terrain",
  description: "Quand la soute est vide, l'equipage rafistole la coque.",
  tags: ["salvage"],
  color: "#72ffb1",
  effect: "+50% soin",
  repeatable: true,
  effects: [{ type: "healPct", amount: 0.5 }],
});

export function findRelic(id: string): Relic {
  const relic = relicPool.find((item) => item.id === id);
  if (relic) {
    return relic;
  }
  if (fallbackRelic.id !== id) {
    throw new Error(`Unknown relic: ${id}`);
  }
  return fallbackRelic;
}

export function defaultUnlockedRelicIds(): Set<string> {
  return new Set<string>(DEFAULT_RELIC_IDS);
}

export function relicUnlocksForBossWave(wave: number): string[] {
  return RELIC_UNLOCKS.filter((unlock) => wave >= unlock.wave).flatMap(
    (unlock) => unlock.relicIds,
  );
}

export function availableRelicsForRun(
  ownedIds: ReadonlySet<string>,
  unlockedIds: ReadonlySet<string>,
  source: readonly Relic[] = relicPool,
  unlockedTags: ReadonlySet<BuildTag> = new Set(STARTER_BUILD_TAGS),
): Relic[] {
  return source.filter(
    (relic) =>
      unlockedIds.has(relic.id) &&
      !ownedIds.has(relic.id) &&
      hasUnlockedTags(relic.tags, unlockedTags),
  );
}

export function pickChestRelics(
  count: number,
  ownedIds: ReadonlySet<string>,
  unlockedIds: ReadonlySet<string>,
  source: readonly Relic[] = relicPool,
  random: () => number = Math.random,
  unlockedTags: ReadonlySet<BuildTag> = new Set(STARTER_BUILD_TAGS),
): RelicChoice[] {
  const candidates = [...availableRelicsForRun(ownedIds, unlockedIds, source, unlockedTags)];
  for (let i = candidates.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [candidates[i]!, candidates[j]!] = [candidates[j]!, candidates[i]!];
  }

  const selected = candidates.slice(0, count);
  if (selected.length === 0) {
    selected.push(fallbackRelic);
  }

  return selected.map((relic) => ({ relic }));
}

export function applyRelic(relic: Relic, target: Player): void {
  relic.apply(target);
}

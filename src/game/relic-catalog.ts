import type { Player, Relic, RelicChoice } from "../types";
import { balance, recomputeMultiplicativeStats } from "./balance";

export const DEFAULT_RELIC_IDS = [
  "rail-focus",
  "reactor-surge",
  "magnetized-map",
  "salvage-plating",
  "emergency-nanites",
] as const;

export const RELIC_UNLOCKS = [
  { wave: 10, relicIds: ["splitter-matrix"] },
  { wave: 20, relicIds: ["drone-contract"] },
  { wave: 30, relicIds: ["critical-orbit"] },
] as const;

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function addBonus(target: Player, key: keyof Player["bonus"], amount: number): void {
  target.bonus[key] += amount;
  recomputeMultiplicativeStats(target);
}

export const relicPool: Relic[] = [
  {
    id: "rail-focus",
    icon: "DMG",
    name: "Lentille rail",
    description: "Concentre les impacts de la salve principale.",
    color: "#ff5a69",
    effect: `+${percent(0.22)} degats`,
    apply(target) {
      addBonus(target, "damagePct", 0.22);
    },
  },
  {
    id: "reactor-surge",
    icon: "Hz",
    name: "Reacteur surcharge",
    description: "Fait monter les canons en frequence instable.",
    color: "#39d9ff",
    effect: `+${percent(0.18)} cadence`,
    apply(target) {
      addBonus(target, "fireRatePct", 0.18);
    },
  },
  {
    id: "magnetized-map",
    icon: "MAG",
    name: "Carte aimantee",
    description: "Trace les fragments d'XP proches du vaisseau.",
    color: "#72ffb1",
    effect: `+${percent(0.4)} portee de ramassage`,
    apply(target) {
      addBonus(target, "pickupRadiusPct", 0.4);
    },
  },
  {
    id: "salvage-plating",
    icon: "ARM",
    name: "Blindage de recuperation",
    description: "Soude les plaques trouvees sur les epaves.",
    color: "#ffbf47",
    effect: "+35 integrite max, +35 soin",
    apply(target) {
      target.maxHp += 35;
      target.hp = Math.min(target.maxHp, target.hp + 35);
    },
  },
  {
    id: "emergency-nanites",
    icon: "NAN",
    name: "Nanites de secours",
    description: "Transforme les eliminations en reparations lentes.",
    color: "#d9f6ff",
    effect: "+1.0 vampire, +40% soin",
    apply(target) {
      target.lifesteal += 1;
      target.hp = Math.min(target.maxHp, target.hp + target.maxHp * 0.4);
    },
  },
  {
    id: "splitter-matrix",
    icon: "II",
    name: "Matrice separatrice",
    description: "Divise la salve sans destabiliser le noyau.",
    color: "#39d9ff",
    effect: "+1 projectile par salve",
    apply(target) {
      target.projectileCount = Math.min(
        balance.upgrade.caps.projectiles,
        target.projectileCount + 1,
      );
    },
  },
  {
    id: "drone-contract",
    icon: "O",
    name: "Contrat drone",
    description: "Rallie une tourelle autonome au convoi.",
    color: "#ffbf47",
    effect: "+1 drone orbital",
    apply(target) {
      target.drones = Math.min(balance.upgrade.caps.drones, target.drones + 1);
    },
  },
  {
    id: "critical-orbit",
    icon: "X2",
    name: "Orbite critique",
    description: "Synchronise les tirs sur les failles d'armure.",
    color: "#ff5af0",
    effect: "+12% critique, +1 penetration",
    apply(target) {
      target.critChance = Math.min(balance.upgrade.caps.critChance, target.critChance + 0.12);
      target.pierce = Math.min(balance.upgrade.caps.pierce, target.pierce + 1);
    },
  },
];

export const fallbackRelic: Relic = {
  id: "field-repair",
  icon: "HP",
  name: "Reparation de terrain",
  description: "Quand la soute est vide, l'equipage rafistole la coque.",
  color: "#72ffb1",
  effect: "+50% soin",
  repeatable: true,
  apply(target) {
    target.hp = Math.min(target.maxHp, target.hp + target.maxHp * 0.5);
  },
};

export function findRelic(id: string): Relic {
  const relic = relicPool.find((item) => item.id === id);
  if (!relic) {
    throw new Error(`Unknown relic: ${id}`);
  }
  return relic;
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
): Relic[] {
  return source.filter((relic) => unlockedIds.has(relic.id) && !ownedIds.has(relic.id));
}

export function pickChestRelics(
  count: number,
  ownedIds: ReadonlySet<string>,
  unlockedIds: ReadonlySet<string>,
  source: readonly Relic[] = relicPool,
  random: () => number = Math.random,
): RelicChoice[] {
  const candidates = [...availableRelicsForRun(ownedIds, unlockedIds, source)];
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

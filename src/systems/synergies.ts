import type {
  BuildTag,
  OwnedRelic,
  OwnedUpgrade,
  Player,
  PlayerTraits,
  SynergyDefinition,
} from "../types";

export type SynergyHintState = "complete" | "advance" | "active";

export interface SynergyHint {
  id: SynergyDefinition["id"];
  name: string;
  color: string;
  state: SynergyHintState;
  missingTags: BuildTag[];
}

export const BUILD_TAG_META: Record<BuildTag, { label: string; color: string }> = {
  cannon: { label: "Canon", color: "#39d9ff" },
  crit: { label: "Crit", color: "#ff5af0" },
  pierce: { label: "Pierce", color: "#d9f6ff" },
  drone: { label: "Drone", color: "#ffbf47" },
  shield: { label: "Shield", color: "#72ffb1" },
  magnet: { label: "Aimant", color: "#6ee7ff" },
  salvage: { label: "Salvage", color: "#fff0b8" },
};

export const SYNERGY_DEFINITIONS: readonly SynergyDefinition[] = [
  {
    id: "rail-splitter",
    name: "Rail Splitter",
    description: "Les tirs principaux ricochent vers une cible proche.",
    color: "#ff5af0",
    requiredTags: { cannon: 1, crit: 1, pierce: 1 },
    apply(traits) {
      traits.railSplitter = true;
    },
  },
  {
    id: "drone-swarm",
    name: "Drone Swarm",
    description: "Les drones tirent plus vite et percent une cible en plus.",
    color: "#ffbf47",
    requiredTags: { drone: 1, cannon: 1 },
    apply(traits) {
      traits.droneSwarm = true;
    },
  },
  {
    id: "kinetic-ram",
    name: "Kinetic Ram",
    description: "Le bouclier charge les collisions a haute vitesse.",
    color: "#72ffb1",
    requiredTags: { shield: 1, salvage: 1 },
    apply(traits) {
      traits.kineticRam = true;
    },
    reset(target) {
      target.ramTimer = 0;
    },
  },
  {
    id: "magnet-storm",
    name: "Magnet Storm",
    description: "Les gros ramassages d'XP declenchent une nova.",
    color: "#39d9ff",
    requiredTags: { magnet: 2 },
    apply(traits) {
      traits.magnetStorm = true;
    },
    reset(target) {
      target.magnetStormCharge = 0;
      target.magnetStormTimer = 0;
    },
  },
];

export function createPlayerTraits(): PlayerTraits {
  return {
    railSplitter: false,
    droneSwarm: false,
    kineticRam: false,
    magnetStorm: false,
  };
}

export function buildTagCountsFromLoadout(
  upgrades: Iterable<OwnedUpgrade>,
  relics: Iterable<OwnedRelic>,
): Map<BuildTag, number> {
  const counts = new Map<BuildTag, number>();

  for (const owned of upgrades) {
    addTags(counts, owned.upgrade.tags, owned.count);
  }
  for (const owned of relics) {
    addTags(counts, owned.relic.tags, owned.count);
  }

  return counts;
}

export function activeSynergiesFromTagCounts(
  counts: ReadonlyMap<BuildTag, number>,
): SynergyDefinition[] {
  return SYNERGY_DEFINITIONS.filter((definition) => {
    for (const tag of Object.keys(definition.requiredTags) as BuildTag[]) {
      if ((counts.get(tag) ?? 0) < (definition.requiredTags[tag] ?? 0)) {
        return false;
      }
    }
    return true;
  });
}

export function activeSynergiesForLoadout(
  upgrades: Iterable<OwnedUpgrade>,
  relics: Iterable<OwnedRelic>,
): SynergyDefinition[] {
  return activeSynergiesFromTagCounts(buildTagCountsFromLoadout(upgrades, relics));
}

export function synergyHintsForTags(
  tags: readonly BuildTag[],
  counts: ReadonlyMap<BuildTag, number>,
): SynergyHint[] {
  const nextCounts = new Map(counts);
  for (const tag of tags) {
    nextCounts.set(tag, (nextCounts.get(tag) ?? 0) + 1);
  }

  const hints: SynergyHint[] = [];
  for (const synergy of SYNERGY_DEFINITIONS) {
    const requiredTags = Object.keys(synergy.requiredTags) as BuildTag[];
    if (!requiredTags.some((tag) => tags.includes(tag))) continue;

    const activeBefore = hasSynergyRequirements(synergy, counts);
    const activeAfter = hasSynergyRequirements(synergy, nextCounts);
    const missingTags = requiredTags.filter(
      (tag) => (counts.get(tag) ?? 0) < (synergy.requiredTags[tag] ?? 0),
    );
    const fillsMissingTag = missingTags.some((tag) => tags.includes(tag));
    if (activeAfter && !activeBefore) {
      hints.push({
        id: synergy.id,
        name: synergy.name,
        color: synergy.color,
        state: "complete",
        missingTags: [],
      });
      continue;
    }
    if (fillsMissingTag) {
      hints.push({
        id: synergy.id,
        name: synergy.name,
        color: synergy.color,
        state: "advance",
        missingTags: requiredTags.filter(
          (tag) => (nextCounts.get(tag) ?? 0) < (synergy.requiredTags[tag] ?? 0),
        ),
      });
      continue;
    }
    if (activeBefore) {
      hints.push({
        id: synergy.id,
        name: synergy.name,
        color: synergy.color,
        state: "active",
        missingTags: [],
      });
    }
  }

  return hints.sort(
    (a, b) => synergyHintRank(a.state) - synergyHintRank(b.state),
  );
}

function hasSynergyRequirements(
  synergy: SynergyDefinition,
  counts: ReadonlyMap<BuildTag, number>,
): boolean {
  for (const tag of Object.keys(synergy.requiredTags) as BuildTag[]) {
    if ((counts.get(tag) ?? 0) < (synergy.requiredTags[tag] ?? 0)) {
      return false;
    }
  }
  return true;
}

function synergyHintRank(state: SynergyHintState): number {
  switch (state) {
    case "complete":
      return 0;
    case "advance":
      return 1;
    case "active":
      return 2;
  }
}

export function ownedBuildTags(
  upgrades: Iterable<OwnedUpgrade>,
  relics: Iterable<OwnedRelic>,
): Set<BuildTag> {
  return new Set(buildTagCountsFromLoadout(upgrades, relics).keys());
}

export function tagsIntersect(tags: readonly BuildTag[], targetTags: ReadonlySet<BuildTag>): boolean {
  return tags.some((tag) => targetTags.has(tag));
}

export function refreshPlayerTraits(
  target: Player,
  upgrades: Iterable<OwnedUpgrade>,
  relics: Iterable<OwnedRelic>,
): SynergyDefinition[] {
  const active = activeSynergiesForLoadout(upgrades, relics);
  const activeIds = new Set(active.map((synergy) => synergy.id));
  const next = createPlayerTraits();

  for (const synergy of active) {
    synergy.apply(next);
  }

  target.traits = next;

  for (const definition of SYNERGY_DEFINITIONS) {
    if (!activeIds.has(definition.id)) {
      definition.reset?.(target);
    }
  }

  return active;
}

function addTags(
  counts: Map<BuildTag, number>,
  tags: readonly BuildTag[],
  count: number,
): void {
  for (const tag of tags) {
    counts.set(tag, (counts.get(tag) ?? 0) + Math.max(1, count));
  }
}

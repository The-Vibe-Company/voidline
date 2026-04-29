import type {
  BuildTag,
  OwnedRelic,
  OwnedUpgrade,
  Player,
  PlayerTraits,
  SynergyDefinition,
} from "../types";

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
  },
  {
    id: "drone-swarm",
    name: "Drone Swarm",
    description: "Les drones tirent plus vite et percent une cible en plus.",
    color: "#ffbf47",
    requiredTags: { drone: 1, cannon: 1 },
  },
  {
    id: "kinetic-ram",
    name: "Kinetic Ram",
    description: "Le bouclier charge les collisions a haute vitesse.",
    color: "#72ffb1",
    requiredTags: { shield: 1, salvage: 1 },
  },
  {
    id: "magnet-storm",
    name: "Magnet Storm",
    description: "Les gros ramassages d'XP declenchent une nova.",
    color: "#39d9ff",
    requiredTags: { magnet: 2 },
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
  const next = createPlayerTraits();

  for (const synergy of active) {
    switch (synergy.id) {
      case "rail-splitter":
        next.railSplitter = true;
        break;
      case "drone-swarm":
        next.droneSwarm = true;
        break;
      case "kinetic-ram":
        next.kineticRam = true;
        break;
      case "magnet-storm":
        next.magnetStorm = true;
        break;
    }
  }

  target.traits = next;
  if (!next.kineticRam) {
    target.ramTimer = 0;
  }
  if (!next.magnetStorm) {
    target.magnetStormCharge = 0;
    target.magnetStormTimer = 0;
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

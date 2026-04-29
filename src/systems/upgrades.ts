import { ownedRelics, ownedUpgrades, player, state } from "../state";
import { pulseText } from "../entities/particles";
import { shuffle } from "../utils";
import { selectUpgradeTier } from "../game/balance";
import { availableUpgradesForPlayer } from "../game/upgrade-catalog";
import type { BuildTag, Upgrade, UpgradeChoice, UpgradeTier } from "../types";
import { markLoadoutDirty } from "../simulation/events";
import { random } from "../simulation/random";
import {
  buildTagCountsFromLoadout,
  refreshPlayerTraits,
  SYNERGY_DEFINITIONS,
  tagsIntersect,
} from "./synergies";

export function rollUpgradeTier(wave: number): UpgradeTier {
  return selectUpgradeTier(wave, random());
}

export function pickUpgrades(count: number): UpgradeChoice[] {
  const candidates = availableUpgradesForPlayer(player);
  const buildTagCounts = buildTagCountsFromLoadout(ownedUpgrades.values(), ownedRelics.values());
  const upgrades = pickUpgradeDraft(candidates, count, buildTagCounts);

  return upgrades.map((upgrade) => ({
    upgrade,
    tier: rollUpgradeTier(state.wave),
  }));
}

export function pickUpgradeDraft(
  candidates: Upgrade[],
  count: number,
  buildTagCounts: ReadonlyMap<BuildTag, number>,
): Upgrade[] {
  if (count <= 0) return [];
  const remaining = [...candidates];
  shuffle(remaining);
  const picked = remaining.splice(0, count);
  const buildTags = new Set(buildTagCounts.keys());

  if (buildTags.size > 0) {
    ensureDraftContains(
      picked,
      remaining,
      (upgrade) => advancesPartiallyBuiltSynergy(upgrade.tags, buildTagCounts),
      buildTags,
    );
    ensureDraftContains(
      picked,
      remaining,
      (upgrade) => tagsIntersect(upgrade.tags, buildTags),
      buildTags,
    );
    if (!picked.some((upgrade) => !tagsIntersect(upgrade.tags, buildTags))) {
      ensureDraftContains(
        picked,
        remaining,
        (upgrade) => !tagsIntersect(upgrade.tags, buildTags),
        buildTags,
      );
    }
  }

  return picked;
}

export function applyUpgrade(choice: UpgradeChoice): void {
  const { upgrade, tier } = choice;
  upgrade.apply(tier, player);

  const key = `${upgrade.id}:${tier.id}`;
  const owned = ownedUpgrades.get(key) ?? { upgrade, tier, count: 0 };
  owned.count += 1;
  ownedUpgrades.set(key, owned);

  refreshPlayerTraits(player, ownedUpgrades.values(), ownedRelics.values());
  pulseText(player.x, player.y - 42, `${upgrade.name} ${tier.short}`, tier.color);
  state.pendingUpgrades = Math.max(0, state.pendingUpgrades - 1);
  markLoadoutDirty();
}

function ensureDraftContains(
  picked: Upgrade[],
  remaining: Upgrade[],
  predicate: (upgrade: Upgrade) => boolean,
  buildTags: ReadonlySet<BuildTag>,
): void {
  if (picked.some(predicate)) return;
  const replacementIndex = remaining.findIndex(predicate);
  if (replacementIndex < 0 || picked.length === 0) return;

  const replacement = remaining.splice(replacementIndex, 1)[0]!;
  const replaceAt = replacementSlot(picked, buildTags);
  remaining.push(picked[replaceAt]!);
  picked[replaceAt] = replacement;
}

function replacementSlot(picked: Upgrade[], buildTags: ReadonlySet<BuildTag>): number {
  const supportCount = picked.filter((upgrade) => tagsIntersect(upgrade.tags, buildTags)).length;
  if (supportCount > 1) {
    for (let index = picked.length - 1; index >= 0; index -= 1) {
      if (tagsIntersect(picked[index]!.tags, buildTags)) return index;
    }
  }
  return picked.length - 1;
}

function advancesPartiallyBuiltSynergy(
  tags: readonly BuildTag[],
  buildTagCounts: ReadonlyMap<BuildTag, number>,
): boolean {
  for (const synergy of SYNERGY_DEFINITIONS) {
    const required = Object.keys(synergy.requiredTags) as BuildTag[];
    const hasCurrentProgress = required.some((tag) => (buildTagCounts.get(tag) ?? 0) > 0);
    const hasMissingRequirement = required.some(
      (tag) => (buildTagCounts.get(tag) ?? 0) < (synergy.requiredTags[tag] ?? 0),
    );
    const fillsMissingRequirement = required.some(
      (tag) =>
        (buildTagCounts.get(tag) ?? 0) < (synergy.requiredTags[tag] ?? 0) &&
        tags.includes(tag),
    );
    if (hasCurrentProgress && hasMissingRequirement && fillsMissingRequirement) return true;
  }
  return false;
}

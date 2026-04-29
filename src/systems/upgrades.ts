import { ownedUpgrades, player, state } from "../state";
import { pulseText } from "../entities/particles";
import { shuffle } from "../utils";
import { selectUpgradeTier } from "../game/balance";
import { availableUpgradesForPlayer } from "../game/upgrade-catalog";
import type { UpgradeChoice, UpgradeTier } from "../types";
import { markLoadoutDirty } from "../simulation/events";
import { random } from "../simulation/random";

export function rollUpgradeTier(wave: number): UpgradeTier {
  return selectUpgradeTier(wave, random());
}

export function pickUpgrades(count: number): UpgradeChoice[] {
  const weighted = availableUpgradesForPlayer(player);
  shuffle(weighted);
  return weighted.slice(0, count).map((upgrade) => ({
    upgrade,
    tier: rollUpgradeTier(state.wave),
  }));
}

export function applyUpgrade(choice: UpgradeChoice): void {
  const { upgrade, tier } = choice;
  upgrade.apply(tier, player);

  const key = `${upgrade.id}:${tier.id}`;
  const owned = ownedUpgrades.get(key) ?? { upgrade, tier, count: 0 };
  owned.count += 1;
  ownedUpgrades.set(key, owned);

  pulseText(player.x, player.y - 42, `${upgrade.name} ${tier.short}`, tier.color);
  state.pendingUpgrades = Math.max(0, state.pendingUpgrades - 1);
  markLoadoutDirty();
}

import { player } from "../state";
import { applyUpgradeToPlayer, findUpgrade } from "../game/upgrade-catalog";

export function applyOwnedUpgrade(id: string): void {
  applyUpgradeToPlayer(findUpgrade(id), player);
}

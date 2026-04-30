import type { UpgradeChoice } from "../types";
import { markLoadoutDirty } from "../simulation/events";
import { applyRustUpgrade, draftRustUpgrades } from "../simulation/rust-engine";

export function pickUpgrades(count: number): UpgradeChoice[] {
  return draftRustUpgrades(count);
}

export function applyUpgrade(choice: UpgradeChoice): void {
  applyRustUpgrade(choice);
  markLoadoutDirty();
}

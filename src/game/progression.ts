import { player, state } from "../state";
import { pulseText } from "../entities/particles";
import { xpToNextLevel } from "./balance";
import { markHudDirty, markUpgradeReady } from "../simulation/events";
import { recordChallengeProgress } from "../systems/challenges";

export function collectExperience(amount: number): void {
  state.xp += amount;
  state.score += amount * 3;
  recordChallengeProgress("bestScore", state.score);
  pulseText(player.x, player.y - 34, `+${amount} XP`, "#72ffb1");
  markHudDirty();

  while (state.xp >= state.xpTarget) {
    state.xp -= state.xpTarget;
    state.level += 1;
    state.xpTarget = xpToNextLevel(state.level);
    state.pendingUpgrades += 1;
    recordChallengeProgress("bestLevel", state.level);
    pulseText(player.x, player.y - 58, `Niveau ${state.level}`, "#ffbf47");
    markUpgradeReady();
  }
}

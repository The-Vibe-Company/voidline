import { player, state } from "../state";
import { pulseText } from "../entities/particles";
import { showUpgrade, updateHud } from "../render/hud";
import { xpToNextLevel } from "./balance";

export function collectExperience(amount: number): void {
  state.xp += amount;
  state.score += amount * 3;
  pulseText(player.x, player.y - 34, `+${amount} XP`, "#72ffb1");

  while (state.xp >= state.xpTarget) {
    state.xp -= state.xpTarget;
    state.level += 1;
    state.xpTarget = xpToNextLevel(state.level);
    state.pendingUpgrades += 1;
    pulseText(player.x, player.y - 58, `Niveau ${state.level}`, "#ffbf47");
  }

  updateHud();
  if (state.pendingUpgrades > 0 && state.mode === "playing") {
    showUpgrade();
  }
}

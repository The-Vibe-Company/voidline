import type { Character, CharacterId, Player } from "../types";
import { recomputeMultiplicativeStats } from "./balance";

export const characterCatalog: readonly Character[] = [
  {
    id: "pilot",
    name: "Pilot",
    icon: "PIL",
    description: "Profil neutre, stable pour apprendre les builds.",
    bonusLabel: "Base standard",
    apply() {
      // Baseline ship state already represents the pilot.
    },
  },
  {
    id: "runner",
    name: "Runner",
    icon: "RUN",
    description: "Plus rapide et meilleur ramassage, mais coque fragile.",
    bonusLabel: "+22% vitesse, +14% aimant, -18 PV",
    apply(target) {
      target.maxHp = Math.max(1, target.maxHp - 18);
      target.hp = Math.min(target.hp, target.maxHp);
      target.bonus.speedPct += 0.22;
      target.bonus.pickupRadiusPct += 0.14;
      recomputeMultiplicativeStats(target);
    },
  },
  {
    id: "tank",
    name: "Tank",
    icon: "TNK",
    description: "Coque lourde et bouclier de depart, cadence un peu basse.",
    bonusLabel: "+42 PV, +26 bouclier, -14% vitesse",
    apply(target) {
      target.maxHp += 42;
      target.hp += 42;
      target.shieldMax += 26;
      target.shield += 26;
      target.shieldRegen += 1.6;
      target.bonus.speedPct -= 0.14;
      target.bonus.fireRatePct -= 0.06;
      recomputeMultiplicativeStats(target);
    },
  },
];

export function findCharacter(id: CharacterId): Character {
  const character = characterCatalog.find((candidate) => candidate.id === id);
  if (!character) {
    throw new Error(`Unknown character: ${id}`);
  }
  return character;
}

export function applyCharacter(id: CharacterId, target: Player): void {
  findCharacter(id).apply(target);
}

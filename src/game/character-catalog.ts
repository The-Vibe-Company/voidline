import type { Character, CharacterId, Player } from "../types";
import { runEffects, type EffectOp } from "./effect-dsl";

type CharacterSpec = Omit<Character, "apply"> & { effects: readonly EffectOp[] };

function defineCharacter(spec: CharacterSpec): Character {
  return {
    ...spec,
    apply: (target) => runEffects(spec.effects, 1, target),
  };
}

export const characterCatalog: readonly Character[] = [
  defineCharacter({
    id: "pilot",
    name: "Pilot",
    icon: "PIL",
    description: "Profil neutre, stable pour apprendre les builds.",
    bonusLabel: "Base standard",
    effects: [],
  }),
  defineCharacter({
    id: "runner",
    name: "Runner",
    icon: "RUN",
    description: "Plus rapide et meilleur ramassage, mais coque fragile.",
    bonusLabel: "+22% vitesse, +14% aimant, -18 PV",
    effects: [
      { type: "addMaxHp", amount: -18 },
      { type: "addPct", stat: "speed", amount: 0.22, scale: 1 },
      { type: "addPct", stat: "pickupRadius", amount: 0.14, scale: 1 },
    ],
  }),
  defineCharacter({
    id: "tank",
    name: "Tank",
    icon: "TNK",
    description: "Coque lourde et bouclier de depart, cadence un peu basse.",
    bonusLabel: "+42 PV, +26 bouclier, -14% vitesse",
    effects: [
      { type: "addMaxHp", amount: 42 },
      { type: "healFlat", amount: 42 },
      { type: "shieldGrant", shield: 26, regen: 1.6, scale: 1 },
      { type: "addPct", stat: "speed", amount: -0.14, scale: 1 },
      { type: "addPct", stat: "fireRate", amount: -0.06, scale: 1 },
    ],
  }),
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

import {
  enemies,
  experienceOrbs,
  player,
  powerupOrbs,
  state,
  world,
} from "../state";
import type { EnemyEntity, PowerupKind, PowerupVariant } from "../types";
import { burst, pulseText } from "./particles";
import { killEnemy } from "./enemies";
import { balance } from "../game/balance";
import { markHudDirty } from "../simulation/events";
import { acquirePowerupOrb, releasePowerupOrb } from "../simulation/pools";
import { random } from "../simulation/random";

export const POWERUP_VARIANTS: PowerupVariant[] = [
  {
    id: "heart",
    label: "COEUR",
    description: "Soigne 50% des PV max",
    color: "#ff5a69",
    accent: "#ffd0d5",
    rarity: 4,
  },
  {
    id: "magnet",
    label: "AIMANT",
    description: "Attire les XP deja presents",
    color: "#39d9ff",
    accent: "#d9f6ff",
    rarity: 4,
  },
  {
    id: "bomb",
    label: "BOMBE",
    description: "Detruit tous les ennemis presents",
    color: "#ffbf47",
    accent: "#fff0b8",
    rarity: 3,
  },
];

const VARIANT_BY_KIND = new Map<PowerupKind, PowerupVariant>(
  POWERUP_VARIANTS.map((v) => [v.id, v]),
);

export function getVariant(kind: PowerupKind): PowerupVariant {
  return VARIANT_BY_KIND.get(kind)!;
}

let suppressDrops = false;

function pickVariant(): PowerupVariant {
  let total = 0;
  for (const v of POWERUP_VARIANTS) total += v.rarity;
  let roll = random() * total;
  for (const v of POWERUP_VARIANTS) {
    roll -= v.rarity;
    if (roll <= 0) return v;
  }
  return POWERUP_VARIANTS[0]!;
}

export function maybeDropPowerup(enemy: EnemyEntity): void {
  if (suppressDrops) return;
  if (random() > balance.powerups.dropChance[enemy.kind]) return;
  const variant = pickVariant();
  const angle = random() * Math.PI * 2;
  const speed = 80 + random() * 80;
  const orb = acquirePowerupOrb(variant.id);
  orb.x = enemy.x;
  orb.y = enemy.y;
  orb.vx = Math.cos(angle) * speed;
  orb.vy = Math.sin(angle) * speed;
  orb.radius = 13;
  orb.age = 0;
  orb.life = 16;
}

export function applyPowerup(kind: PowerupKind): void {
  switch (kind) {
    case "heart":
      player.hp = Math.min(player.maxHp, player.hp + player.maxHp * balance.powerups.heartHealRatio);
      state.heartsCarried += 1;
      break;
    case "magnet":
      for (const orb of experienceOrbs) {
        orb.magnetized = true;
      }
      state.magnetsCarried += 1;
      break;
    case "bomb":
      detonateBomb();
      state.bombsCarried += 1;
      break;
  }
  markHudDirty();
}

export function updatePowerups(dt: number): void {
  const pullRadius = balance.powerups.pullRadius;
  const pullRadiusSq = pullRadius * pullRadius;
  const damp = 1 - dt * balance.powerups.velocityDamping;
  for (let i = powerupOrbs.length - 1; i >= 0; i -= 1) {
    const orb = powerupOrbs[i]!;
    orb.age += dt;
    orb.life -= dt;
    orb.x += orb.vx * dt;
    orb.y += orb.vy * dt;
    orb.vx *= damp;
    orb.vy *= damp;

    const dx = player.x - orb.x;
    const dy = player.y - orb.y;
    const distSq = dx * dx + dy * dy;
    const pickupRadius = player.radius + orb.radius + 6;

    if (distSq < pickupRadius * pickupRadius) {
      const variant = getVariant(orb.kind);
      applyPowerup(orb.kind);
      burst(orb.x, orb.y, variant.color, 22, 240);
      pulseText(orb.x, orb.y - 22, variant.label, variant.accent);
      if (orb.kind !== "bomb") {
        world.shake = Math.min(14, world.shake + 4);
      }
      releasePowerupOrb(i);
      continue;
    }

    if (distSq < pullRadiusSq) {
      const distance = Math.sqrt(distSq);
      const pull = (1 - distance / pullRadius) * balance.powerups.pullStrength;
      const inv = 1 / Math.max(1, distance);
      orb.vx += dx * inv * pull * dt;
      orb.vy += dy * inv * pull * dt;
    }

    if (orb.life <= 0) {
      releasePowerupOrb(i);
    }
  }
}

function detonateBomb(): void {
  burst(player.x, player.y, "#ffbf47", 60, 420);
  pulseText(player.x, player.y - 30, "BOOM TOTAL", "#ffbf47");
  suppressDrops = true;
  try {
    for (let i = enemies.length - 1; i >= 0; i -= 1) {
      killEnemy(i);
    }
  } finally {
    suppressDrops = false;
  }
  world.shake = Math.min(28, world.shake + 22);
}

export function resetPowerups(): void {
  powerupOrbs.length = 0;
  state.heartsCarried = 0;
  state.magnetsCarried = 0;
  state.bombsCarried = 0;
}

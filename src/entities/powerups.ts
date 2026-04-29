import {
  enemies,
  player,
  powerupOrbs,
  state,
  world,
} from "../state";
import type { EnemyEntity, PowerupKind, PowerupVariant } from "../types";
import { burst, pulseText } from "./particles";
import { killEnemy } from "./enemies";

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
    description: "Attire les XP de toute la map",
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

const DROP_CHANCE: Record<EnemyEntity["kind"], number> = {
  scout: 0.012,
  hunter: 0.03,
  brute: 0.09,
};

const HEART_HEAL_RATIO = 0.5;

let suppressDrops = false;

function pickVariant(): PowerupVariant {
  let total = 0;
  for (const v of POWERUP_VARIANTS) total += v.rarity;
  let roll = Math.random() * total;
  for (const v of POWERUP_VARIANTS) {
    roll -= v.rarity;
    if (roll <= 0) return v;
  }
  return POWERUP_VARIANTS[0]!;
}

export function maybeDropPowerup(enemy: EnemyEntity): void {
  if (suppressDrops) return;
  if (Math.random() > DROP_CHANCE[enemy.kind]) return;
  const variant = pickVariant();
  const angle = Math.random() * Math.PI * 2;
  const speed = 80 + Math.random() * 80;
  powerupOrbs.push({
    x: enemy.x,
    y: enemy.y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    radius: 13,
    kind: variant.id,
    age: 0,
    life: 16,
  });
}

export function applyPowerup(kind: PowerupKind): void {
  switch (kind) {
    case "heart":
      player.hp = Math.min(player.maxHp, player.hp + player.maxHp * HEART_HEAL_RATIO);
      state.heartsCarried += 1;
      break;
    case "magnet":
      state.magnetRadius = Number.POSITIVE_INFINITY;
      state.magnetsCarried += 1;
      break;
    case "bomb":
      detonateBomb();
      state.bombsCarried += 1;
      break;
  }
}

const POWERUP_PULL_RADIUS = 70;
const POWERUP_PULL_RADIUS_SQ = POWERUP_PULL_RADIUS * POWERUP_PULL_RADIUS;

export function updatePowerups(dt: number): void {
  const damp = 1 - dt * 1.6;
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
      powerupOrbs.splice(i, 1);
      continue;
    }

    if (distSq < POWERUP_PULL_RADIUS_SQ) {
      const distance = Math.sqrt(distSq);
      const pull = (1 - distance / POWERUP_PULL_RADIUS) * 380;
      const inv = 1 / Math.max(1, distance);
      orb.vx += dx * inv * pull * dt;
      orb.vy += dy * inv * pull * dt;
    }

    if (orb.life <= 0) {
      powerupOrbs.splice(i, 1);
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
  state.magnetRadius = 0;
  state.heartsCarried = 0;
  state.magnetsCarried = 0;
  state.bombsCarried = 0;
}

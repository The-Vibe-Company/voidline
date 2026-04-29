import { balance } from "../game/balance";
import type { ExperienceOrb, Player } from "../types";

const MAGNETIZED_PULL = 560;
const MAGNETIZED_CONTACT_PADDING = 8;

export function pickupRadiusFor(target: Player): number {
  return balance.xp.pickupBaseRadius * target.pickupRadius;
}

export function shouldCollectOrb(orb: ExperienceOrb, target: Player, dt: number): boolean {
  const dx = target.x - orb.x;
  const dy = target.y - orb.y;
  const distSq = dx * dx + dy * dy;

  if (orb.magnetized) {
    const distance = Math.sqrt(distSq);
    const inv = 1 / Math.max(1, distance);
    orb.vx += dx * inv * MAGNETIZED_PULL * dt;
    orb.vy += dy * inv * MAGNETIZED_PULL * dt;
    const contact = target.radius + orb.radius + MAGNETIZED_CONTACT_PADDING;
    return distSq < contact * contact;
  }

  const pickupRadius = pickupRadiusFor(target);
  return distSq < pickupRadius * pickupRadius;
}

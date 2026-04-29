import { balance } from "../game/balance";
import type { ExperienceOrb, Player } from "../types";

const MAGNETIZED_PULL = 560;
const MAGNETIZED_CONTACT_PADDING = 8;

export function shouldCollectOrb(orb: ExperienceOrb, target: Player, dt: number): boolean {
  const dx = target.x - orb.x;
  const dy = target.y - orb.y;
  const distance = Math.hypot(dx, dy);

  if (orb.magnetized) {
    orb.vx += (dx / Math.max(1, distance)) * MAGNETIZED_PULL * dt;
    orb.vy += (dy / Math.max(1, distance)) * MAGNETIZED_PULL * dt;
    return distance < target.radius + orb.radius + MAGNETIZED_CONTACT_PADDING;
  }

  const pickupRadius = balance.xp.pickupBaseRadius * target.pickupRadius;
  return distance < pickupRadius;
}

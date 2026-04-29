import { experienceOrbs, player, state } from "../state";
import { collectExperience } from "../game/progression";
import { spark } from "./particles";
import {
  balance,
  experienceDropTotal,
  experienceOrbRadius,
  experienceShardCount,
} from "../game/balance";
import type { EnemyEntity } from "../types";

export function spawnExperience(enemy: EnemyEntity): void {
  const total = experienceDropTotal(enemy.score, state.wave);
  const shardCount = experienceShardCount(enemy.kind);
  let remaining = total;

  for (let i = 0; i < shardCount; i += 1) {
    const value = i === shardCount - 1 ? remaining : Math.max(1, Math.round(total / shardCount));
    remaining -= value;
    const angle = Math.random() * Math.PI * 2;
    const speed = 70 + Math.random() * 120;
    experienceOrbs.push({
      x: enemy.x,
      y: enemy.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: experienceOrbRadius(value),
      value,
      age: Math.random() * 0.4,
    });
  }
}

export function updateExperience(dt: number): void {
  for (let i = experienceOrbs.length - 1; i >= 0; i -= 1) {
    const orb = experienceOrbs[i]!;
    orb.age += dt;
    orb.x += orb.vx * dt;
    orb.y += orb.vy * dt;
    orb.vx *= 1 - dt * 2.7;
    orb.vy *= 1 - dt * 2.7;

    const dx = player.x - orb.x;
    const dy = player.y - orb.y;
    const distance = Math.hypot(dx, dy);
    const pickupRadius = balance.xp.pickupBaseRadius * player.pickupRadius + state.magnetRadius;
    if (distance < pickupRadius) {
      const pull = (1 - distance / pickupRadius) * 560;
      orb.vx += (dx / Math.max(1, distance)) * pull * dt;
      orb.vy += (dy / Math.max(1, distance)) * pull * dt;
    }

    if (distance < player.radius + orb.radius + 8) {
      collectExperience(orb.value);
      spark(orb.x, orb.y, "#72ffb1");
      experienceOrbs.splice(i, 1);
    }
  }
}

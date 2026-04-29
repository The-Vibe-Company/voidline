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

const MAGNET_ACCEL = 1400;
const MAGNET_DAMP = 4.2;

export function updateExperience(dt: number): void {
  const infiniteMagnet = state.magnetRadius === Number.POSITIVE_INFINITY;
  const baseRadius = balance.xp.pickupBaseRadius * player.pickupRadius;
  const finiteRadius = baseRadius + state.magnetRadius;
  const finiteRadiusSq = finiteRadius * finiteRadius;
  const pickupCutoff = player.radius + 8;
  const damp = 1 - dt * 2.7;

  for (let i = experienceOrbs.length - 1; i >= 0; i -= 1) {
    const orb = experienceOrbs[i]!;
    orb.age += dt;
    orb.x += orb.vx * dt;
    orb.y += orb.vy * dt;
    orb.vx *= damp;
    orb.vy *= damp;

    const dx = player.x - orb.x;
    const dy = player.y - orb.y;
    const distSq = dx * dx + dy * dy;
    const pickupRadius = pickupCutoff + orb.radius;

    if (distSq < pickupRadius * pickupRadius) {
      collectExperience(orb.value);
      spark(orb.x, orb.y, "#72ffb1");
      experienceOrbs.splice(i, 1);
      continue;
    }

    if (infiniteMagnet) {
      orb.vx += dx * MAGNET_ACCEL * dt * 0.001;
      orb.vy += dy * MAGNET_ACCEL * dt * 0.001;
      orb.vx -= orb.vx * MAGNET_DAMP * dt * 0.18;
      orb.vy -= orb.vy * MAGNET_DAMP * dt * 0.18;
    } else if (distSq < finiteRadiusSq) {
      const distance = Math.sqrt(distSq);
      const pull = (1 - distance / finiteRadius) * 560;
      const inv = 1 / Math.max(1, distance);
      orb.vx += dx * inv * pull * dt;
      orb.vy += dy * inv * pull * dt;
    }
  }
}

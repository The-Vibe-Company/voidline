import { experienceOrbs, player, state } from "../state";
import { collectExperience } from "../game/progression";
import { spark } from "./particles";
import {
  experienceDropTotal,
  experienceOrbRadius,
  experienceShardCount,
} from "../game/balance";
import type { EnemyEntity } from "../types";
import { pickupRadiusFor, shouldCollectOrb } from "./experience-pickup";
import { markHudDirty } from "../simulation/events";
import { experienceGrid } from "../simulation/grids";
import { acquireExperienceOrb, releaseExperienceOrb } from "../simulation/pools";
import { random } from "../simulation/random";

const GRID_PICKUP_THRESHOLD = 64;
const pickupCandidateIds = new Set<number>();

export function spawnExperience(enemy: EnemyEntity): void {
  const total = experienceDropTotal(enemy.score, state.wave);
  const shardCount = experienceShardCount(enemy.kind);
  let remaining = total;

  for (let i = 0; i < shardCount; i += 1) {
    const value = i === shardCount - 1 ? remaining : Math.max(1, Math.round(total / shardCount));
    remaining -= value;
    const angle = random() * Math.PI * 2;
    const speed = 70 + random() * 120;
    const orb = acquireExperienceOrb();
    orb.x = enemy.x;
    orb.y = enemy.y;
    orb.vx = Math.cos(angle) * speed;
    orb.vy = Math.sin(angle) * speed;
    orb.radius = experienceOrbRadius(value);
    orb.value = value;
    orb.age = random() * 0.4;
    orb.magnetized = false;
  }
}

export function updateExperience(dt: number): void {
  const damp = 1 - dt * 2.7;
  let hasLooseOrbs = false;

  for (let i = experienceOrbs.length - 1; i >= 0; i -= 1) {
    const orb = experienceOrbs[i]!;
    orb.age += dt;
    orb.x += orb.vx * dt;
    orb.y += orb.vy * dt;
    orb.vx *= damp;
    orb.vy *= damp;
    hasLooseOrbs ||= !orb.magnetized;
  }

  const usePickupGrid = hasLooseOrbs && experienceOrbs.length > GRID_PICKUP_THRESHOLD;
  pickupCandidateIds.clear();
  if (usePickupGrid) {
    experienceGrid.rebuild(experienceOrbs);
    experienceGrid.visitRadius(player.x, player.y, pickupRadiusFor(player), (orb) => {
      if (!orb.magnetized) {
        pickupCandidateIds.add(orb.id);
      }
    });
  }

  for (let i = experienceOrbs.length - 1; i >= 0; i -= 1) {
    const orb = experienceOrbs[i]!;
    if (!orb.magnetized && usePickupGrid && !pickupCandidateIds.has(orb.id)) continue;
    if (shouldCollectOrb(orb, player, dt)) {
      collectExperience(orb.value);
      spark(orb.x, orb.y, "#72ffb1");
      releaseExperienceOrb(i);
      markHudDirty();
    }
  }
}

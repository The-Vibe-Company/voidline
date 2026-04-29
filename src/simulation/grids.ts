import { balance } from "../game/balance";
import { bossBalance } from "../game/roguelike";
import type { EnemyEntity, ExperienceOrb } from "../types";
import { SpatialGrid } from "./spatial-grid";

const MAX_ENEMY_RADIUS = Math.ceil(
  balance.enemies.reduce((max, enemy) => Math.max(max, enemy.radius), 0) *
    bossBalance.boss.radiusMultiplier,
);

export const enemyGrid = new SpatialGrid<EnemyEntity>(
  Math.max(72, Math.ceil(MAX_ENEMY_RADIUS * 2.4)),
);

export const experienceGrid = new SpatialGrid<ExperienceOrb>(96);

export const targetSearchRadius = 980;
export const maxEnemyRadius = MAX_ENEMY_RADIUS;

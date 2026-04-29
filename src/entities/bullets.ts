import { bullets, enemies, perfStats, player, world } from "../state";
import { circleHit } from "../utils";
import { spark } from "./particles";
import { killEnemy } from "./enemies";
import { balance } from "../game/balance";
import { bossBalance } from "../game/roguelike";
import type { EnemyEntity } from "../types";

const MAX_ENEMY_RADIUS = Math.ceil(
  balance.enemies.reduce((m, e) => Math.max(m, e.radius), 0) *
    bossBalance.boss.radiusMultiplier,
);
const CELL_SIZE = Math.max(64, Math.ceil(MAX_ENEMY_RADIUS * 2 * 1.2));
const grid = new Map<number, EnemyEntity[]>();

function cellKey(cellX: number, cellY: number): number {
  return ((cellX + 0x8000) & 0xffff) | (((cellY + 0x8000) & 0xffff) << 16);
}

function rebuildGrid(): void {
  for (const bucket of grid.values()) {
    bucket.length = 0;
  }
  for (let i = 0; i < enemies.length; i += 1) {
    const enemy = enemies[i]!;
    const cx = Math.floor(enemy.x / CELL_SIZE);
    const cy = Math.floor(enemy.y / CELL_SIZE);
    const key = cellKey(cx, cy);
    let bucket = grid.get(key);
    if (!bucket) {
      bucket = [];
      grid.set(key, bucket);
    }
    bucket.push(enemy);
  }
}

export function updateBullets(dt: number): void {
  rebuildGrid();

  outer: for (let i = bullets.length - 1; i >= 0; i -= 1) {
    const bullet = bullets[i]!;
    bullet.life -= dt;
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.trail += dt;

    if (
      bullet.life <= 0 ||
      bullet.x < -80 ||
      bullet.x > world.arenaWidth + 80 ||
      bullet.y < -80 ||
      bullet.y > world.arenaHeight + 80
    ) {
      bullets.splice(i, 1);
      continue;
    }

    const reach = bullet.radius + MAX_ENEMY_RADIUS;
    const minCx = Math.floor((bullet.x - reach) / CELL_SIZE);
    const maxCx = Math.floor((bullet.x + reach) / CELL_SIZE);
    const minCy = Math.floor((bullet.y - reach) / CELL_SIZE);
    const maxCy = Math.floor((bullet.y + reach) / CELL_SIZE);

    for (let cy = minCy; cy <= maxCy; cy += 1) {
      for (let cx = minCx; cx <= maxCx; cx += 1) {
        const bucket = grid.get(cellKey(cx, cy));
        if (!bucket || bucket.length === 0) continue;
        for (let e = 0; e < bucket.length; e += 1) {
          const enemy = bucket[e]!;
          if (bullet.hitIds.has(enemy.id)) continue;
          perfStats.collisionChecks += 1;
          if (!circleHit(bullet, enemy)) continue;

          bullet.hitIds.add(enemy.id);
          enemy.hp -= bullet.damage;
          enemy.hit = 0.12;
          enemy.x += bullet.vx * 0.012;
          enemy.y += bullet.vy * 0.012;
          spark(bullet.x, bullet.y, bullet.color);
          if (enemy.hp <= 0) {
            const idx = enemies.indexOf(enemy);
            if (idx >= 0) killEnemy(idx);
            bucket.splice(e, 1);
            if (player.lifesteal > 0) {
              player.hp = Math.min(player.maxHp, player.hp + player.lifesteal);
            }
          }
          bullet.pierce -= 1;
          if (bullet.pierce < 0) {
            bullets.splice(i, 1);
          }
          continue outer;
        }
      }
    }
  }
}

import { bullets, enemies, perfStats, player, world } from "../state";
import { circleHit, distanceSq } from "../utils";
import { spark } from "./particles";
import { killEnemy } from "./enemies";
import { enemyGrid, maxEnemyRadius } from "../simulation/grids";
import { acquireBullet, releaseBullet } from "../simulation/pools";
import type { Bullet, EnemyEntity } from "../types";

const RAIL_CHAIN_RADIUS = 285;
const RAIL_CHAIN_DAMAGE_SCALE = 0.48;

export function updateBullets(dt: number): void {
  enemyGrid.rebuild(enemies);

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
      releaseBullet(i);
      continue;
    }

    const reach = bullet.radius + maxEnemyRadius;

    let hit = false;
    enemyGrid.visitRadius(bullet.x, bullet.y, reach, (enemy) => {
      if (hit || enemy.hp <= 0 || bullet.hitIds.has(enemy.id)) return;
      perfStats.collisionChecks += 1;
      if (!circleHit(bullet, enemy)) return;

      hit = true;
      bullet.hitIds.add(enemy.id);
      enemy.hp -= bullet.damage;
      enemy.hit = 0.12;
      enemy.x += bullet.vx * 0.012;
      enemy.y += bullet.vy * 0.012;
      spark(bullet.x, bullet.y, bullet.color);
      if (enemy.hp <= 0) {
        const idx = enemies.indexOf(enemy);
        if (idx >= 0) killEnemy(idx);
        if (player.lifesteal > 0) {
          player.hp = Math.min(player.maxHp, player.hp + player.lifesteal);
        }
      }
      spawnRailChain(bullet);
      bullet.pierce -= 1;
      if (bullet.pierce < 0) {
        releaseBullet(i);
      }
      return false;
    });
    if (hit) {
      continue outer;
    }
  }
}

function spawnRailChain(source: Bullet): void {
  if (source.chainRemaining <= 0 || !player.traits.railSplitter) return;

  const target = findRailChainTarget(source);
  if (!target) return;

  const angle = Math.atan2(target.y - source.y, target.x - source.x);
  const speed = Math.max(620, player.bulletSpeed * 1.05);
  const chain = acquireBullet();
  chain.x = source.x;
  chain.y = source.y;
  chain.vx = Math.cos(angle) * speed;
  chain.vy = Math.sin(angle) * speed;
  chain.radius = Math.max(4, source.radius * 0.82);
  chain.damage = source.damage * RAIL_CHAIN_DAMAGE_SCALE;
  chain.pierce = 0;
  chain.life = 0.55;
  chain.color = "#ff5af0";
  chain.trail = 0;
  chain.source = "chain";
  chain.chainRemaining = source.chainRemaining - 1;
  for (const id of source.hitIds) {
    chain.hitIds.add(id);
  }
}

function findRailChainTarget(source: Bullet): EnemyEntity | null {
  let target: EnemyEntity | null = null;
  let bestDistance = RAIL_CHAIN_RADIUS * RAIL_CHAIN_RADIUS;

  for (const enemy of enemies) {
    if (enemy.hp <= 0 || source.hitIds.has(enemy.id)) continue;
    const distSq = distanceSq(source.x, source.y, enemy.x, enemy.y);
    if (distSq < bestDistance) {
      bestDistance = distSq;
      target = enemy;
    }
  }

  return target;
}

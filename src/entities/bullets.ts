import { bullets, enemies, perfStats, player, world } from "../state";
import { circleHit } from "../utils";
import { spark } from "./particles";
import { killEnemy } from "./enemies";
import { enemyGrid, maxEnemyRadius } from "../simulation/grids";
import { releaseBullet } from "../simulation/pools";

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

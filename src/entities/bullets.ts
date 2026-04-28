import { bullets, enemies, player, world } from "../state";
import { circleHit } from "../utils";
import { spark } from "./particles";
import { killEnemy } from "./enemies";

export function updateBullets(dt: number): void {
  for (let i = bullets.length - 1; i >= 0; i -= 1) {
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

    for (let e = enemies.length - 1; e >= 0; e -= 1) {
      const enemy = enemies[e]!;
      if (bullet.hitIds.has(enemy.id)) {
        continue;
      }
      if (circleHit(bullet, enemy)) {
        bullet.hitIds.add(enemy.id);
        enemy.hp -= bullet.damage;
        enemy.hit = 0.12;
        enemy.x += bullet.vx * 0.012;
        enemy.y += bullet.vy * 0.012;
        spark(bullet.x, bullet.y, bullet.color);
        if (enemy.hp <= 0) {
          killEnemy(e);
          if (player.lifesteal > 0) {
            player.hp = Math.min(player.maxHp, player.hp + player.lifesteal);
          }
        }
        bullet.pierce -= 1;
        if (bullet.pierce < 0) {
          bullets.splice(i, 1);
        }
        break;
      }
    }
  }
}

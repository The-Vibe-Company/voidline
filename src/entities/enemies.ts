import { burst, pulseText } from "./particles";
import { spawnExperience } from "./experience";
import { damagePlayer } from "./player";
import { maybeDropPowerup } from "./powerups";
import { counters, enemies, player, state, world } from "../state";
import { circleHit, clamp } from "../utils";
import { scaledEnemyStats, selectEnemyType } from "../game/balance";
import type { EnemyType } from "../types";

export function chooseEnemyType(): EnemyType {
  return selectEnemyType(state.wave, Math.random());
}

export function spawnEnemy(): void {
  const type = chooseEnemyType();
  const side = Math.floor(Math.random() * 4);
  const pad = 70;
  const viewLeft = world.cameraX;
  const viewTop = world.cameraY;
  let x = viewLeft + Math.random() * world.width;
  let y = viewTop + Math.random() * world.height;

  if (side === 0) {
    x = viewLeft - pad;
  } else if (side === 1) {
    x = viewLeft + world.width + pad;
  } else if (side === 2) {
    y = viewTop - pad;
  } else {
    y = viewTop + world.height + pad;
  }

  x = clamp(x, pad, world.arenaWidth - pad);
  y = clamp(y, pad, world.arenaHeight - pad);

  const scaled = scaledEnemyStats(type, state.wave);
  enemies.push({
    ...type,
    id: counters.nextEnemyId,
    kind: type.id,
    x,
    y,
    hp: scaled.hp,
    maxHp: scaled.hp,
    speed: scaled.speed,
    radius: type.radius,
    damage: type.damage,
    age: 0,
    seed: Math.random() * 100,
    wobble: type.id === "brute" ? 0.08 : 0.18,
    wobbleRate: 2 + Math.random() * 2,
    hit: 0,
  });
  counters.nextEnemyId += 1;
}

export function killEnemy(index: number): void {
  const enemy = enemies[index]!;
  enemies.splice(index, 1);
  state.waveKills += 1;
  state.score += Math.round(enemy.score * (1 + state.wave * 0.07));
  state.bestCombo += 1;
  spawnExperience(enemy);
  maybeDropPowerup(enemy);
  burst(enemy.x, enemy.y, enemy.color, enemy.kind === "brute" ? 28 : 18, 220);
  pulseText(enemy.x, enemy.y - enemy.radius, `+${enemy.score}`, enemy.accent);
  world.shake = Math.min(10, world.shake + 2.4);
}

export function updateEnemies(dt: number): void {
  for (let i = enemies.length - 1; i >= 0; i -= 1) {
    const enemy = enemies[i]!;
    enemy.age += dt;
    enemy.hit = Math.max(0, enemy.hit - dt);

    const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
    const wobble = Math.sin(enemy.age * enemy.wobbleRate + enemy.seed) * enemy.wobble;
    enemy.x += Math.cos(angle + wobble) * enemy.speed * dt;
    enemy.y += Math.sin(angle + wobble) * enemy.speed * dt;

    if (circleHit(enemy, player)) {
      damagePlayer(enemy.damage);
      burst(enemy.x, enemy.y, enemy.color, 16, 160);
      enemies.splice(i, 1);
    }
  }
}

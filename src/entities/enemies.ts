import { burst, pulseText } from "./particles";
import { spawnExperience } from "./experience";
import { damagePlayer } from "./player";
import { maybeDropPowerup } from "./powerups";
import { enemies, player, state, world } from "../state";
import { circleHit, clamp } from "../utils";
import { scaledEnemyStats, scoreAward, selectEnemyType } from "../game/balance";
import type { EnemyType } from "../types";
import { markHudDirty } from "../simulation/events";
import { acquireEnemy, releaseEnemy } from "../simulation/pools";
import { random } from "../simulation/random";

export function chooseEnemyType(): EnemyType {
  return selectEnemyType(state.wave, random());
}

export function spawnEnemy(): void {
  const type = chooseEnemyType();
  const side = Math.floor(random() * 4);
  const pad = 70;
  const viewLeft = world.cameraX;
  const viewTop = world.cameraY;
  let x = viewLeft + random() * world.width;
  let y = viewTop + random() * world.height;

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
  const enemy = acquireEnemy(type, type.id);
  enemy.x = x;
  enemy.y = y;
  enemy.hp = scaled.hp;
  enemy.maxHp = scaled.hp;
  enemy.speed = scaled.speed;
  enemy.age = 0;
  enemy.seed = random() * 100;
  enemy.wobble = type.id === "brute" ? 0.08 : 0.18;
  enemy.wobbleRate = 2 + random() * 2;
  enemy.hit = 0;
}

export function killEnemy(index: number): void {
  const enemy = enemies[index]!;
  releaseEnemy(index);
  state.waveKills += 1;
  const awardedScore = scoreAward(enemy.score, state.wave);
  state.score += awardedScore;
  state.bestCombo += 1;
  spawnExperience(enemy);
  maybeDropPowerup(enemy);
  burst(enemy.x, enemy.y, enemy.color, enemy.kind === "brute" ? 28 : 18, 220);
  pulseText(enemy.x, enemy.y - enemy.radius, `+${awardedScore}`, enemy.accent);
  if (state.waveKills % 5 === 0) {
    pulseText(enemy.x, enemy.y - enemy.radius - 24, `SERIE x${state.waveKills}`, "#ffbf47");
  }
  markHudDirty();
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
      releaseEnemy(i);
    }
  }
}

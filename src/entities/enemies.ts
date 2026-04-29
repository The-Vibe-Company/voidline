import { burst, pulseText } from "./particles";
import { spawnExperience } from "./experience";
import { damagePlayer } from "./player";
import { maybeDropPowerup } from "./powerups";
import { spawnChest } from "./chests";
import { counters, enemies, player, state, world } from "../state";
import { circleHit, clamp } from "../utils";
import { scaledEnemyStats, selectEnemyType } from "../game/balance";
import { bossBalance } from "../game/roguelike";
import { unlockRelicsForBossWave } from "../systems/relics";
import type { EnemyType } from "../types";

export function chooseEnemyType(): EnemyType {
  return selectEnemyType(state.wave, Math.random());
}

function spawnPointForRadius(radius: number): { x: number; y: number } {
  const side = Math.floor(Math.random() * 4);
  const pad = Math.max(70, radius + 48);
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
  return { x, y };
}

export function spawnEnemy(): void {
  const type = chooseEnemyType();
  const { x, y } = spawnPointForRadius(type.radius);
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
    role: "normal",
  });
  counters.nextEnemyId += 1;
}

function spawnElite(type: EnemyType, role: "mini-boss" | "boss"): void {
  const tuning = role === "boss" ? bossBalance.boss : bossBalance.miniBoss;
  const scaled = scaledEnemyStats(type, state.wave);
  const radius = Math.round(type.radius * tuning.radiusMultiplier);
  const { x, y } = spawnPointForRadius(radius);
  enemies.push({
    ...type,
    id: counters.nextEnemyId,
    kind: type.id,
    score: Math.round(type.score * tuning.scoreMultiplier),
    x,
    y,
    hp: scaled.hp * tuning.hpMultiplier,
    maxHp: scaled.hp * tuning.hpMultiplier,
    speed: scaled.speed * tuning.speedMultiplier,
    radius,
    damage: type.damage * tuning.damageMultiplier,
    color: role === "boss" ? "#ff5a69" : "#ffbf47",
    accent: role === "boss" ? "#ffffff" : "#fff0b8",
    sides: role === "boss" ? 8 : 6,
    age: 0,
    seed: Math.random() * 100,
    wobble: role === "boss" ? 0.05 : 0.09,
    wobbleRate: role === "boss" ? 1.1 : 1.7,
    hit: 0,
    role,
    contactTimer: 0,
    contactCooldown: tuning.contactCooldown,
  });
  counters.nextEnemyId += 1;
  pulseText(
    x,
    y - radius,
    role === "boss" ? "BOSS" : "MINI-BOSS",
    role === "boss" ? "#ff5a69" : "#ffbf47",
  );
}

export function spawnMiniBoss(): void {
  const type =
    state.wave >= 7 ? selectEnemyType(state.wave + 3, Math.random()) : selectEnemyType(8, 0.95);
  spawnElite(type, "mini-boss");
}

export function spawnWaveBoss(): void {
  const type = selectEnemyType(state.wave + 8, 0.98);
  spawnElite(type, "boss");
}

export function killEnemy(index: number): void {
  const enemy = enemies[index]!;
  const role = enemy.role ?? "normal";
  enemies.splice(index, 1);
  state.waveKills += 1;
  state.score += Math.round(enemy.score * (1 + state.wave * 0.07));
  state.bestCombo += 1;
  spawnExperience(enemy);
  maybeDropPowerup(enemy);
  if (role === "mini-boss") {
    spawnChest(enemy.x, enemy.y);
  }
  if (role === "boss") {
    const unlocked = unlockRelicsForBossWave(state.wave);
    if (unlocked.length > 0) {
      pulseText(enemy.x, enemy.y - enemy.radius - 22, "NOUVELLES RELIQUES", "#72ffb1");
    }
  }
  burst(enemy.x, enemy.y, enemy.color, enemy.kind === "brute" ? 28 : 18, 220);
  pulseText(enemy.x, enemy.y - enemy.radius, `+${enemy.score}`, enemy.accent);
  world.shake = Math.min(10, world.shake + 2.4);
}

export function updateEnemies(dt: number): void {
  for (let i = enemies.length - 1; i >= 0; i -= 1) {
    const enemy = enemies[i]!;
    enemy.age += dt;
    enemy.hit = Math.max(0, enemy.hit - dt);
    enemy.contactTimer = Math.max(0, (enemy.contactTimer ?? 0) - dt);

    const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
    const wobble = Math.sin(enemy.age * enemy.wobbleRate + enemy.seed) * enemy.wobble;
    enemy.x += Math.cos(angle + wobble) * enemy.speed * dt;
    enemy.y += Math.sin(angle + wobble) * enemy.speed * dt;

    if (circleHit(enemy, player)) {
      const role = enemy.role ?? "normal";
      if (role === "mini-boss" || role === "boss") {
        if ((enemy.contactTimer ?? 0) <= 0) {
          damagePlayer(enemy.damage);
          enemy.contactTimer = enemy.contactCooldown ?? 1;
          burst(player.x, player.y, enemy.color, 18, 190);
        }
        enemy.x -= Math.cos(angle) * enemy.speed * dt * 0.45;
        enemy.y -= Math.sin(angle) * enemy.speed * dt * 0.45;
        continue;
      }
      damagePlayer(enemy.damage);
      burst(enemy.x, enemy.y, enemy.color, 16, 160);
      enemies.splice(i, 1);
    }
  }
}

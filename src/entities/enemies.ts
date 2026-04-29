import { burst, pulseText } from "./particles";
import { spawnExperience } from "./experience";
import { damagePlayer } from "./player";
import { maybeDropPowerup } from "./powerups";
import { spawnChest } from "./chests";
import { enemies, player, state, world } from "../state";
import { circleHit, clamp, distanceSq } from "../utils";
import { scaledEnemyStats, scoreAward, selectEnemyType } from "../game/balance";
import { bossVariantForWave, bossVisualForVariant } from "../game/boss-visuals";
import { bossBalance } from "../game/roguelike";
import { unlockRelicsForBossWave } from "../systems/relics";
import { incrementChallengeProgress, recordChallengeProgress } from "../systems/challenges";
import type { EnemyType } from "../types";
import { markHudDirty } from "../simulation/events";
import { acquireEnemy, releaseEnemy } from "../simulation/pools";
import { random } from "../simulation/random";

const KINETIC_RAM_MIN_SPEED = 150;
const KINETIC_RAM_MIN_SHIELD_RATIO = 0.28;
const KINETIC_RAM_COOLDOWN = 0.16;
const MAGNET_STORM_THRESHOLD = 24;
const MAGNET_STORM_COOLDOWN = 2.35;

export function chooseEnemyType(): EnemyType {
  return selectEnemyType(state.wave, random());
}

function spawnPointForRadius(radius: number): { x: number; y: number } {
  const side = Math.floor(random() * 4);
  const pad = Math.max(70, radius + 48);
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
  return { x, y };
}

export function spawnEnemy(): void {
  const type = chooseEnemyType();
  const { x, y } = spawnPointForRadius(type.radius);
  const scaled = scaledEnemyStats(type, state.wave);
  const enemy = acquireEnemy(type, type.id);
  enemy.x = x;
  enemy.y = y;
  enemy.hp = scaled.hp;
  enemy.maxHp = scaled.hp;
  enemy.speed = scaled.speed;
  enemy.damage = scaled.damage;
  enemy.age = 0;
  enemy.seed = random() * 100;
  enemy.wobble = type.id === "brute" ? 0.08 : 0.18;
  enemy.wobbleRate = 2 + random() * 2;
  enemy.hit = 0;
  enemy.role = "normal";
  enemy.bossVariant = undefined;
}

function spawnElite(type: EnemyType, role: "mini-boss" | "boss"): void {
  const tuning = role === "boss" ? bossBalance.boss : bossBalance.miniBoss;
  const bossVariant = role === "boss" ? bossVariantForWave(state.wave) : undefined;
  const bossVisual = bossVariant === undefined ? undefined : bossVisualForVariant(bossVariant);
  const scaled = scaledEnemyStats(type, state.wave);
  const radius = Math.round(type.radius * tuning.radiusMultiplier);
  const { x, y } = spawnPointForRadius(radius);
  const enemy = acquireEnemy(type, type.id);
  enemy.score = Math.round(type.score * tuning.scoreMultiplier);
  enemy.x = x;
  enemy.y = y;
  enemy.hp = scaled.hp * tuning.hpMultiplier;
  enemy.maxHp = enemy.hp;
  enemy.speed = scaled.speed * tuning.speedMultiplier;
  enemy.radius = radius;
  enemy.damage = scaled.damage * tuning.damageMultiplier;
  enemy.color = role === "boss" ? bossVisual!.accent : "#ffbf47";
  enemy.accent = role === "boss" ? "#ffffff" : "#fff0b8";
  enemy.sides = role === "boss" ? 8 : 6;
  enemy.age = 0;
  enemy.seed = random() * 100;
  enemy.wobble = role === "boss" ? 0.05 : 0.09;
  enemy.wobbleRate = role === "boss" ? 1.1 : 1.7;
  enemy.hit = 0;
  enemy.role = role;
  enemy.bossVariant = bossVariant;
  enemy.contactTimer = 0;
  enemy.contactCooldown = tuning.contactCooldown;

  pulseText(
    x,
    y - radius,
    role === "boss" ? "BOSS" : "MINI-BOSS",
    role === "boss" ? "#ff5a69" : "#ffbf47",
  );
}

export function spawnMiniBoss(): void {
  const type =
    state.wave >= 7 ? selectEnemyType(state.wave + 3, random()) : selectEnemyType(8, 0.95);
  spawnElite(type, "mini-boss");
}

export function spawnWaveBoss(): void {
  const type = selectEnemyType(state.wave + 8, 0.98);
  spawnElite(type, "boss");
}

export function killEnemy(index: number): void {
  const enemy = enemies[index]!;
  const role = enemy.role ?? "normal";
  releaseEnemy(index);
  state.waveKills += 1;
  incrementChallengeProgress("totalKills");
  const awardedScore = scoreAward(enemy.score, state.wave);
  state.score += awardedScore;
  recordChallengeProgress("bestScore", state.score);
  state.bestCombo += 1;
  spawnExperience(enemy);
  maybeDropPowerup(enemy);

  if (role === "mini-boss") {
    spawnChest(enemy.x, enemy.y);
  }
  if (role === "boss") {
    incrementChallengeProgress("bossKills");
    const unlocked = unlockRelicsForBossWave(state.wave);
    if (unlocked.length > 0) {
      pulseText(enemy.x, enemy.y - enemy.radius - 22, "NOUVELLES RELIQUES", "#72ffb1");
    }
  }

  burst(enemy.x, enemy.y, enemy.color, enemy.kind === "brute" ? 28 : 18, 220);
  pulseText(enemy.x, enemy.y - enemy.radius, `+${awardedScore}`, enemy.accent);
  if (state.waveKills % 5 === 0) {
    pulseText(enemy.x, enemy.y - enemy.radius - 24, `SERIE x${state.waveKills}`, "#ffbf47");
  }
  markHudDirty();
  world.shake = Math.min(10, world.shake + 2.4);
}

export function updateEnemies(dt: number): void {
  triggerMagnetStorm();

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
      if (tryKineticRam(i, angle)) {
        continue;
      }
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
      releaseEnemy(i);
    }
  }
}

function tryKineticRam(index: number, angleToPlayer: number): boolean {
  const enemy = enemies[index]!;
  const speed = Math.hypot(player.vx, player.vy);
  const hasShield =
    player.shieldMax > 0 && player.shield >= player.shieldMax * KINETIC_RAM_MIN_SHIELD_RATIO;
  if (
    !player.traits.kineticRam ||
    !hasShield ||
    speed < KINETIC_RAM_MIN_SPEED ||
    player.ramTimer > 0
  ) {
    return false;
  }

  const damage = player.damage * 1.8 + player.shield * 0.55 + speed * 0.08;
  enemy.hp -= damage;
  enemy.hit = 0.16;
  enemy.x -= Math.cos(angleToPlayer) * 86;
  enemy.y -= Math.sin(angleToPlayer) * 86;
  player.shield = Math.max(0, player.shield - (8 + enemy.radius * 0.42));
  player.ramTimer = KINETIC_RAM_COOLDOWN;
  burst(enemy.x, enemy.y, "#72ffb1", 24, 230);
  pulseText(enemy.x, enemy.y - enemy.radius - 12, "RAM", "#72ffb1");
  world.shake = Math.min(18, world.shake + 8);
  markHudDirty();

  if (enemy.hp <= 0) {
    killEnemy(index);
  }

  return true;
}

function triggerMagnetStorm(): void {
  if (
    !player.traits.magnetStorm ||
    player.magnetStormTimer > 0 ||
    player.magnetStormCharge < MAGNET_STORM_THRESHOLD
  ) {
    return;
  }

  const charge = player.magnetStormCharge;
  const radius = 180 + Math.min(115, player.pickupRadius * 42);
  const radiusSq = radius * radius;
  const damage = player.damage * 2.15 + charge * 1.65;
  const hasTarget = enemies.some(
    (enemy) => distanceSq(player.x, player.y, enemy.x, enemy.y) <= radiusSq,
  );
  if (!hasTarget) {
    return;
  }

  player.magnetStormCharge = 0;
  player.magnetStormTimer = MAGNET_STORM_COOLDOWN;

  burst(player.x, player.y, "#39d9ff", 54, 390);
  pulseText(player.x, player.y - 52, "MAGNET STORM", "#d9f6ff");
  world.shake = Math.min(24, world.shake + 14);

  for (let i = enemies.length - 1; i >= 0; i -= 1) {
    const enemy = enemies[i]!;
    if (distanceSq(player.x, player.y, enemy.x, enemy.y) > radiusSq) continue;

    const angle = Math.atan2(enemy.y - player.y, enemy.x - player.x);
    enemy.hp -= damage;
    enemy.hit = 0.18;
    enemy.x += Math.cos(angle) * 42;
    enemy.y += Math.sin(angle) * 42;
    if (enemy.hp <= 0) {
      killEnemy(i);
    }
  }

  markHudDirty();
}

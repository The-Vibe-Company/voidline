import { burst, pulseText } from "./particles";
import { spawnExperience } from "./experience";
import { damagePlayer } from "./player";
import { maybeDropPowerup } from "./powerups";
import { spawnChest } from "./chests";
import { enemies, player, state, world } from "../state";
import { circleHit, clamp, distanceSq } from "../utils";
import { balance, scaledEnemyStats, scoreAward, selectEnemyType } from "../game/balance";
import { bossBalance, bossUnlockWaveForStage, startingWaveForStage } from "../game/roguelike";
import { findBossDef } from "../game/boss-catalog";
import { bossStatsAt } from "../game/balance-curves";
import { unlockRelicsForBossWave } from "../systems/relics";
import { incrementChallengeProgress, recordChallengeProgress } from "../systems/challenges";
import type { BossDef, EnemyType } from "../types";
import { markHudDirty } from "../simulation/events";
import { acquireEnemy, releaseEnemy } from "../simulation/pools";
import { random } from "../simulation/random";

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
  enemy.wobble = balance.enemy.wobble[type.id];
  enemy.wobbleRate = balance.enemy.wobble.rateBase + random() * balance.enemy.wobble.rateRandom;
  enemy.hit = 0;
  enemy.role = "normal";
}

function spawnElite(type: EnemyType, def: BossDef): void {
  const tuning = bossStatsAt(def, state.stage);
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
  enemy.color = tuning.color;
  enemy.accent = tuning.accent;
  enemy.sides = tuning.sides;
  enemy.age = 0;
  enemy.seed = random() * 100;
  enemy.wobble = tuning.wobble;
  enemy.wobbleRate = tuning.wobbleRate;
  enemy.hit = 0;
  enemy.role = def.role;
  enemy.contactTimer = 0;
  enemy.contactCooldown = tuning.contactCooldown;

  pulseText(x, y - radius, def.label, tuning.color);
}

export function spawnMiniBoss(): void {
  const offsets = bossBalance.spawnOffsets.miniBoss;
  const type =
    state.wave >= offsets.eligibleFromWave
      ? selectEnemyType(state.wave + offsets.offset, random())
      : selectEnemyType(offsets.fallbackWave, offsets.fallbackRoll);
  spawnElite(type, findBossDef("mini-boss"));
}

export function spawnWaveBoss(): void {
  const offsets = bossBalance.spawnOffsets.waveBoss;
  const type = selectEnemyType(state.wave + offsets.offset, offsets.roll);
  spawnElite(type, findBossDef("boss"));
}

export function spawnStageBoss(): void {
  const offsets = bossBalance.spawnOffsets.stageBoss;
  const type = selectEnemyType(
    state.wave + state.stage * offsets.stageMultiplier + offsets.offset,
    offsets.roll,
  );
  spawnElite(type, findBossDef("boss"));
}

export function killEnemy(index: number): void {
  const enemy = enemies[index]!;
  const role = enemy.role ?? "normal";
  const kind = enemy.kind;
  releaseEnemy(index);
  state.waveKills += 1;
  state.killsByKind[kind] += 1;
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
    if (!state.runBossWaves.includes(state.wave)) {
      state.runBossWaves.push(state.wave);
    }
    if (!state.runBossStages.includes(state.stage)) {
      state.runBossStages.push(state.stage);
    }
    const clearedStage = state.stage;
    const currentWave = state.wave;
    const nextStage = clearedStage + 1;
    const nextWave = Math.max(currentWave + 1, startingWaveForStage(nextStage));
    state.stageBossActive = false;
    state.stageBossSpawned = false;
    state.stage = nextStage;
    state.highestStageReached = Math.max(state.highestStageReached, state.stage);
    state.stageElapsedSeconds = 0;
    state.wave = nextWave - 1;
    state.waveDelay = 0;
    const unlocked = unlockRelicsForBossWave(bossUnlockWaveForStage(clearedStage));
    if (unlocked.length > 0) {
      pulseText(enemy.x, enemy.y - enemy.radius - 22, "NOUVELLES RELIQUES", "#72ffb1");
    }
    pulseText(enemy.x, enemy.y - enemy.radius - 48, `NIVEAU ${state.stage}`, "#39d9ff");
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
        enemy.x -= Math.cos(angle) * enemy.speed * dt * bossBalance.contactBackoff;
        enemy.y -= Math.sin(angle) * enemy.speed * dt * bossBalance.contactBackoff;
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
  const ram = balance.synergies.kineticRam;
  const hasShield =
    player.shieldMax > 0 && player.shield >= player.shieldMax * ram.minShieldRatio;
  if (
    !player.traits.kineticRam ||
    !hasShield ||
    speed < ram.minSpeed ||
    player.ramTimer > 0
  ) {
    return false;
  }

  const damage =
    player.damage * ram.damage.vsDamage +
    player.shield * ram.damage.vsShield +
    speed * ram.damage.vsSpeed;
  enemy.hp -= damage;
  enemy.hit = ram.hitDuration;
  enemy.x -= Math.cos(angleToPlayer) * ram.knockback;
  enemy.y -= Math.sin(angleToPlayer) * ram.knockback;
  player.shield = Math.max(
    0,
    player.shield - (ram.shieldCost.flat + enemy.radius * ram.shieldCost.perRadius),
  );
  player.ramTimer = ram.cooldown;
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
  const storm = balance.synergies.magnetStorm;
  if (
    !player.traits.magnetStorm ||
    player.magnetStormTimer > 0 ||
    player.magnetStormCharge < storm.threshold
  ) {
    return;
  }

  const charge = player.magnetStormCharge;
  const radius =
    storm.radius.base + Math.min(storm.radius.maxBonus, player.pickupRadius * storm.radius.pickupFactor);
  const radiusSq = radius * radius;
  const damage = player.damage * storm.damage.vsDamage + charge * storm.damage.vsCharge;
  const hasTarget = enemies.some(
    (enemy) => distanceSq(player.x, player.y, enemy.x, enemy.y) <= radiusSq,
  );
  if (!hasTarget) {
    return;
  }

  player.magnetStormCharge = 0;
  player.magnetStormTimer = storm.cooldown;

  burst(player.x, player.y, "#39d9ff", 54, 390);
  pulseText(player.x, player.y - 52, "MAGNET STORM", "#d9f6ff");
  world.shake = Math.min(24, world.shake + 14);

  for (let i = enemies.length - 1; i >= 0; i -= 1) {
    const enemy = enemies[i]!;
    if (distanceSq(player.x, player.y, enemy.x, enemy.y) > radiusSq) continue;

    const angle = Math.atan2(enemy.y - player.y, enemy.x - player.x);
    enemy.hp -= damage;
    enemy.hit = storm.hitDuration;
    enemy.x += Math.cos(angle) * storm.knockback;
    enemy.y += Math.sin(angle) * storm.knockback;
    if (enemy.hp <= 0) {
      killEnemy(i);
    }
  }

  markHudDirty();
}

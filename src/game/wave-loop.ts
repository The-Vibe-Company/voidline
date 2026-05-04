import {
  bullets,
  counters,
  enemies,
  experienceOrbs,
  floaters,
  keys,
  particles,
  player,
  pointer,
  spawnIndicators,
  state,
  world,
} from "../state";
import {
  SPAWN_ARENA_MARGIN,
  SPAWN_MIN_DISTANCE_FROM_PLAYER,
  SPAWN_TELEGRAPH_BOSS_DURATION,
  SPAWN_TELEGRAPH_DURATION,
  enemyDamageScale,
  enemyHpScale,
  enemySpeedScale,
  findEnemyType,
  isBossWave,
  boss as bossBalance,
  xp as xpBalance,
} from "./balance";
import { transitionToShop } from "./wave-flow";
import { circleHit, screenToWorld } from "../utils";
import type { EnemyEntity, EnemyKind, SpawnIndicator } from "../types";

const EDGE_PADDING = 18;

export function stepWave(dt: number): void {
  if (state.mode !== "playing") return;
  const cappedDt = Math.min(0.05, Math.max(0, dt));
  world.time += cappedDt;
  state.runElapsedSeconds += cappedDt;
  state.waveTimer = Math.max(0, state.waveTimer - cappedDt);

  updatePlayer(cappedDt);
  updateSpawns(cappedDt);
  updateSpawnIndicators(cappedDt);
  updateEnemies(cappedDt);
  updatePlayerFire(cappedDt);
  updateBullets(cappedDt);
  updateExperience(cappedDt);
  updateParticles(cappedDt);
  updateFloaters(cappedDt);

  if (player.hp <= 0) {
    state.mode = "gameover";
    return;
  }

  if (state.waveTimer <= 0) {
    transitionToShop();
  }
}

function updatePlayer(dt: number): void {
  if (state.controlMode === "trackpad" && pointer.inside) {
    const target = screenToWorld(pointer.x, pointer.y);
    const tdx = target.x - player.x;
    const tdy = target.y - player.y;
    const tdist = Math.hypot(tdx, tdy);
    if (tdist > 6) {
      player.vx = (tdx / tdist) * player.speed;
      player.vy = (tdy / tdist) * player.speed;
    } else {
      player.vx = 0;
      player.vy = 0;
    }
  } else {
    let dx = 0;
    let dy = 0;
    if (keys.has("KeyW") || keys.has("ArrowUp") || keys.has("KeyZ")) dy -= 1;
    if (keys.has("KeyS") || keys.has("ArrowDown")) dy += 1;
    if (keys.has("KeyA") || keys.has("ArrowLeft") || keys.has("KeyQ")) dx -= 1;
    if (keys.has("KeyD") || keys.has("ArrowRight")) dx += 1;
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      player.vx = (dx / len) * player.speed;
      player.vy = (dy / len) * player.speed;
    } else {
      player.vx = 0;
      player.vy = 0;
    }
  }
  player.x = Math.max(
    EDGE_PADDING,
    Math.min(world.arenaWidth - EDGE_PADDING, player.x + player.vx * dt),
  );
  player.y = Math.max(
    EDGE_PADDING,
    Math.min(world.arenaHeight - EDGE_PADDING, player.y + player.vy * dt),
  );
  player.invuln = Math.max(0, player.invuln - dt);

  // Static camera (Brotato-style fixed arena = viewport).
  world.cameraX = 0;
  world.cameraY = 0;
}

function updateSpawns(dt: number): void {
  if (state.spawnsRemaining <= 0) return;
  if (state.waveTimer <= 0) {
    state.spawnsRemaining = 0;
    return;
  }
  state.spawnTimer -= dt;
  if (state.spawnTimer > 0) return;
  const elapsed = state.waveTotalDuration - state.waveTimer;
  const total = Math.max(0.001, state.waveTotalDuration);
  const remainingTime = Math.max(0.05, state.waveTimer);
  const cadence = remainingTime / state.spawnsRemaining;
  state.spawnTimer = Math.max(0.18, cadence);

  if (isBossWave(state.wave) && state.spawnsRemaining === 1) {
    spawnBoss();
  } else {
    spawnEnemy(pickEnemyKind(state.wave, elapsed / total));
  }
  state.spawnsRemaining = Math.max(0, state.spawnsRemaining - 1);
}

function pickEnemyKind(waveNumber: number, progress: number): EnemyKind {
  const bruteWeight = waveNumber >= 4 ? Math.min(0.4, (waveNumber - 3) * 0.06) : 0;
  const hunterWeight =
    waveNumber >= 2 ? Math.min(0.55, 0.15 + (waveNumber - 1) * 0.05 + progress * 0.1) : 0;
  const scoutWeight = Math.max(0.05, 1 - bruteWeight - hunterWeight);
  const total = bruteWeight + hunterWeight + scoutWeight;
  let roll = Math.random() * total;
  if ((roll -= scoutWeight) < 0) return "scout";
  if ((roll -= hunterWeight) < 0) return "hunter";
  return "brute";
}

export function spawnEnemy(kind: EnemyKind): void {
  const type = findEnemyType(kind);
  const { x, y } = randomSpawnPoint();
  spawnIndicators.push({
    id: counters.nextSpawnIndicatorId++,
    kind,
    isBoss: false,
    radius: type.radius,
    color: type.color,
    x,
    y,
    life: SPAWN_TELEGRAPH_DURATION,
    maxLife: SPAWN_TELEGRAPH_DURATION,
  });
}

export function spawnBoss(): void {
  const base = findEnemyType("brute");
  const { x, y } = randomSpawnPoint();
  spawnIndicators.push({
    id: counters.nextSpawnIndicatorId++,
    kind: base.id,
    isBoss: true,
    radius: base.radius * bossBalance.radiusMultiplier,
    color: "#ff5af0",
    x,
    y,
    life: SPAWN_TELEGRAPH_BOSS_DURATION,
    maxLife: SPAWN_TELEGRAPH_BOSS_DURATION,
  });
}

function materializeEnemy(indicator: SpawnIndicator): void {
  const type = findEnemyType(indicator.kind);
  const w = state.wave;
  const hpMul = enemyHpScale(w);
  const speedMul = enemySpeedScale(w);
  const damageMul = enemyDamageScale(w);
  const enemy: EnemyEntity = {
    id: counters.nextEnemyId++,
    kind: type.id,
    score: type.score,
    radius: type.radius,
    hp: type.hp * hpMul,
    maxHp: type.hp * hpMul,
    speed: type.speed * speedMul,
    damage: type.damage * damageMul,
    color: type.color,
    accent: type.accent,
    sides: type.sides,
    x: indicator.x,
    y: indicator.y,
    age: 0,
    hit: 0,
    isBoss: false,
    contactCooldown: 0,
  };
  enemies.push(enemy);
  state.enemiesAlive = enemies.length;
}

function materializeBoss(indicator: SpawnIndicator): void {
  const base = findEnemyType("brute");
  const w = state.wave;
  const hpMul = enemyHpScale(w) * bossBalance.hpMultiplier;
  const speedMul = enemySpeedScale(w) * bossBalance.speedMultiplier;
  const damageMul = enemyDamageScale(w) * bossBalance.damageMultiplier;
  const enemy: EnemyEntity = {
    id: counters.nextEnemyId++,
    kind: base.id,
    score: base.score * bossBalance.scoreMultiplier,
    radius: base.radius * bossBalance.radiusMultiplier,
    hp: base.hp * hpMul,
    maxHp: base.hp * hpMul,
    speed: base.speed * speedMul,
    damage: base.damage * damageMul,
    color: indicator.color,
    accent: "#ffffff",
    sides: 8,
    x: indicator.x,
    y: indicator.y,
    age: 0,
    hit: 0,
    isBoss: true,
    contactCooldown: 0,
  };
  enemies.push(enemy);
  state.enemiesAlive = enemies.length;
}

export function updateSpawnIndicators(dt: number): void {
  for (let i = spawnIndicators.length - 1; i >= 0; i -= 1) {
    const indicator = spawnIndicators[i]!;
    indicator.life -= dt;
    if (indicator.life > 0) continue;
    if (indicator.isBoss) {
      materializeBoss(indicator);
    } else {
      materializeEnemy(indicator);
    }
    spawnIndicators.splice(i, 1);
  }
}

export function randomSpawnPoint(): { x: number; y: number } {
  const minDistSq = SPAWN_MIN_DISTANCE_FROM_PLAYER * SPAWN_MIN_DISTANCE_FROM_PLAYER;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const x =
      SPAWN_ARENA_MARGIN +
      Math.random() * (world.arenaWidth - SPAWN_ARENA_MARGIN * 2);
    const y =
      SPAWN_ARENA_MARGIN +
      Math.random() * (world.arenaHeight - SPAWN_ARENA_MARGIN * 2);
    const dx = x - player.x;
    const dy = y - player.y;
    if (dx * dx + dy * dy >= minDistSq) return { x, y };
  }
  return {
    x: player.x < world.arenaWidth / 2 ? world.arenaWidth - SPAWN_ARENA_MARGIN : SPAWN_ARENA_MARGIN,
    y: player.y < world.arenaHeight / 2 ? world.arenaHeight - SPAWN_ARENA_MARGIN : SPAWN_ARENA_MARGIN,
  };
}

function updateEnemies(dt: number): void {
  for (let i = enemies.length - 1; i >= 0; i -= 1) {
    const enemy = enemies[i]!;
    enemy.age += dt;
    enemy.hit = Math.max(0, enemy.hit - dt);
    enemy.contactCooldown = Math.max(0, enemy.contactCooldown - dt);
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 0) {
      enemy.x += (dx / dist) * enemy.speed * dt;
      enemy.y += (dy / dist) * enemy.speed * dt;
    }
    if (
      circleHit(enemy, player) &&
      enemy.contactCooldown <= 0 &&
      player.invuln <= 0
    ) {
      player.hp -= enemy.damage;
      player.invuln = 0.55;
      enemy.contactCooldown = 0.6;
      spawnFloater(player.x, player.y - 18, `-${Math.round(enemy.damage)}`, "#ff5a69");
      world.shake = Math.min(0.5, world.shake + 0.18);
    }
  }
  separateEnemies();
  state.enemiesAlive = enemies.length;
}

function separateEnemies(): void {
  const count = enemies.length;
  for (let i = 0; i < count; i += 1) {
    const a = enemies[i]!;
    for (let j = i + 1; j < count; j += 1) {
      const b = enemies[j]!;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const minDist = a.radius + b.radius;
      const distSq = dx * dx + dy * dy;
      if (distSq <= 0 || distSq >= minDist * minDist) continue;
      const dist = Math.sqrt(distSq);
      const overlap = (minDist - dist) * 0.5;
      const nx = dx / dist;
      const ny = dy / dist;
      a.x += nx * overlap;
      a.y += ny * overlap;
      b.x -= nx * overlap;
      b.y -= ny * overlap;
    }
  }
}

function updatePlayerFire(dt: number): void {
  player.fireTimer -= dt;
  if (player.fireTimer > 0) return;
  if (enemies.length === 0) {
    player.fireTimer = 0.05;
    return;
  }
  const rangeSq = player.range * player.range;
  let nearest: EnemyEntity | null = null;
  let nearestDist = Number.POSITIVE_INFINITY;
  for (const enemy of enemies) {
    if (
      enemy.x < 0 ||
      enemy.y < 0 ||
      enemy.x > world.arenaWidth ||
      enemy.y > world.arenaHeight
    ) {
      continue;
    }
    const dx = enemy.x - player.x;
    const dy = enemy.y - player.y;
    const dSq = dx * dx + dy * dy;
    if (dSq > rangeSq) continue;
    if (dSq < nearestDist) {
      nearestDist = dSq;
      nearest = enemy;
    }
  }
  if (!nearest) {
    player.fireTimer = 0.05;
    return;
  }
  player.aimAngle = Math.atan2(nearest.y - player.y, nearest.x - player.x);
  fireSalvo();
  player.fireTimer = 1 / Math.max(0.5, player.fireRate);
}

function fireSalvo(): void {
  const baseAngle = player.aimAngle;
  const count = Math.max(1, Math.floor(player.projectileCount));
  const spread = count > 1 ? Math.min(0.7, 0.07 * (count - 1)) : 0;
  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0 : i / (count - 1) - 0.5;
    const angle = baseAngle + t * spread;
    const isCrit = Math.random() < player.critChance;
    const damage = (isCrit ? player.damage * 2 : player.damage);
    bullets.push({
      id: counters.nextBulletId++,
      x: player.x + Math.cos(angle) * (player.radius + 6),
      y: player.y + Math.sin(angle) * (player.radius + 6),
      vx: Math.cos(angle) * player.bulletSpeed,
      vy: Math.sin(angle) * player.bulletSpeed,
      radius: 3 * player.bulletRadius,
      damage,
      pierce: player.pierce,
      life: player.bulletLife,
      hitIds: new Set<number>(),
    });
  }
}

function updateBullets(dt: number): void {
  for (let i = bullets.length - 1; i >= 0; i -= 1) {
    const bullet = bullets[i]!;
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.life -= dt;
    if (
      bullet.life <= 0 ||
      bullet.x < -20 ||
      bullet.y < -20 ||
      bullet.x > world.arenaWidth + 20 ||
      bullet.y > world.arenaHeight + 20
    ) {
      bullets.splice(i, 1);
      continue;
    }
    let removed = false;
    for (let j = enemies.length - 1; j >= 0; j -= 1) {
      const enemy = enemies[j]!;
      if (bullet.hitIds.has(enemy.id)) continue;
      if (!circleHit(bullet, enemy)) continue;
      bullet.hitIds.add(enemy.id);
      enemy.hp -= bullet.damage;
      enemy.hit = 0.12;
      spawnFloater(enemy.x, enemy.y - enemy.radius, `${Math.round(bullet.damage)}`, "#d9f6ff");
      if (enemy.hp <= 0) {
        killEnemy(j, enemy);
      }
      if (bullet.pierce <= 0) {
        bullets.splice(i, 1);
        removed = true;
        break;
      }
      bullet.pierce -= 1;
    }
    if (removed) continue;
  }
}

function killEnemy(index: number, enemy: EnemyEntity): void {
  enemies.splice(index, 1);
  state.enemiesAlive = enemies.length;
  state.score += Math.round(enemy.score * (state.wave * 0.12 + 1));
  spawnDeathBurst(enemy);
  dropExperience(enemy);
}

function dropExperience(enemy: EnemyEntity): void {
  const shards = xpBalance.shardCount[enemy.kind] ?? 1;
  const totalValue =
    (xpBalance.orbValuePerEnemy[enemy.kind] ?? 4) * (enemy.isBoss ? 6 : 1);
  const perOrb = Math.max(1, Math.round(totalValue / shards));
  for (let i = 0; i < shards; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 60 + Math.random() * 60;
    experienceOrbs.push({
      id: counters.nextExperienceId++,
      x: enemy.x,
      y: enemy.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: 4 + Math.min(4, perOrb * 0.12),
      value: perOrb,
      age: 0,
    });
  }
}

function spawnDeathBurst(enemy: EnemyEntity): void {
  const count = enemy.isBoss ? 36 : 12;
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 80 + Math.random() * 220;
    particles.push({
      id: counters.nextParticleId++,
      x: enemy.x,
      y: enemy.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 2 + Math.random() * 4,
      color: enemy.color,
      life: 0.45 + Math.random() * 0.35,
      maxLife: 0.85,
    });
  }
}

function updateExperience(dt: number): void {
  const pickupRadius = xpBalance.pickupRadius;
  const pickupRadiusSq = pickupRadius * pickupRadius;
  for (let i = experienceOrbs.length - 1; i >= 0; i -= 1) {
    const orb = experienceOrbs[i]!;
    orb.age += dt;
    orb.x += orb.vx * dt;
    orb.y += orb.vy * dt;
    orb.vx *= 0.94;
    orb.vy *= 0.94;
    const dx = player.x - orb.x;
    const dy = player.y - orb.y;
    const distSq = dx * dx + dy * dy;
    if (distSq <= pickupRadiusSq) {
      const dist = Math.sqrt(distSq);
      if (dist < player.radius + orb.radius) {
        collectOrb(orb);
        experienceOrbs.splice(i, 1);
        continue;
      }
      const pull = xpBalance.pullSpeed;
      orb.x += (dx / dist) * pull * dt;
      orb.y += (dy / dist) * pull * dt;
    }
  }
}

function collectOrb(orb: { value: number }): void {
  let gain = orb.value;
  if (state.pendingCarry > 0) {
    const drained = Math.min(state.pendingCarry, orb.value);
    state.pendingCarry -= drained;
    gain += drained;
  }
  state.runCurrency += gain;
}

function updateParticles(dt: number): void {
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const particle = particles[i]!;
    particle.life -= dt;
    if (particle.life <= 0) {
      particles.splice(i, 1);
      continue;
    }
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= 0.92;
    particle.vy *= 0.92;
  }
  if (world.shake > 0) {
    world.shake = Math.max(0, world.shake - dt * 1.4);
  }
}

function updateFloaters(dt: number): void {
  for (let i = floaters.length - 1; i >= 0; i -= 1) {
    const floater = floaters[i]!;
    floater.life -= dt;
    if (floater.life <= 0) {
      floaters.splice(i, 1);
      continue;
    }
    floater.y -= dt * 28;
  }
}

function spawnFloater(x: number, y: number, text: string, color: string): void {
  if (floaters.length > 32) {
    floaters.shift();
  }
  floaters.push({
    id: counters.nextFloaterId++,
    x,
    y,
    text,
    color,
    life: 0.6,
    maxLife: 0.6,
  });
}

export function clearRunEntities(): void {
  enemies.length = 0;
  spawnIndicators.length = 0;
  bullets.length = 0;
  experienceOrbs.length = 0;
  particles.length = 0;
  floaters.length = 0;
  state.enemiesAlive = 0;
}

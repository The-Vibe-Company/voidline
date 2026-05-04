import {
  attackTelegraphs,
  bullets,
  counters,
  enemies,
  enemyBullets,
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
  BOSS_PROJECTILE_DAMAGE_RATIO,
  BOSS_PROJECTILE_LIFE,
  BOSS_PROJECTILE_SPEED,
  BOSS_VOLLEY_COUNT,
  BOSS_VOLLEY_INTERVAL,
  BOSS_VOLLEY_SPREAD,
  BOSS_VOLLEY_TELEGRAPH,
  SPAWN_ARENA_MARGIN,
  SPAWN_MIN_DISTANCE_FROM_PLAYER,
  SPAWN_TELEGRAPH_BOSS_DURATION,
  SPAWN_TELEGRAPH_DURATION,
  SPLITTER_CHILD_COUNT,
  SPLITTER_CHILD_HP_RATIO,
  STINGER_DASH_DURATION,
  STINGER_DASH_SPEED_MULT,
  STINGER_RECOVER_PAUSE,
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
import type {
  AttackTelegraphShape,
  EnemyEntity,
  EnemyKind,
  EnemyType,
  SpawnIndicator,
} from "../types";

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
  updateEnemyBullets(cappedDt);
  updateAttackTelegraphs(cappedDt);
  updatePlayerFire(cappedDt);
  updateBullets(cappedDt);
  updateExperience(cappedDt);
  updateParticles(cappedDt);
  updateFloaters(cappedDt);

  if (player.hp <= 0) {
    state.mode = "gameover";
    return;
  }

  if (
    state.waveTimer <= 0 &&
    state.spawnsRemaining <= 0 &&
    enemies.length === 0 &&
    spawnIndicators.length === 0
  ) {
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

export function pickEnemyKind(waveNumber: number, progress: number): EnemyKind {
  const bruteWeight = waveNumber >= 4 ? Math.min(0.32, (waveNumber - 3) * 0.05) : 0;
  const hunterWeight =
    waveNumber >= 2 ? Math.min(0.45, 0.15 + (waveNumber - 1) * 0.04 + progress * 0.08) : 0;
  const sentinelWeight =
    waveNumber >= 3 ? Math.min(0.18, (waveNumber - 2) * 0.04) : 0;
  const stingerWeight =
    waveNumber >= 4 ? Math.min(0.2, (waveNumber - 3) * 0.05) : 0;
  const splitterWeight =
    waveNumber >= 6 ? Math.min(0.12, (waveNumber - 5) * 0.03) : 0;
  const nonScout =
    bruteWeight + hunterWeight + sentinelWeight + stingerWeight + splitterWeight;
  const scoutWeight = Math.max(0.05, 1 - nonScout);
  const total =
    scoutWeight +
    hunterWeight +
    bruteWeight +
    sentinelWeight +
    stingerWeight +
    splitterWeight;
  let roll = Math.random() * total;
  if ((roll -= scoutWeight) < 0) return "scout";
  if ((roll -= hunterWeight) < 0) return "hunter";
  if ((roll -= bruteWeight) < 0) return "brute";
  if ((roll -= sentinelWeight) < 0) return "sentinel";
  if ((roll -= stingerWeight) < 0) return "stinger";
  return "splitter";
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

function initialAttackTimer(type: EnemyType): number {
  const cooldown = type.attackCooldown ?? 0;
  if (cooldown <= 0) return 0;
  return cooldown * (0.4 + Math.random() * 0.6);
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
    behavior: type.behavior,
    attackTimer: initialAttackTimer(type),
    attackState: "idle",
    attackProgress: 0,
    attackTargetX: 0,
    attackTargetY: 0,
    attackVx: 0,
    attackVy: 0,
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
    behavior: "ranged",
    attackTimer: BOSS_VOLLEY_INTERVAL * 0.6,
    attackState: "idle",
    attackProgress: 0,
    attackTargetX: 0,
    attackTargetY: 0,
    attackVx: 0,
    attackVy: 0,
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
    if (enemy.isBoss) {
      updateBossBehavior(enemy, dt);
    } else if (enemy.behavior === "ranged") {
      updateRangedEnemy(enemy, dt);
    } else if (enemy.behavior === "dasher") {
      updateDasherEnemy(enemy, dt);
    } else {
      updateSeekerEnemy(enemy, dt);
    }
    tryContactDamage(enemy);
  }
  separateEnemies();
  state.enemiesAlive = enemies.length;
}

function tryContactDamage(enemy: EnemyEntity): void {
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

function moveTowardPlayer(enemy: EnemyEntity, dt: number, speedScale = 1): void {
  const dx = player.x - enemy.x;
  const dy = player.y - enemy.y;
  const dist = Math.hypot(dx, dy);
  if (dist > 0) {
    enemy.x += (dx / dist) * enemy.speed * speedScale * dt;
    enemy.y += (dy / dist) * enemy.speed * speedScale * dt;
  }
}

function updateSeekerEnemy(enemy: EnemyEntity, dt: number): void {
  moveTowardPlayer(enemy, dt);
}

function updateRangedEnemy(enemy: EnemyEntity, dt: number): void {
  const type = findEnemyType(enemy.kind);
  const range = type.attackRange ?? 260;
  const cooldown = type.attackCooldown ?? 2.4;
  const windup = type.attackWindup ?? 0.6;
  const dx = player.x - enemy.x;
  const dy = player.y - enemy.y;
  const dist = Math.hypot(dx, dy) || 0.0001;

  if (enemy.attackState === "windup") {
    enemy.attackProgress += dt;
    moveTowardPlayer(enemy, dt, 0.15);
    if (enemy.attackProgress >= windup) {
      const aimDx = enemy.attackTargetX - enemy.x;
      const aimDy = enemy.attackTargetY - enemy.y;
      const aimLen = Math.hypot(aimDx, aimDy) || 1;
      const speed = type.projectileSpeed ?? 220;
      const damage =
        (type.projectileDamage ?? Math.round(enemy.damage * 0.9)) *
        enemyDamageScale(state.wave);
      const color = type.projectileColor ?? enemy.color;
      const life = type.projectileLife ?? 2.4;
      spawnEnemyProjectile(
        enemy.x,
        enemy.y,
        (aimDx / aimLen) * speed,
        (aimDy / aimLen) * speed,
        damage,
        life,
        color,
      );
      enemy.attackState = "idle";
      enemy.attackProgress = 0;
      enemy.attackTimer = cooldown;
    }
    return;
  }

  enemy.attackTimer = Math.max(0, enemy.attackTimer - dt);
  const targetGap = range * 0.85;
  if (dist > targetGap) {
    moveTowardPlayer(enemy, dt, 0.85);
  } else if (dist < range * 0.6) {
    enemy.x -= (dx / dist) * enemy.speed * 0.7 * dt;
    enemy.y -= (dy / dist) * enemy.speed * 0.7 * dt;
  } else {
    const px = -dy / dist;
    const py = dx / dist;
    const drift = Math.sin(enemy.age * 1.6 + enemy.id) * 0.6;
    enemy.x += px * enemy.speed * 0.45 * drift * dt;
    enemy.y += py * enemy.speed * 0.45 * drift * dt;
  }

  if (enemy.attackTimer <= 0 && dist <= range) {
    enemy.attackState = "windup";
    enemy.attackProgress = 0;
    enemy.attackTargetX = player.x;
    enemy.attackTargetY = player.y;
    spawnAttackTelegraph({
      shape: "circle",
      x: enemy.x,
      y: enemy.y,
      radius: enemy.radius * 1.6,
      angle: 0,
      length: 0,
      life: windup,
      color: type.projectileColor ?? enemy.color,
    });
  }
}

function updateDasherEnemy(enemy: EnemyEntity, dt: number): void {
  const type = findEnemyType(enemy.kind);
  const range = type.attackRange ?? 200;
  const cooldown = type.attackCooldown ?? 1.8;
  const windup = type.attackWindup ?? 0.45;

  if (enemy.attackState === "windup") {
    enemy.attackProgress += dt;
    if (enemy.attackProgress >= windup) {
      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const len = Math.hypot(dx, dy) || 1;
      const dashSpeed = enemy.speed * STINGER_DASH_SPEED_MULT;
      enemy.attackVx = (dx / len) * dashSpeed;
      enemy.attackVy = (dy / len) * dashSpeed;
      enemy.attackState = "recovering";
      enemy.attackProgress = 0;
    }
    return;
  }

  if (enemy.attackState === "recovering") {
    enemy.attackProgress += dt;
    if (enemy.attackProgress < STINGER_DASH_DURATION) {
      enemy.x += enemy.attackVx * dt;
      enemy.y += enemy.attackVy * dt;
    } else if (enemy.attackProgress >= STINGER_DASH_DURATION + STINGER_RECOVER_PAUSE) {
      enemy.attackState = "idle";
      enemy.attackProgress = 0;
      enemy.attackTimer = cooldown;
      enemy.attackVx = 0;
      enemy.attackVy = 0;
    }
    return;
  }

  enemy.attackTimer = Math.max(0, enemy.attackTimer - dt);
  const dx = player.x - enemy.x;
  const dy = player.y - enemy.y;
  const dist = Math.hypot(dx, dy) || 0.0001;

  if (enemy.attackTimer <= 0 && dist <= range) {
    enemy.attackState = "windup";
    enemy.attackProgress = 0;
    const aimLen = dist;
    const aimDx = dx / aimLen;
    const aimDy = dy / aimLen;
    enemy.attackTargetX = enemy.x + aimDx * range * 1.4;
    enemy.attackTargetY = enemy.y + aimDy * range * 1.4;
    spawnAttackTelegraph({
      shape: "line",
      x: enemy.x,
      y: enemy.y,
      radius: 6,
      angle: Math.atan2(aimDy, aimDx),
      length: range * 1.4,
      life: windup,
      color: enemy.color,
    });
    return;
  }

  moveTowardPlayer(enemy, dt, dist > range ? 1 : 0.45);
}

function updateBossBehavior(enemy: EnemyEntity, dt: number): void {
  if (enemy.attackState === "windup") {
    enemy.attackProgress += dt;
    moveTowardPlayer(enemy, dt, 0.25);
    if (enemy.attackProgress >= BOSS_VOLLEY_TELEGRAPH) {
      const baseAngle = Math.atan2(
        enemy.attackTargetY - enemy.y,
        enemy.attackTargetX - enemy.x,
      );
      const damage =
        enemy.damage * BOSS_PROJECTILE_DAMAGE_RATIO;
      const denom = Math.max(1, BOSS_VOLLEY_COUNT - 1);
      for (let i = 0; i < BOSS_VOLLEY_COUNT; i += 1) {
        const t = i / denom - 0.5;
        const angle = baseAngle + t * BOSS_VOLLEY_SPREAD;
        spawnEnemyProjectile(
          enemy.x,
          enemy.y,
          Math.cos(angle) * BOSS_PROJECTILE_SPEED,
          Math.sin(angle) * BOSS_PROJECTILE_SPEED,
          damage,
          BOSS_PROJECTILE_LIFE,
          "#ff5af0",
        );
      }
      enemy.attackState = "idle";
      enemy.attackProgress = 0;
      enemy.attackTimer = BOSS_VOLLEY_INTERVAL;
    }
    return;
  }

  enemy.attackTimer = Math.max(0, enemy.attackTimer - dt);
  moveTowardPlayer(enemy, dt, 0.85);
  if (enemy.attackTimer <= 0) {
    enemy.attackState = "windup";
    enemy.attackProgress = 0;
    enemy.attackTargetX = player.x;
    enemy.attackTargetY = player.y;
    spawnAttackTelegraph({
      shape: "circle",
      x: enemy.x,
      y: enemy.y,
      radius: enemy.radius * 1.4,
      angle: 0,
      length: 0,
      life: BOSS_VOLLEY_TELEGRAPH,
      color: "#ff5af0",
    });
  }
}

function spawnEnemyProjectile(
  x: number,
  y: number,
  vx: number,
  vy: number,
  damage: number,
  life: number,
  color: string,
): void {
  enemyBullets.push({
    id: counters.nextEnemyBulletId++,
    x,
    y,
    vx,
    vy,
    radius: 6,
    damage,
    life,
    color,
  });
}

interface AttackTelegraphSpec {
  shape: AttackTelegraphShape;
  x: number;
  y: number;
  radius: number;
  angle: number;
  length: number;
  life: number;
  color: string;
}

function spawnAttackTelegraph(spec: AttackTelegraphSpec): void {
  attackTelegraphs.push({
    id: counters.nextAttackTelegraphId++,
    shape: spec.shape,
    x: spec.x,
    y: spec.y,
    radius: spec.radius,
    angle: spec.angle,
    length: spec.length,
    life: spec.life,
    maxLife: spec.life,
    color: spec.color,
  });
}

function updateEnemyBullets(dt: number): void {
  for (let i = enemyBullets.length - 1; i >= 0; i -= 1) {
    const bullet = enemyBullets[i]!;
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
      enemyBullets.splice(i, 1);
      continue;
    }
    if (player.invuln > 0) continue;
    if (!circleHit(bullet, player)) continue;
    player.hp -= bullet.damage;
    player.invuln = 0.55;
    spawnFloater(player.x, player.y - 18, `-${Math.round(bullet.damage)}`, bullet.color);
    world.shake = Math.min(0.5, world.shake + 0.18);
    enemyBullets.splice(i, 1);
  }
}

function updateAttackTelegraphs(dt: number): void {
  for (let i = attackTelegraphs.length - 1; i >= 0; i -= 1) {
    const telegraph = attackTelegraphs[i]!;
    telegraph.life -= dt;
    if (telegraph.life <= 0) {
      attackTelegraphs.splice(i, 1);
    }
  }
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
  if (enemy.kind === "splitter" && !enemy.isBoss) {
    spawnSplitterChildren(enemy);
  }
}

function spawnSplitterChildren(parent: EnemyEntity): void {
  const type = findEnemyType("scout");
  const w = state.wave;
  const hpMul = enemyHpScale(w) * SPLITTER_CHILD_HP_RATIO;
  const speedMul = enemySpeedScale(w);
  const damageMul = enemyDamageScale(w);
  for (let i = 0; i < SPLITTER_CHILD_COUNT; i += 1) {
    const angle = (i / SPLITTER_CHILD_COUNT) * Math.PI * 2 + Math.random() * 0.4;
    const offset = parent.radius * 0.6;
    const child: EnemyEntity = {
      id: counters.nextEnemyId++,
      kind: type.id,
      score: Math.round(type.score * 0.5),
      radius: type.radius,
      hp: type.hp * hpMul,
      maxHp: type.hp * hpMul,
      speed: type.speed * speedMul * 1.1,
      damage: type.damage * damageMul,
      color: type.color,
      accent: type.accent,
      sides: type.sides,
      x: parent.x + Math.cos(angle) * offset,
      y: parent.y + Math.sin(angle) * offset,
      age: 0,
      hit: 0,
      isBoss: false,
      contactCooldown: 0.4,
      behavior: type.behavior,
      attackTimer: 0,
      attackState: "idle",
      attackProgress: 0,
      attackTargetX: 0,
      attackTargetY: 0,
      attackVx: 0,
      attackVy: 0,
    };
    enemies.push(child);
  }
  state.enemiesAlive = enemies.length;
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
  enemyBullets.length = 0;
  attackTelegraphs.length = 0;
  experienceOrbs.length = 0;
  particles.length = 0;
  floaters.length = 0;
  state.enemiesAlive = 0;
}

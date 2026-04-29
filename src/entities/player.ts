import { bullets, enemies, keys, player, pointer, state, world } from "../state";
import { clamp, distanceSq, screenToWorld } from "../utils";
import { pulseText } from "./particles";
import type { EnemyEntity } from "../types";

export function nearestEnemy(x: number, y: number): EnemyEntity | null {
  let nearest: EnemyEntity | null = null;
  let best = Infinity;
  for (const enemy of enemies) {
    const dist = distanceSq(x, y, enemy.x, enemy.y);
    if (dist < best) {
      best = dist;
      nearest = enemy;
    }
  }
  return nearest;
}

export function fireVolley(x: number, y: number, angle: number, drone: boolean): void {
  const count = drone ? 1 : player.projectileCount;
  const spread = drone ? 0 : Math.min(0.82, 0.13 * (count - 1));
  const start = angle - spread / 2;
  const step = count > 1 ? spread / (count - 1) : 0;

  for (let i = 0; i < count; i += 1) {
    const bulletAngle = start + step * i;
    const speed = drone ? player.bulletSpeed * 0.9 : player.bulletSpeed;
    const isCrit = Math.random() < player.critChance;
    const baseDamage = drone ? player.damage * 0.58 : player.damage;
    const baseRadius = drone ? 4 : 5;
    bullets.push({
      x: x + Math.cos(bulletAngle) * 20,
      y: y + Math.sin(bulletAngle) * 20,
      vx: Math.cos(bulletAngle) * speed,
      vy: Math.sin(bulletAngle) * speed,
      radius: baseRadius * player.bulletRadius,
      damage: isCrit ? baseDamage * 2 : baseDamage,
      pierce: player.pierce,
      life: drone ? 0.9 : 1.15,
      color: drone ? "#ffbf47" : isCrit ? "#ff5af0" : "#39d9ff",
      trail: 0,
      hitIds: new Set(),
    });
  }
}

export function fireDrones(): void {
  if (!enemies.length) return;
  for (let i = 0; i < player.drones; i += 1) {
    const angle = world.time * 1.9 + (Math.PI * 2 * i) / player.drones;
    const x = player.x + Math.cos(angle) * 48;
    const y = player.y + Math.sin(angle) * 48;
    const target = nearestEnemy(x, y);
    if (target) {
      fireVolley(x, y, Math.atan2(target.y - y, target.x - x), true);
    }
  }
}

export function damagePlayer(amount: number): void {
  if (player.invuln > 0) return;

  let incoming = amount;
  if (player.shield > 0) {
    const absorbed = Math.min(player.shield, incoming);
    player.shield -= absorbed;
    incoming -= absorbed;
  }

  if (incoming > 0) {
    player.hp -= incoming;
  }

  player.invuln = 0.34;
  world.shake = 14;
  pulseText(player.x, player.y - 38, `-${Math.round(amount)}`, "#ff5a69");
}

export function updatePlayer(dt: number): void {
  const keyX =
    Number(keys.has("ArrowRight") || keys.has("KeyD")) -
    Number(keys.has("ArrowLeft") || keys.has("KeyA") || keys.has("KeyQ"));
  const keyY =
    Number(keys.has("ArrowDown") || keys.has("KeyS")) -
    Number(keys.has("ArrowUp") || keys.has("KeyW") || keys.has("KeyZ"));
  const keyActive = keyX !== 0 || keyY !== 0;
  let inputX = keyX;
  let inputY = keyY;
  let speedScale = 1;

  if (!keyActive && state.controlMode === "trackpad" && pointer.inside) {
    const target = screenToWorld(pointer.x, pointer.y);
    const dx = target.x - player.x;
    const dy = target.y - player.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 14) {
      inputX = dx / dist;
      inputY = dy / dist;
      speedScale = clamp(dist / 210, 0.32, 1);
    }
  }

  const len = Math.hypot(inputX, inputY) || 1;
  const targetVx = (inputX / len) * player.speed * speedScale;
  const targetVy = (inputY / len) * player.speed * speedScale;
  const smoothing = 1 - Math.pow(0.0009, dt);
  player.vx += (targetVx - player.vx) * smoothing;
  player.vy += (targetVy - player.vy) * smoothing;
  player.x = clamp(
    player.x + player.vx * dt,
    player.radius + 8,
    world.arenaWidth - player.radius - 8,
  );
  player.y = clamp(
    player.y + player.vy * dt,
    player.radius + 8,
    world.arenaHeight - player.radius - 8,
  );

  player.invuln = Math.max(0, player.invuln - dt);
  if (player.shieldMax > 0) {
    player.shield = Math.min(player.shieldMax, player.shield + player.shieldRegen * dt);
  }

  const target = nearestEnemy(player.x, player.y);
  if (target) {
    player.aimAngle = Math.atan2(target.y - player.y, target.x - player.x);
  } else if (Math.hypot(player.vx, player.vy) > 20) {
    player.aimAngle = Math.atan2(player.vy, player.vx);
  }

  player.fireTimer -= dt;
  if (target && player.fireTimer <= 0) {
    fireVolley(player.x, player.y, player.aimAngle, false);
    player.fireTimer = 1 / player.fireRate;
  }

  if (player.drones > 0) {
    player.droneTimer -= dt;
    if (player.droneTimer <= 0) {
      fireDrones();
      player.droneTimer = Math.max(0.18, 0.72 - player.drones * 0.05);
    }
  }
}


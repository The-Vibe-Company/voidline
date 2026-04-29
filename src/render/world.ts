import {
  bullets,
  chests,
  ctx,
  enemies,
  experienceOrbs,
  floaters,
  particles,
  perfStats,
  player,
  pointer,
  state,
  world,
} from "../state";
import { clamp, screenToWorld } from "../utils";
import { balance } from "../game/balance";
import { drawArenaBounds, drawBackground, polygon } from "./background";
import { drawPowerupOrbs } from "./powerups";
import type { Bullet, ChestEntity, EnemyEntity, ExperienceOrb } from "../types";

const view = { left: 0, top: 0, right: 0, bottom: 0 };

function inView(x: number, y: number, radius: number): boolean {
  return (
    x + radius >= view.left &&
    x - radius <= view.right &&
    y + radius >= view.top &&
    y - radius <= view.bottom
  );
}

function drawPickupZones(): void {
  if (!state.showPickupZones) return;

  const pickupRadius = balance.xp.pickupBaseRadius * player.pickupRadius;

  ctx.save();
  ctx.strokeStyle = "#72ffb1";
  ctx.globalAlpha = 0.32;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(player.x, player.y, pickupRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawTrackpadGuide(): void {
  if (state.mode !== "playing" || state.controlMode !== "trackpad" || !pointer.inside) {
    return;
  }

  const target = screenToWorld(pointer.x, pointer.y);
  const distance = Math.hypot(target.x - player.x, target.y - player.y);
  if (distance < 18) return;

  ctx.save();
  ctx.globalAlpha = clamp(distance / 240, 0.16, 0.48);
  ctx.strokeStyle = "#72ffb1";
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 12]);
  ctx.beginPath();
  ctx.moveTo(player.x, player.y);
  ctx.lineTo(target.x, target.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 0.72;
  ctx.beginPath();
  ctx.arc(target.x, target.y, 12 + Math.sin(world.time * 8) * 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawPlayer(): void {
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(player.aimAngle + Math.PI / 2);

  if (player.shield > 1) {
    ctx.save();
    ctx.globalAlpha = 0.2 + (player.shield / Math.max(1, player.shieldMax)) * 0.24;
    ctx.strokeStyle = "#72ffb1";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, player.radius + 15, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  const engine = Math.min(1, Math.hypot(player.vx, player.vy) / player.speed);
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  const flame = ctx.createLinearGradient(0, 12, 0, 36 + engine * 16);
  flame.addColorStop(0, "rgba(57, 217, 255, 0.9)");
  flame.addColorStop(1, "rgba(255, 191, 71, 0)");
  ctx.fillStyle = flame;
  ctx.beginPath();
  ctx.moveTo(-6, 11);
  ctx.lineTo(0, 34 + engine * 18 + Math.sin(world.time * 34) * 3);
  ctx.lineTo(6, 11);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = player.invuln > 0 && Math.sin(world.time * 42) > 0 ? "#ffffff" : "#d9f6ff";
  ctx.strokeStyle = "#39d9ff";
  ctx.lineWidth = 2;
  ctx.shadowColor = "#39d9ff";
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.moveTo(0, -24);
  ctx.lineTo(15, 17);
  ctx.lineTo(5, 12);
  ctx.lineTo(0, 23);
  ctx.lineTo(-5, 12);
  ctx.lineTo(-15, 17);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.fillStyle = "#05060b";
  ctx.beginPath();
  ctx.moveTo(0, -12);
  ctx.lineTo(6, 7);
  ctx.lineTo(-6, 7);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawDrones(): void {
  if (player.drones <= 0) return;
  for (let i = 0; i < player.drones; i += 1) {
    const angle = world.time * 1.9 + (Math.PI * 2 * i) / player.drones;
    const x = player.x + Math.cos(angle) * 48;
    const y = player.y + Math.sin(angle) * 48;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-angle);
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = "#ffbf47";
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#ffbf47";
    ctx.strokeStyle = "#fff0b8";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.rect(-6, -6, 12, 12);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

function drawEnemy(enemy: EnemyEntity): void {
  ctx.save();
  ctx.translate(enemy.x, enemy.y);
  ctx.rotate(enemy.age * (enemy.kind === "brute" ? 0.7 : 1.6));
  ctx.shadowColor = enemy.color;
  ctx.shadowBlur = enemy.hit > 0 ? 25 : 10;
  ctx.fillStyle = enemy.hit > 0 ? enemy.accent : enemy.color;
  ctx.strokeStyle = enemy.accent;
  ctx.lineWidth = enemy.kind === "brute" ? 2.5 : 1.5;

  polygon(0, 0, enemy.radius, enemy.sides);
  ctx.fill();
  ctx.stroke();

  ctx.shadowBlur = 0;
  const hpPct = clamp(enemy.hp / enemy.maxHp, 0, 1);
  if (hpPct < 0.98) {
    ctx.rotate(-enemy.age * (enemy.kind === "brute" ? 0.7 : 1.6));
    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctx.fillRect(-enemy.radius, enemy.radius + 9, enemy.radius * 2, 4);
    ctx.fillStyle = enemy.accent;
    ctx.fillRect(-enemy.radius, enemy.radius + 9, enemy.radius * 2 * hpPct, 4);
  }

  ctx.restore();
}

function drawChest(chest: ChestEntity): void {
  const pulse = 1 + Math.sin(world.time * 5 + chest.age * 3) * 0.08;
  ctx.save();
  ctx.translate(chest.x, chest.y);
  ctx.rotate(Math.sin(chest.age * 1.8) * 0.08);
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = "#ffbf47";
  ctx.beginPath();
  ctx.arc(0, 0, chest.radius * 2.3 * pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.shadowColor = "#ffbf47";
  ctx.shadowBlur = 18;
  ctx.fillStyle = "#201107";
  ctx.strokeStyle = "#fff0b8";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.rect(-chest.radius, -chest.radius * 0.68, chest.radius * 2, chest.radius * 1.36);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#ffbf47";
  ctx.fillRect(-chest.radius + 4, -3, chest.radius * 2 - 8, 6);
  ctx.fillRect(-4, -chest.radius * 0.68, 8, chest.radius * 1.36);
  ctx.fillStyle = "#fff0b8";
  ctx.fillRect(-5, -5, 10, 10);
  ctx.restore();
}

function drawBullet(bullet: Bullet): void {
  ctx.strokeStyle = bullet.color;
  ctx.fillStyle = bullet.color;
  ctx.lineWidth = bullet.radius;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(bullet.x - bullet.vx * 0.022, bullet.y - bullet.vy * 0.022);
  ctx.lineTo(bullet.x, bullet.y);
  ctx.stroke();
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.arc(bullet.x, bullet.y, bullet.radius * 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(bullet.x, bullet.y, bullet.radius * 0.7, 0, Math.PI * 2);
  ctx.fill();
}

function drawExperienceOrb(orb: ExperienceOrb): void {
  const pulse = 1 + Math.sin(world.time * 7 + orb.age * 4) * 0.12;
  ctx.save();
  ctx.translate(orb.x, orb.y);
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = "#72ffb1";
  ctx.beginPath();
  ctx.arc(0, 0, orb.radius * 1.6 * pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.rotate(world.time * 1.4 + orb.age);
  ctx.fillStyle = "#72ffb1";
  ctx.strokeStyle = "#eaffd8";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -orb.radius * pulse);
  ctx.lineTo(orb.radius * 0.72 * pulse, 0);
  ctx.lineTo(0, orb.radius * pulse);
  ctx.lineTo(-orb.radius * 0.72 * pulse, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawParticles(behind: boolean): void {
  for (const particle of particles) {
    if (particle.behind !== behind) continue;
    if (!inView(particle.x, particle.y, particle.size + 2)) {
      perfStats.culled += 1;
      continue;
    }
    perfStats.drawn += 1;
    const alpha = clamp(particle.life / particle.maxLife, 0, 1);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size * alpha, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawFloaters(): void {
  ctx.save();
  ctx.font = "700 13px Share Tech Mono, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const floater of floaters) {
    const alpha = clamp(floater.life / floater.maxLife, 0, 1);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = floater.color;
    ctx.fillText(floater.text, floater.x, floater.y);
  }
  ctx.restore();
}

export function render(): void {
  ctx.save();
  ctx.clearRect(0, 0, world.width, world.height);
  drawBackground();

  const shakeX = (Math.random() - 0.5) * world.shake;
  const shakeY = (Math.random() - 0.5) * world.shake;
  ctx.translate(shakeX, shakeY);
  ctx.translate(-world.cameraX, -world.cameraY);

  view.left = world.cameraX - 32;
  view.top = world.cameraY - 32;
  view.right = world.cameraX + world.width + 32;
  view.bottom = world.cameraY + world.height + 32;

  drawArenaBounds();
  drawPickupZones();
  drawParticles(true);
  drawTrackpadGuide();
  for (const orb of experienceOrbs) {
    if (!inView(orb.x, orb.y, orb.radius)) {
      perfStats.culled += 1;
      continue;
    }
    perfStats.drawn += 1;
    drawExperienceOrb(orb);
  }
  drawPowerupOrbs();
  for (const chest of chests) {
    if (!inView(chest.x, chest.y, chest.radius + 12)) {
      perfStats.culled += 1;
      continue;
    }
    perfStats.drawn += 1;
    drawChest(chest);
  }
  for (const bullet of bullets) {
    if (!inView(bullet.x, bullet.y, bullet.radius + 8)) {
      perfStats.culled += 1;
      continue;
    }
    perfStats.drawn += 1;
    drawBullet(bullet);
  }
  for (const enemy of enemies) {
    if (!inView(enemy.x, enemy.y, enemy.radius + 6)) {
      perfStats.culled += 1;
      continue;
    }
    perfStats.drawn += 1;
    drawEnemy(enemy);
  }
  drawDrones();
  drawPlayer();
  drawParticles(false);
  drawFloaters();
  ctx.restore();
}

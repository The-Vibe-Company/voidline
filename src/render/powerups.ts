import { ctx, powerupOrbs, world } from "../state";
import { getVariant } from "../entities/powerups";
import type { PowerupKind, PowerupOrb } from "../types";

function drawHeart(r: number): void {
  const top = r * 0.35;
  const bottom = r * 1.05;
  const wing = r * 0.95;
  ctx.beginPath();
  ctx.moveTo(0, top);
  ctx.bezierCurveTo(-wing, -r * 0.55, -r * 1.1, r * 0.25, 0, bottom);
  ctx.bezierCurveTo(r * 1.1, r * 0.25, wing, -r * 0.55, 0, top);
  ctx.closePath();
}

function drawMagnet(r: number): void {
  const armWidth = r * 0.42;
  const innerLeft = -r * 0.18;
  const innerRight = r * 0.18;
  const outer = r * 0.95;
  const top = -r * 0.95;
  const bottom = r * 0.35;
  const tipBottom = r * 0.95;
  ctx.beginPath();
  ctx.moveTo(-outer, top);
  ctx.lineTo(-outer, tipBottom);
  ctx.lineTo(innerLeft, tipBottom);
  ctx.lineTo(innerLeft, bottom);
  ctx.bezierCurveTo(innerLeft, top + r * 0.6, innerRight, top + r * 0.6, innerRight, bottom);
  ctx.lineTo(innerRight, tipBottom);
  ctx.lineTo(outer, tipBottom);
  ctx.lineTo(outer, top);
  ctx.lineTo(outer - armWidth, top);
  ctx.lineTo(outer - armWidth, top + r * 0.5);
  ctx.bezierCurveTo(
    outer - armWidth,
    -r * 0.05,
    -outer + armWidth,
    -r * 0.05,
    -outer + armWidth,
    top + r * 0.5,
  );
  ctx.lineTo(-outer + armWidth, top);
  ctx.closePath();
}

function drawBombBody(r: number): void {
  ctx.beginPath();
  ctx.arc(0, r * 0.18, r * 0.92, 0, Math.PI * 2);
  ctx.closePath();
}

function drawBombFuse(r: number, time: number): void {
  ctx.save();
  ctx.strokeStyle = "#fff0b8";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(r * 0.18, -r * 0.55);
  ctx.quadraticCurveTo(r * 0.7, -r * 1, r * 0.55, -r * 1.25);
  ctx.stroke();
  ctx.restore();

  const flameRadius = r * 0.32 * (0.85 + Math.sin(time * 22) * 0.18);
  ctx.save();
  ctx.shadowColor = "#ff5a69";
  ctx.shadowBlur = 22;
  ctx.fillStyle = "#ffbf47";
  ctx.beginPath();
  ctx.arc(r * 0.55, -r * 1.3, flameRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff0b8";
  ctx.beginPath();
  ctx.arc(r * 0.55, -r * 1.3, flameRadius * 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawShape(kind: PowerupKind, r: number, time: number): void {
  switch (kind) {
    case "heart":
      drawHeart(r);
      break;
    case "magnet":
      drawMagnet(r);
      break;
    case "bomb":
      drawBombBody(r);
      drawBombFuse(r, time);
      break;
  }
}

function drawPowerupOrb(orb: PowerupOrb): void {
  const variant = getVariant(orb.kind);
  const pulse = 1 + Math.sin(world.time * 5.2 + orb.age * 3) * 0.08;
  const r = orb.radius * pulse;
  const blink = orb.life < 3 ? 0.4 + Math.sin(world.time * 14) * 0.4 : 1;

  ctx.save();
  ctx.globalAlpha = blink;
  ctx.translate(orb.x, orb.y);

  const haloT = ((world.time + orb.age) % 1.4) / 1.4;
  ctx.save();
  ctx.globalAlpha = (1 - haloT) * 0.45 * blink;
  ctx.strokeStyle = variant.accent;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.2 + haloT * 16, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  const bob = Math.sin(world.time * 3 + orb.age * 2) * 1.5;
  ctx.translate(0, bob);

  ctx.shadowColor = variant.accent;
  ctx.shadowBlur = 18;
  ctx.fillStyle = variant.color;
  ctx.strokeStyle = variant.accent;
  ctx.lineWidth = 1.8;
  drawShape(orb.kind, r, world.time + orb.age);
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

export function drawPowerupOrbs(): void {
  for (const orb of powerupOrbs) {
    drawPowerupOrb(orb);
  }
}

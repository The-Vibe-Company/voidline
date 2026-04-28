import { ctx, stars, world } from "../state";

function drawNebula(x: number, y: number, radius: number, color: string): void {
  const nebula = ctx.createRadialGradient(x, y, 0, x, y, radius);
  nebula.addColorStop(0, color);
  nebula.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = nebula;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

export function drawBackground(): void {
  const gradient = ctx.createLinearGradient(0, 0, world.width, world.height);
  gradient.addColorStop(0, "#05060b");
  gradient.addColorStop(0.48, "#081017");
  gradient.addColorStop(1, "#110b12");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, world.width, world.height);

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  drawNebula(
    world.width * 0.16,
    world.height * 0.22,
    Math.min(world.width, world.height) * 0.62,
    "rgba(57, 217, 255, 0.08)",
  );
  drawNebula(
    world.width * 0.84,
    world.height * 0.72,
    Math.min(world.width, world.height) * 0.5,
    "rgba(255, 191, 71, 0.06)",
  );
  ctx.restore();

  for (const star of stars) {
    const alpha = 0.38 + Math.sin(star.twinkle) * 0.18 + star.depth * 0.28;
    ctx.fillStyle = `rgba(226, 247, 255, ${alpha})`;
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.size * star.depth, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = "#39d9ff";
  ctx.lineWidth = 1;
  const grid = 64;
  const offsetX = -((world.cameraX - world.time * 8) % grid) - grid;
  const offsetY = -((world.cameraY - world.time * 5) % grid) - grid;
  for (let x = offsetX; x < world.width + grid; x += grid) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, world.height);
    ctx.stroke();
  }
  for (let y = offsetY; y < world.height + grid; y += grid) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(world.width, y);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawArenaBounds(): void {
  ctx.save();
  ctx.strokeStyle = "rgba(255, 191, 71, 0.28)";
  ctx.lineWidth = 2;
  ctx.setLineDash([18, 16]);
  ctx.strokeRect(0, 0, world.arenaWidth, world.arenaHeight);
  ctx.setLineDash([]);

  ctx.globalAlpha = 0.08;
  ctx.strokeStyle = "#72ffb1";
  ctx.lineWidth = 1;
  const sector = 512;
  for (let x = sector; x < world.arenaWidth; x += sector) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, world.arenaHeight);
    ctx.stroke();
  }
  for (let y = sector; y < world.arenaHeight; y += sector) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(world.arenaWidth, y);
    ctx.stroke();
  }
  ctx.restore();
}

export function polygon(x: number, y: number, radius: number, sides: number): void {
  ctx.beginPath();
  for (let i = 0; i < sides; i += 1) {
    const angle = -Math.PI / 2 + (Math.PI * 2 * i) / sides;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

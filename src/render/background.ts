import { ctx, stars, world } from "../state";

interface GradientCache {
  width: number;
  height: number;
  base: CanvasGradient | null;
  nebulaA: CanvasGradient | null;
  nebulaB: CanvasGradient | null;
}

const cache: GradientCache = {
  width: 0,
  height: 0,
  base: null,
  nebulaA: null,
  nebulaB: null,
};

function ensureGradients(): void {
  if (cache.width === world.width && cache.height === world.height && cache.base) return;
  cache.width = world.width;
  cache.height = world.height;

  const base = ctx.createLinearGradient(0, 0, world.width, world.height);
  base.addColorStop(0, "#05060b");
  base.addColorStop(0.48, "#081017");
  base.addColorStop(1, "#110b12");
  cache.base = base;

  const nebulaARadius = Math.min(world.width, world.height) * 0.62;
  const nebulaACx = world.width * 0.16;
  const nebulaACy = world.height * 0.22;
  const nebulaA = ctx.createRadialGradient(
    nebulaACx,
    nebulaACy,
    0,
    nebulaACx,
    nebulaACy,
    nebulaARadius,
  );
  nebulaA.addColorStop(0, "rgba(57, 217, 255, 0.08)");
  nebulaA.addColorStop(1, "rgba(0, 0, 0, 0)");
  cache.nebulaA = nebulaA;

  const nebulaBRadius = Math.min(world.width, world.height) * 0.5;
  const nebulaBCx = world.width * 0.84;
  const nebulaBCy = world.height * 0.72;
  const nebulaB = ctx.createRadialGradient(
    nebulaBCx,
    nebulaBCy,
    0,
    nebulaBCx,
    nebulaBCy,
    nebulaBRadius,
  );
  nebulaB.addColorStop(0, "rgba(255, 191, 71, 0.06)");
  nebulaB.addColorStop(1, "rgba(0, 0, 0, 0)");
  cache.nebulaB = nebulaB;
}

function fillNebula(gradient: CanvasGradient, x: number, y: number, radius: number): void {
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

export function drawBackground(): void {
  ensureGradients();

  ctx.fillStyle = cache.base!;
  ctx.fillRect(0, 0, world.width, world.height);

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  fillNebula(
    cache.nebulaA!,
    world.width * 0.16,
    world.height * 0.22,
    Math.min(world.width, world.height) * 0.62,
  );
  fillNebula(
    cache.nebulaB!,
    world.width * 0.84,
    world.height * 0.72,
    Math.min(world.width, world.height) * 0.5,
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
  ctx.beginPath();
  for (let x = offsetX; x < world.width + grid; x += grid) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, world.height);
  }
  for (let y = offsetY; y < world.height + grid; y += grid) {
    ctx.moveTo(0, y);
    ctx.lineTo(world.width, y);
  }
  ctx.stroke();
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
  ctx.beginPath();
  for (let x = sector; x < world.arenaWidth; x += sector) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, world.arenaHeight);
  }
  for (let y = sector; y < world.arenaHeight; y += sector) {
    ctx.moveTo(0, y);
    ctx.lineTo(world.arenaWidth, y);
  }
  ctx.stroke();
  ctx.restore();
}

const polyCache = new Map<number, Float32Array>();

function unitVertices(sides: number): Float32Array {
  let cached = polyCache.get(sides);
  if (cached) return cached;
  cached = new Float32Array(sides * 2);
  for (let i = 0; i < sides; i += 1) {
    const angle = -Math.PI / 2 + (Math.PI * 2 * i) / sides;
    cached[i * 2] = Math.cos(angle);
    cached[i * 2 + 1] = Math.sin(angle);
  }
  polyCache.set(sides, cached);
  return cached;
}

export function polygon(x: number, y: number, radius: number, sides: number): void {
  const verts = unitVertices(sides);
  ctx.beginPath();
  for (let i = 0; i < sides; i += 1) {
    const px = x + verts[i * 2]! * radius;
    const py = y + verts[i * 2 + 1]! * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

import { canvas, ctx, player, stars, world } from "../state";
import { clamp } from "../utils";

export function rebuildStars(): void {
  stars.length = 0;
  const count = Math.floor((world.width * world.height) / 5200);
  for (let i = 0; i < count; i += 1) {
    stars.push({
      x: Math.random() * world.width,
      y: Math.random() * world.height,
      size: Math.random() * 1.8 + 0.35,
      depth: Math.random() * 0.75 + 0.25,
      twinkle: Math.random() * Math.PI * 2,
    });
  }
}

export function updateCamera(dt: number, snap = false): void {
  const targetX = clamp(
    player.x - world.width / 2,
    0,
    Math.max(0, world.arenaWidth - world.width),
  );
  const targetY = clamp(
    player.y - world.height / 2,
    0,
    Math.max(0, world.arenaHeight - world.height),
  );
  const follow = snap ? 1 : 1 - Math.pow(0.0006, dt);
  world.cameraX += (targetX - world.cameraX) * follow;
  world.cameraY += (targetY - world.cameraY) * follow;
}

export function updateStars(dt: number): void {
  const driftX = -player.vx * 0.012;
  const driftY = -player.vy * 0.012 + 8;
  for (const star of stars) {
    star.twinkle += dt * (1.2 + star.depth);
    star.x += driftX * star.depth * dt * 60;
    star.y += driftY * star.depth * dt * 60;
    if (star.x < -4) star.x = world.width + 4;
    if (star.x > world.width + 4) star.x = -4;
    if (star.y < -4) star.y = world.height + 4;
    if (star.y > world.height + 4) star.y = -4;
  }
}

export function resize(): void {
  world.dpr = Math.min(window.devicePixelRatio || 1, 2);
  world.width = window.innerWidth;
  world.height = window.innerHeight;
  world.arenaWidth = Math.max(3200, Math.round(world.width * 3.2));
  world.arenaHeight = Math.max(2200, Math.round(world.height * 3.2));
  canvas.width = Math.floor(world.width * world.dpr);
  canvas.height = Math.floor(world.height * world.dpr);
  canvas.style.width = `${world.width}px`;
  canvas.style.height = `${world.height}px`;
  ctx.setTransform(world.dpr, 0, 0, world.dpr, 0, 0);

  if (!player.x || !player.y) {
    player.x = world.arenaWidth / 2;
    player.y = world.arenaHeight / 2;
  }
  player.x = clamp(player.x, player.radius + 8, world.arenaWidth - player.radius - 8);
  player.y = clamp(player.y, player.radius + 8, world.arenaHeight - player.radius - 8);
  updateCamera(0, true);

  rebuildStars();
}

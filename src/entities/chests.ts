import { chests, player, state, world } from "../state";
import { circleHit } from "../utils";
import { burst, pulseText } from "./particles";
import { showChest } from "../render/hud";

export function spawnChest(x: number, y: number): void {
  const angle = Math.random() * Math.PI * 2;
  const speed = 44 + Math.random() * 36;
  chests.push({
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    radius: 20,
    age: 0,
  });
}

export function updateChests(dt: number): void {
  const damp = 1 - dt * 1.8;
  for (let i = chests.length - 1; i >= 0; i -= 1) {
    const chest = chests[i]!;
    chest.age += dt;
    chest.x += chest.vx * dt;
    chest.y += chest.vy * dt;
    chest.vx *= damp;
    chest.vy *= damp;

    if (!circleHit(chest, player)) continue;

    chests.splice(i, 1);
    burst(chest.x, chest.y, "#ffbf47", 34, 280);
    pulseText(chest.x, chest.y - 30, "COFFRE", "#fff0b8");
    world.shake = Math.min(18, world.shake + 7);
    if (state.mode === "playing") {
      showChest();
    }
  }
}

export function resetChests(): void {
  chests.length = 0;
}

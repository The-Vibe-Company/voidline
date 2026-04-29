import { chests, player, state, world } from "../state";
import { circleHit } from "../utils";
import { burst, pulseText } from "./particles";
import { markChestReady, markHudDirty } from "../simulation/events";
import { acquireChest, releaseChest } from "../simulation/pools";
import { random } from "../simulation/random";

export function spawnChest(x: number, y: number): void {
  const angle = random() * Math.PI * 2;
  const speed = 44 + random() * 36;
  const chest = acquireChest();
  chest.x = x;
  chest.y = y;
  chest.vx = Math.cos(angle) * speed;
  chest.vy = Math.sin(angle) * speed;
  chest.radius = 20;
  chest.age = 0;
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

    const x = chest.x;
    const y = chest.y;
    releaseChest(i);
    burst(x, y, "#ffbf47", 34, 280);
    pulseText(x, y - 30, "COFFRE", "#fff0b8");
    world.shake = Math.min(18, world.shake + 7);
    if (state.mode === "playing") {
      markChestReady();
      markHudDirty();
    }
  }
}

export function resetChests(): void {
  chests.length = 0;
}

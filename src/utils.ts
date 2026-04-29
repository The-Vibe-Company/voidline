import { world } from "./state";
import { random } from "./simulation/random";

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function distanceSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export interface CircleLike {
  x: number;
  y: number;
  radius: number;
}

export function circleHit(a: CircleLike, b: CircleLike): boolean {
  const radius = a.radius + b.radius;
  return distanceSq(a.x, a.y, b.x, b.y) <= radius * radius;
}

export function screenToWorld(x: number, y: number): { x: number; y: number } {
  return {
    x: world.cameraX + x,
    y: world.cameraY + y,
  };
}

export function shuffle<T>(list: T[]): void {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [list[i]!, list[j]!] = [list[j]!, list[i]!];
  }
}

export function swapRemove<T>(list: T[], index: number): T {
  const item = list[index]!;
  const last = list.pop()!;
  if (index < list.length) {
    list[index] = last;
  }
  return item;
}

export function colorToNumber(color: string): number {
  return Number.parseInt(color.replace("#", ""), 16) || 0xffffff;
}

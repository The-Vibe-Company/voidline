import { update } from "../systems/waves";
import { render } from "../render/world";

let lastTime = performance.now();

function frame(now: number): void {
  const dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;
  update(dt);
  render();
  requestAnimationFrame(frame);
}

export function startLoop(): void {
  lastTime = performance.now();
  requestAnimationFrame(frame);
}

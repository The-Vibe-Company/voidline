import { update } from "../systems/waves";
import { render } from "../render/world";
import { perfStats, resetPerfFrame } from "../state";
import { isPerfOverlayEnabled, recordFrame } from "../render/perf-overlay";

let lastTime = performance.now();

export type FrameTickHook = (now: number, dt: number) => void;
let tickHook: FrameTickHook | null = null;

export function setFrameTickHook(hook: FrameTickHook | null): void {
  tickHook = hook;
}

function frame(now: number): void {
  const rawDt = (now - lastTime) / 1000;
  const dt = Math.min(0.033, rawDt);
  lastTime = now;
  resetPerfFrame();

  const t0 = performance.now();
  update(dt);
  const t1 = performance.now();
  render();
  const t2 = performance.now();

  perfStats.updateMs = t1 - t0;
  perfStats.renderMs = t2 - t1;
  perfStats.frameMs = t2 - t0;

  if (isPerfOverlayEnabled()) {
    recordFrame(now, rawDt);
  }
  if (tickHook) {
    tickHook(now, dt);
  }
  requestAnimationFrame(frame);
}

export function startLoop(): void {
  lastTime = performance.now();
  requestAnimationFrame(frame);
}

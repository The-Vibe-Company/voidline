import { world } from "../state";

export const HITSTOP_KILL = 0.05;
export const HITSTOP_BOSS_KILL = 0.18;
export const KILLCAM_DURATION = 1.5;
export const KILLCAM_TIMESCALE = 0.25;

export function triggerHitstop(duration: number): void {
  world.hitstop = Math.max(world.hitstop, duration);
}

export function triggerKillCam(): void {
  world.timescale = KILLCAM_TIMESCALE;
  world.hitstop = Math.max(world.hitstop, KILLCAM_DURATION);
}

export function tickWorldFx(realDt: number): number {
  if (world.hitstop > 0) {
    world.hitstop = Math.max(0, world.hitstop - realDt);
  }
  if (world.timescale < 1) {
    world.timescale = Math.min(1, world.timescale + realDt * 0.6);
  }
  if (world.hitstop > 0) return 0;
  return realDt * world.timescale;
}

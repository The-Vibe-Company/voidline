import { mulberry32 } from "../perf/rng";

let randomSource: () => number = Math.random;

export function random(): number {
  return randomSource();
}

export function setSimulationSeed(seed?: number): void {
  randomSource = Number.isFinite(seed) ? mulberry32(seed!) : Math.random;
}

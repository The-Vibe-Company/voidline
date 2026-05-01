import { bench } from "vitest";
import { resetSimulation, stepSimulation } from "../simulation/simulation";

function prepareRun(seed: number): void {
  resetSimulation(seed);
}

bench("rust engine: simulate 60 fixed frames", () => {
  prepareRun(123);
  for (let i = 0; i < 60; i += 1) {
    stepSimulation(1 / 60);
  }
});

import { bench } from "vitest";
import { resetSimulation, startSimulationWave, stepSimulation } from "../simulation/simulation";

function prepareRun(seed: number): void {
  resetSimulation(seed);
  startSimulationWave(1);
}

bench("rust engine: simulate 60 fixed frames", () => {
  prepareRun(123);
  for (let i = 0; i < 60; i += 1) {
    stepSimulation(1 / 60);
  }
});

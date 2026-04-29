import {
  resetSimulation,
  startSimulationWave,
  stepSimulation,
} from "../simulation/simulation";
import { hideOverlays, updateHud, updateLoadout } from "../render/hud";

export function startWave(wave: number): void {
  startSimulationWave(wave);
  updateHud();
}

export function resetGame(): void {
  resetSimulation();
  hideOverlays();
  updateLoadout();
  updateHud();
}

export function update(dt: number): void {
  stepSimulation(dt);
}

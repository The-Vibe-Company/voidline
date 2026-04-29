import * as Phaser from "phaser";
import { canvas, simulationPerfConfig, world } from "../state";
import { resizeSimulation } from "../simulation/simulation";
import { BattleScene } from "./scenes/BattleScene";
import { BootScene } from "./scenes/BootScene";

export function createVoidlineGame(): Phaser.Game {
  resizeSimulation(window.innerWidth, window.innerHeight);

  const game = new Phaser.Game({
    type: Phaser.WEBGL,
    canvas,
    width: world.width,
    height: world.height,
    backgroundColor: "#05060b",
    scene: [BootScene, BattleScene],
    banner: false,
    audio: {
      noAudio: true,
    },
    scale: {
      mode: Phaser.Scale.NONE,
      width: world.width,
      height: world.height,
    },
    render: {
      antialias: false,
      pixelArt: false,
      roundPixels: false,
      powerPreference: "high-performance",
    },
  });

  window.addEventListener("resize", () => {
    resizeSimulation(window.innerWidth, window.innerHeight);
    game.scale.resize(world.width, world.height);
  });

  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.touchAction = "none";
  canvas.dataset.dprMax = String(simulationPerfConfig.dprMax);

  return game;
}

import * as Phaser from "phaser";
import { canvas, world } from "../state";
import { BattleScene } from "./scenes/BattleScene";
import { BootScene } from "./scenes/BootScene";

export function createVoidlineGame(): Phaser.Game {
  syncCanvasSize();

  const game = new Phaser.Game({
    type: Phaser.WEBGL,
    canvas,
    width: world.width,
    height: world.height,
    backgroundColor: "#05060b",
    scene: [BootScene, BattleScene],
    banner: false,
    audio: { noAudio: true },
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
    syncCanvasSize();
    game.scale.resize(world.width, world.height);
  });

  canvas.style.touchAction = "none";

  return game;
}

function syncCanvasSize(): void {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(320, Math.round(rect.width));
  const height = Math.max(240, Math.round(rect.height));
  world.width = width;
  world.height = height;
  world.arenaWidth = width;
  world.arenaHeight = height;
  world.cameraX = 0;
  world.cameraY = 0;
  world.dpr = Math.min(2, window.devicePixelRatio || 1);
}

import { beforeEach, describe, expect, it } from "vitest";
import { bullets, enemies, player, world } from "../state";
import { createPlayerState } from "../game/balance";
import type { EnemyEntity } from "../types";
import { fireVolley } from "./player";

function enemyAt(x: number, y: number): EnemyEntity {
  return {
    id: 1,
    kind: "scout",
    score: 35,
    radius: 14,
    hp: 100,
    maxHp: 100,
    speed: 0,
    damage: 0,
    color: "#ff5a69",
    accent: "#ffd0d5",
    sides: 3,
    x,
    y,
    age: 0,
    seed: 0,
    wobble: 0,
    wobbleRate: 0,
    hit: 0,
  };
}

function resetWorld(): void {
  world.arenaWidth = 3200;
  world.arenaHeight = 2200;
  Object.assign(player, createPlayerState({ x: 1600, y: 1100 }));
  bullets.length = 0;
  enemies.length = 0;
}

describe("player synergy fire modes", () => {
  beforeEach(resetWorld);

  it("gives drone swarm shots light pierce", () => {
    player.traits.droneSwarm = true;
    player.pierce = 0;
    enemies.push(enemyAt(player.x + 100, player.y));

    fireVolley(player.x, player.y, 0, true);

    expect(bullets).toHaveLength(1);
    expect(bullets[0]!.source).toBe("drone");
    expect(bullets[0]!.pierce).toBe(1);
  });
});

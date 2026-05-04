import "./rng-seed.mjs";
import { reseed } from "./rng-seed.mjs";
import { FrameReader, writeFrame } from "./framing.mjs";

const storage = new Map();
globalThis.localStorage = {
  getItem(key) {
    return storage.has(key) ? storage.get(key) : null;
  },
  setItem(key, value) {
    storage.set(key, String(value));
  },
  removeItem(key) {
    storage.delete(key);
  },
};

const stateModule = await import("../../src/state.ts");
const waveFlow = await import("../../src/game/wave-flow.ts");
const waveLoop = await import("../../src/game/wave-loop.ts");
const account = await import("../../src/systems/account.ts");
const weaponCatalog = await import("../../src/game/weapon-catalog.ts");

const {
  state,
  world,
  pointer,
  player,
  enemies,
  experienceOrbs,
  enemyBullets,
  attackTelegraphs,
  spawnIndicators,
  bullets,
  particles,
  floaters,
  counters,
} = stateModule;

let rewardAwarded = false;

world.width = world.arenaWidth = 1280;
world.height = world.arenaHeight = 720;
world.cameraX = 0;
world.cameraY = 0;
world.dpr = 1;
state.controlMode = "trackpad";
pointer.inside = true;
account.initializeAccountProgress();

function resetRuntime() {
  waveLoop.clearRunEntities();
  bullets.length = 0;
  particles.length = 0;
  floaters.length = 0;
  counters.nextEnemyId = 1;
  counters.nextBulletId = 1;
  counters.nextExperienceId = 1;
  counters.nextParticleId = 1;
  counters.nextFloaterId = 1;
  Object.assign(state, {
    mode: "menu",
    controlMode: "trackpad",
    miniWaveIndex: 0,
    miniWaveCount: 6,
    waveTimer: 0,
    waveTotalDuration: 0,
    enemiesAlive: 0,
    spawnTimer: 0,
    spawnsRemaining: 0,
    picksTaken: 0,
    score: 0,
    kills: 0,
    xpCollected: 0,
    bossDefeated: false,
    runStartedAt: 0,
    runElapsedSeconds: 0,
    dailySeed: "",
    rngState: 1,
    starterWeaponId: "pulse",
  });
  rewardAwarded = false;
  pointer.inside = true;
}

function setMetaLevels() {
  // No meta levels in the 90s pivot.
}

function aggregatedPlayerStats() {
  const eff = weaponCatalog.effectiveWeaponStats(player.activeWeapon, player);
  const shotsPerSec = eff.fireRate * eff.projectileCount;
  return {
    damage: eff.damage,
    fireRate: eff.fireRate,
    range: eff.range,
    projectileCount: eff.projectileCount,
    pierce: eff.pierce,
    critChance: eff.critChance,
    shotsPerSec,
  };
}

function snapshot() {
  const agg = aggregatedPlayerStats();
  const reportedWave = state.miniWaveIndex + 1;
  const reportedMode = state.mode === "card-pick" ? "shop" : state.mode;
  return {
    schema_version: 1,
    mode: reportedMode,
    wave: reportedWave,
    waveTimer: state.waveTimer,
    runElapsed: state.runElapsedSeconds,
    score: state.score,
    currency: state.xpCollected,
    hp: player.hp,
    maxHp: player.maxHp,
    player: {
      x: player.x,
      y: player.y,
      speed: player.speed,
      damage: agg.damage,
      fireRate: agg.fireRate,
      range: agg.range,
      projectileCount: agg.projectileCount,
      pierce: agg.pierce,
      critChance: agg.critChance,
    },
    enemies: enemies.map((enemy) => ({
      id: enemy.id,
      kind: enemy.kind,
      x: enemy.x,
      y: enemy.y,
      radius: enemy.radius,
      hp: enemy.hp,
      maxHp: enemy.maxHp,
      speed: enemy.speed,
      damage: enemy.damage,
      isBoss: enemy.isBoss,
      attackState: enemy.attackState,
      attackProgress: enemy.attackProgress,
      attackTargetX: enemy.attackTargetX,
      attackTargetY: enemy.attackTargetY,
      bossShotTimer: enemy.bossShotTimer ?? null,
      bossSpawnTimer: enemy.bossSpawnTimer ?? null,
    })),
    orbs: experienceOrbs.map((orb) => ({
      id: orb.id,
      x: orb.x,
      y: orb.y,
      value: orb.value,
    })),
    enemyBullets: enemyBullets.map((bullet) => ({
      id: bullet.id,
      x: bullet.x,
      y: bullet.y,
      vx: bullet.vx,
      vy: bullet.vy,
      radius: bullet.radius,
      damage: bullet.damage,
      life: bullet.life,
    })),
    weapons: [
      {
        defId: player.activeWeapon.defId,
        tier: player.activeWeapon.tier,
      },
    ],
    attackTelegraphs: attackTelegraphs.map((tel) => ({
      id: tel.id,
      shape: tel.shape,
      x: tel.x,
      y: tel.y,
      radius: tel.radius,
      angle: tel.angle,
      length: tel.length,
      life: tel.life,
      maxLife: tel.maxLife,
    })),
    spawnIndicators: spawnIndicators.map((ind) => ({
      id: ind.id,
      x: ind.x,
      y: ind.y,
      kind: ind.kind,
      isBoss: ind.isBoss,
      radius: ind.radius,
      life: ind.life,
    })),
  };
}

function shopState() {
  const offers = waveFlow.getPendingOffers();
  const cards = offers
    ? offers.map((offer, idx) => ({
        id: `card:${offer.card.id}`,
        cost: 0,
        kind: "upgrade",
        cardIndex: idx,
      }))
    : [];
  return {
    schema_version: 1,
    offers: cards,
    rerollCost: 9999,
    currency: state.xpCollected,
  };
}

async function handle(message) {
  const payload = message.payload ?? {};
  switch (message.cmd) {
    case "init":
      resetRuntime();
      reseed(payload.seed ?? 1);
      setMetaLevels();
      waveFlow.startRun(payload.starter ?? "pulse");
      pointer.inside = true;
      return snapshot();
    case "tick":
      pointer.x = Number(payload.pointerX);
      pointer.y = Number(payload.pointerY);
      pointer.inside = true;
      waveLoop.stepWave(Number(payload.dt ?? 1 / 60));
      return snapshot();
    case "snapshot":
      return snapshot();
    case "shop_state":
      return shopState();
    case "buy": {
      const idx = Number(payload.idx);
      const offers = waveFlow.getPendingOffers();
      if (!offers) return { schema_version: 1, ok: false };
      if (!Number.isInteger(idx) || idx < 0 || idx >= offers.length) {
        return { schema_version: 1, ok: false };
      }
      waveFlow.applyCardAndAdvance(idx);
      return { schema_version: 1, ok: true };
    }
    case "reroll":
      return { schema_version: 1, ok: false };
    case "next_wave": {
      const offers = waveFlow.getPendingOffers();
      if (offers) waveFlow.applyCardAndAdvance(0);
      pointer.inside = true;
      return snapshot();
    }
    case "gameover_summary": {
      if (!rewardAwarded) {
        account.recordRun({
          miniWaveReached: state.miniWaveIndex + (state.bossDefeated ? 1 : 0),
          bossDefeated: state.bossDefeated,
          score: state.score,
          elapsedSeconds: state.runElapsedSeconds,
          kills: state.kills,
        });
        rewardAwarded = true;
      }
      return {
        schema_version: 1,
        wave: state.miniWaveIndex + 1,
        score: state.score,
        elapsed: state.runElapsedSeconds,
        crystalsGained: 0,
        totalCrystals: 0,
      };
    }
    case "purchase_meta":
      return { schema_version: 1, result: { ok: false, reason: "deprecated" } };
    case "reset":
      resetRuntime();
      account.initializeAccountProgress();
      return { schema_version: 1, ok: true };
    default:
      throw new Error(`unknown command: ${message.cmd}`);
  }
}

const reader = new FrameReader(process.stdin);
while (true) {
  const message = await reader.next();
  if (message === null) break;
  try {
    writeFrame(process.stdout, await handle(message));
  } catch (error) {
    writeFrame(process.stdout, {
      schema_version: 1,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

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
const shop = await import("../../src/game/shop.ts");
const account = await import("../../src/systems/account.ts");
const metaCatalog = await import("../../src/game/meta-upgrade-catalog.ts");
const weaponCatalog = await import("../../src/game/weapon-catalog.ts");

const { state, world, pointer, player, enemies, experienceOrbs, bullets, particles, floaters, counters } = stateModule;
let rewardAwarded = false;

world.width = world.arenaWidth = 1600;
world.height = world.arenaHeight = 1100;
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
    wave: 1,
    waveTimer: 0,
    waveTotalDuration: 0,
    enemiesAlive: 0,
    spawnTimer: 0,
    spawnsRemaining: 0,
    runCurrency: 0,
    carriedXp: 0,
    pendingCarry: 0,
    score: 0,
    highestWaveReached: 1,
    runElapsedSeconds: 0,
  });
  shop.resetShopState();
  rewardAwarded = false;
  pointer.inside = true;
}

function setMetaLevels(metaLevels = {}) {
  account.accountProgress.crystals = 0;
  account.accountProgress.spentCrystals = 0;
  account.accountProgress.upgradeLevels = {};
  const allowed = new Map(metaCatalog.metaUpgradeCatalog.map((upgrade) => [upgrade.id, upgrade.maxLevel]));
  for (const [id, level] of Object.entries(metaLevels ?? {})) {
    const maxLevel = allowed.get(id);
    if (maxLevel === undefined) {
      throw new Error(`Unknown meta upgrade: ${id}`);
    }
    const n = Math.max(0, Math.min(maxLevel, Math.floor(Number(level))));
    if (n > 0) account.accountProgress.upgradeLevels[id] = n;
  }
}

function aggregatedPlayerStats() {
  if (!player.weapons || player.weapons.length === 0) {
    return {
      damage: 0,
      fireRate: 0,
      range: 0,
      projectileCount: 0,
      pierce: 0,
      critChance: 0,
    };
  }
  let weightedDamage = 0;
  let totalShotsPerSec = 0;
  let totalFireRate = 0;
  let maxRange = 0;
  let totalProjectiles = 0;
  let totalPierce = 0;
  let maxCrit = 0;
  for (const weapon of player.weapons) {
    const eff = weaponCatalog.effectiveWeaponStats(weapon, player);
    const shotsPerSec = eff.fireRate * eff.projectileCount;
    weightedDamage += eff.damage * shotsPerSec;
    totalShotsPerSec += shotsPerSec;
    totalFireRate += eff.fireRate;
    if (eff.range > maxRange) maxRange = eff.range;
    totalProjectiles += eff.projectileCount;
    totalPierce += eff.pierce;
    if (eff.critChance > maxCrit) maxCrit = eff.critChance;
  }
  const avgDamage = totalShotsPerSec > 0 ? weightedDamage / totalShotsPerSec : 0;
  return {
    damage: avgDamage,
    fireRate: totalFireRate,
    range: maxRange,
    projectileCount: totalProjectiles,
    pierce: totalPierce,
    critChance: maxCrit,
  };
}

function snapshot() {
  const agg = aggregatedPlayerStats();
  return {
    schema_version: 1,
    mode: state.mode,
    wave: state.wave,
    waveTimer: state.waveTimer,
    runElapsed: state.runElapsedSeconds,
    score: state.score,
    currency: state.runCurrency,
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
    })),
    orbs: experienceOrbs.map((orb) => ({
      id: orb.id,
      x: orb.x,
      y: orb.y,
      value: orb.value,
    })),
  };
}

function shopState() {
  return {
    schema_version: 1,
    offers: shop.currentShopOffers().map((offer) => {
      if (offer.kind === "weapon") {
        return {
          id: `weapon:${offer.defId}:t${offer.tier}`,
          cost: offer.cost,
          kind: "weapon",
          defId: offer.defId,
          tier: offer.tier,
          action: offer.action,
        };
      }
      return {
        id: offer.upgrade.id,
        cost: offer.cost,
        kind: "upgrade",
      };
    }),
    rerollCost: shop.currentRerollCost(),
    currency: state.runCurrency,
  };
}

async function handle(message) {
  const payload = message.payload ?? {};
  switch (message.cmd) {
    case "init":
      resetRuntime();
      reseed(payload.seed ?? 1);
      setMetaLevels(payload.metaLevels ?? {});
      waveFlow.startRun();
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
    case "buy":
      return { schema_version: 1, ok: shop.tryBuyOffer(Number(payload.idx)) };
    case "reroll":
      return { schema_version: 1, ok: shop.tryRerollShop() };
    case "next_wave":
      waveFlow.advanceFromShop();
      pointer.inside = true;
      return snapshot();
    case "gameover_summary": {
      let reward = account.accountProgress.lastRunReward ?? { crystalsGained: 0 };
      if (!rewardAwarded) {
        reward = account.awardRunCrystals({
          wave: state.highestWaveReached,
          score: state.score,
          elapsedSeconds: state.runElapsedSeconds,
        });
        rewardAwarded = true;
      }
      return {
        schema_version: 1,
        wave: state.highestWaveReached,
        score: state.score,
        elapsed: state.runElapsedSeconds,
        crystalsGained: reward.crystalsGained,
        totalCrystals: account.accountProgress.crystals,
      };
    }
    case "purchase_meta":
      return { schema_version: 1, result: account.purchaseMetaUpgrade(String(payload.id)) };
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

import initWasm, {
  applyRunReward,
  WasmEngine,
} from "../generated/voidline-wasm/voidline_wasm.js";
import balanceBundle from "../../data/balance.json";
import {
  bullets,
  chests,
  counters,
  enemies,
  experienceOrbs,
  floaters,
  keys,
  ownedRelics,
  ownedUpgrades,
  particles,
  player,
  pointer,
  powerupOrbs,
  simulationPerfConfig,
  state,
  unlockedRelics,
  world,
} from "../state";
import { findRelic } from "../game/relic-catalog";
import { findUpgrade } from "../game/upgrade-catalog";
import { upgradeTiers } from "../game/balance";
import {
  accountProgress,
  currentLevelUpChoiceCount,
  currentRarityRank,
  currentUnlockedBuildTags,
  currentUnlockedTechnologyIds,
} from "../systems/account";
import type {
  AccountProgress,
  AccountReward,
  AccountRunSummary,
  Bullet,
  ChestEntity,
  EnemyEntity,
  ExperienceOrb,
  GameMode,
  OwnedRelic,
  OwnedUpgrade,
  PowerupOrb,
  RelicChoice,
  SimulationConfig,
  UpgradeChoice,
} from "../types";

interface RustEngineAccountContext {
  selectedCharacterId: string;
  selectedWeaponId: string;
  selectedStartStage: number;
  highestStartStageUnlocked: number;
  rarityRank: number;
  unlockedTechnologyIds: string[];
  unlockedBuildTags: string[];
  unlockedRelicIds: string[];
  levelUpChoiceCount: number;
}

interface RustRewardResult {
  progress: Pick<
    AccountProgress,
    | "crystals"
    | "spentCrystals"
    | "upgradeLevels"
    | "selectedCharacterId"
    | "selectedWeaponId"
    | "selectedStartStage"
    | "highestStageCleared"
    | "highestStartStageUnlocked"
    | "records"
  >;
  reward: AccountReward;
}

interface RustEngineConfig {
  seed?: number;
  width?: number;
  height?: number;
  dpr?: number;
  account: RustEngineAccountContext;
}

interface RustStressConfig {
  enemies: number;
  bullets: number;
  orbs: number;
  seed: number;
  magnet: boolean;
}

interface RustSnapshot {
  state: {
    mode: GameMode;
    pressure: number;
    stage: number;
    startStage: number;
    stageElapsedSeconds: number;
    runElapsedSeconds: number;
    stageBossSpawned: boolean;
    stageBossActive: boolean;
    highestStageReached: number;
    score: number;
    phaseKills: number;
    killsByKind: Partial<Record<"scout" | "hunter" | "brute", number>>;
    enemyPressureTarget: number;
    spawnTimer: number;
    spawnGap: number;
    bestCombo: number;
    miniBossEligibleMisses: number;
    miniBossPending: boolean;
    miniBossLastPressure: number;
    controlMode: "keyboard" | "trackpad";
    level: number;
    xp: number;
    xpTarget: number;
    pendingUpgrades: number;
    pendingChests: number;
    heartsCarried: number;
    magnetsCarried: number;
    bombsCarried: number;
    runBossStages: number[];
    runRewardClaimed: boolean;
  };
  world: typeof world;
  player: typeof player;
  enemies: EnemyEntity[];
  bullets: Array<Omit<Bullet, "hitIds"> & { hitIds: number[] }>;
  experienceOrbs: ExperienceOrb[];
  powerupOrbs: PowerupOrb[];
  chests: ChestEntity[];
  counters: {
    nextEnemyId: number;
    nextBulletId: number;
    nextExperienceId: number;
    nextPowerupId: number;
    nextChestId: number;
  };
  ownedUpgrades: Array<{
    upgradeId: string;
    tierId: string;
    tierPower: number;
    count: number;
  }>;
  ownedRelics: Array<{
    relicId: string;
    count: number;
  }>;
}

interface RustUpgradeChoiceRecord {
  upgradeId: string;
  tierId: string;
}

interface RustRelicChoiceRecord {
  relicId: string;
}

let initPromise: Promise<void> | null = null;
let engine: WasmEngine | null = null;
let enabled = false;
let lastSnapshot: RustSnapshot | null = null;
const MAX_U32_EXCLUSIVE = 0x100000000;

export async function initializeRustSimulationEngine(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    await initWasm();
    enabled = true;
  })();
  return initPromise;
}

export function createRustSimulation(config: SimulationConfig = {}): void {
  assertWasmLoaded();
  engine = new WasmEngine(JSON.stringify(balanceBundle), buildConfig(config));
  syncRustSnapshot({ preserveModalMode: true });
}

export function resetRustSimulation(seed?: number): void {
  const rustEngine = assertEngine();
  rustEngine.reset(seed ?? randomSeed(), buildAccountContext());
  syncRustSnapshot({ preserveModalMode: false });
}

export function resizeRustSimulation(width: number, height: number): void {
  const rustEngine = assertEngine();
  const dpr = Math.min(window.devicePixelRatio || 1, simulationPerfConfig.dprMax);
  rustEngine.resize(width, height, dpr);
  syncRustSnapshot({ preserveModalMode: true });
}

export function stepRustSimulation(dt: number): void {
  const rustEngine = assertEngine();
  rustEngine.setInput({
    keys: [...keys],
    pointerX: pointer.x,
    pointerY: pointer.y,
    pointerInside: pointer.inside,
    controlMode: state.controlMode,
  });
  rustEngine.step(dt);
  syncRustSnapshot({ preserveModalMode: true });
}

export function seedRustStress(config: RustStressConfig): void {
  const rustEngine = assertEngine();
  rustEngine.seedStress(config);
  syncRustSnapshot({ preserveModalMode: false });
}

export function draftRustUpgrades(count: number): UpgradeChoice[] {
  const rustEngine = assertEngine();
  syncRustAccountContext(rustEngine);
  const records = rustEngine.draftUpgrades(count) as RustUpgradeChoiceRecord[];
  return records.map((record) => {
    const upgrade = findUpgrade(record.upgradeId);
    const tier = upgradeTiers.find((candidate) => candidate.id === record.tierId);
    if (!tier) throw new Error(`Unknown Rust upgrade tier: ${record.tierId}`);
    return { upgrade, tier };
  });
}

export function applyRustUpgrade(choice: UpgradeChoice): void {
  assertEngine().applyUpgrade(choice.upgrade.id, choice.tier.id);
  syncRustSnapshot({ preserveModalMode: true });
}

export function draftRustRelics(count: number): RelicChoice[] {
  const rustEngine = assertEngine();
  syncRustAccountContext(rustEngine);
  const records = rustEngine.draftRelics(count) as RustRelicChoiceRecord[];
  return records.map((record) => ({ relic: findRelic(record.relicId) }));
}

export function applyRustRelic(choice: RelicChoice): void {
  assertEngine().applyRelic(choice.relic.id);
  syncRustSnapshot({ preserveModalMode: true });
}

export function currentRustSnapshot(): RustSnapshot | null {
  return lastSnapshot;
}

export function applyRustRunReward(
  progress: AccountProgress,
  summary: AccountRunSummary,
): RustRewardResult {
  assertWasmLoaded();
  return applyRunReward(
    {
      crystals: progress.crystals,
      spentCrystals: progress.spentCrystals,
      upgradeLevels: progress.upgradeLevels,
      selectedCharacterId: progress.selectedCharacterId,
      selectedWeaponId: progress.selectedWeaponId,
      selectedStartStage: progress.selectedStartStage,
      highestStageCleared: progress.highestStageCleared,
      highestStartStageUnlocked: progress.highestStartStageUnlocked,
      records: progress.records,
    },
    {
      ...summary,
      bossStages: [...summary.bossStages],
    },
  ) as RustRewardResult;
}

function assertWasmLoaded(): void {
  if (!enabled) {
    throw new Error("Rust WASM engine is required before running gameplay.");
  }
}

function assertEngine(): WasmEngine {
  assertWasmLoaded();
  if (!engine) {
    throw new Error("Rust gameplay engine has not been created.");
  }
  return engine;
}

function syncRustAccountContext(rustEngine: WasmEngine): void {
  rustEngine.updateAccount(buildAccountContext());
}

function buildConfig(config: SimulationConfig): RustEngineConfig {
  return {
    seed: config.seed,
    width: world.width || window.innerWidth,
    height: world.height || window.innerHeight,
    dpr: world.dpr || window.devicePixelRatio || 1,
    account: buildAccountContext(),
  };
}

function buildAccountContext(): RustEngineAccountContext {
  return {
    selectedCharacterId: accountProgress.selectedCharacterId,
    selectedWeaponId: accountProgress.selectedWeaponId,
    selectedStartStage: accountProgress.selectedStartStage,
    highestStartStageUnlocked: accountProgress.highestStartStageUnlocked,
    rarityRank: currentRarityRank(),
    unlockedTechnologyIds: [...currentUnlockedTechnologyIds()],
    unlockedBuildTags: [...currentUnlockedBuildTags()],
    unlockedRelicIds: [...unlockedRelics],
    levelUpChoiceCount: currentLevelUpChoiceCount(),
  };
}

function syncRustSnapshot(options: { preserveModalMode: boolean }): void {
  if (!engine) return;
  const snapshot = engine.snapshot() as RustSnapshot;
  lastSnapshot = snapshot;
  syncWorld(snapshot);
  syncState(snapshot, options.preserveModalMode);
  Object.assign(player, snapshot.player);
  syncList(enemies, snapshot.enemies);
  syncList(
    bullets,
    snapshot.bullets.map((bullet) => ({
      ...bullet,
      hitIds: new Set(bullet.hitIds),
    })),
  );
  syncList(experienceOrbs, snapshot.experienceOrbs);
  syncList(powerupOrbs, snapshot.powerupOrbs);
  syncList(chests, snapshot.chests);
  syncLoadout(snapshot);
  counters.nextEnemyId = snapshot.counters.nextEnemyId;
  counters.nextBulletId = snapshot.counters.nextBulletId;
  counters.nextExperienceId = snapshot.counters.nextExperienceId;
  counters.nextPowerupId = snapshot.counters.nextPowerupId;
  counters.nextChestId = snapshot.counters.nextChestId;
}

function syncWorld(snapshot: RustSnapshot): void {
  Object.assign(world, snapshot.world);
}

function syncState(snapshot: RustSnapshot, preserveModalMode: boolean): void {
  const localMode = state.mode;
  const showPickupZones = state.showPickupZones;
  Object.assign(state, snapshot.state);
  state.showPickupZones = showPickupZones;
  if (
    preserveModalMode &&
    (localMode === "upgrade" ||
      localMode === "chest" ||
      localMode === "paused" ||
      localMode === "menu")
  ) {
    state.mode = localMode;
  }
  state.killsByKind = {
    scout: snapshot.state.killsByKind.scout ?? 0,
    hunter: snapshot.state.killsByKind.hunter ?? 0,
    brute: snapshot.state.killsByKind.brute ?? 0,
  };
}

function syncLoadout(snapshot: RustSnapshot): void {
  ownedUpgrades.clear();
  for (const record of snapshot.ownedUpgrades) {
    const upgrade = findUpgrade(record.upgradeId);
    const tier = upgradeTiers.find((candidate) => candidate.id === record.tierId);
    if (!tier) continue;
    const owned: OwnedUpgrade = { upgrade, tier, count: record.count };
    ownedUpgrades.set(`${record.upgradeId}:${record.tierId}`, owned);
  }

  ownedRelics.clear();
  for (const record of snapshot.ownedRelics) {
    const relic = findRelic(record.relicId);
    const owned: OwnedRelic = { relic, count: record.count };
    ownedRelics.set(record.relicId, owned);
  }
}

function syncList<T>(target: T[], next: T[]): void {
  target.length = 0;
  target.push(...next);
}

export function clearRustVisualState(): void {
  particles.length = 0;
  floaters.length = 0;
}

function randomSeed(): number {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues) {
    const values = new Uint32Array(1);
    cryptoApi.getRandomValues(values);
    return values[0]!;
  }
  return Math.floor(Math.random() * MAX_U32_EXCLUSIVE);
}

# Voidline — Rust simulation harness

This Cargo workspace mirrors the TypeScript gameplay simulation in Rust so
we can run **100k+ meta-progression campaigns in seconds** for balance
analysis, with future room for an RL agent on the same env.

## Why

The TS sim is slow (~0.4-1.2s per trial) because it lives inside Vitest +
Node. The Rust port runs at ~5-30ms per trial, parallelized across cores
via rayon. This unlocks meaningful meta-progression analysis (how long does
a player take to unlock category L4? Are there frustration ravines?).

## Architecture

```
data/
└── balance.json              # SOURCE OF TRUTH (generated from balance.ts)

sim/
├── Cargo.toml                # workspace
└── crates/
    ├── voidline-data/        # serde types mirroring balance.json
    ├── voidline-sim/         # gameplay simulation (no rendering)
    ├── voidline-meta/        # meta-progression env + policies + campaigns
    └── voidline-cli/         # binary that emits the report
```

### Single source of truth

All knobs and effects live in `balance.json`, generated from
`src/game/balance.ts` + catalog files via `npm run data:export`. Rust reads
that file via `voidline-data::load_default()`. Changing a knob is a
one-file edit on the TS side; re-export and Rust automatically picks up the
new values at next build/run.

### Declarative effect DSL

Upgrades, relics, characters, and weapons no longer ship JS closures —
their effects are arrays of `EffectOp` (defined in `effect-dsl.ts` and
`voidline-data/src/dsl.rs`). Both the TS sim and the Rust sim run the same
interpreter on the same data. Adding a new upgrade is **0 code in Rust**:
add the entry to `upgrade-catalog.ts` with an `effects: EffectOp[]` array,
re-run `npm run data:export`, and the Rust sim picks it up.

## Crates

### `voidline-data`

Pure data types. No simulation logic. Exposes:

- `load_default() -> DataBundle` — reads `data/balance.json`
- `Balance`, `Upgrade`, `Relic`, `Character`, `Weapon`, `MetaUpgrade`,
  `BossDef`, `EnemyType`, `EffectOp`, etc.

Tests verify the JSON loads, contains no NaN/negative numbers, and parses
into the typed DSL variants.

### `voidline-sim`

Rust gameplay engine used by the browser WASM runtime and Node/headless
balance tools. TypeScript owns rendering, input, menus, and UI wrappers.

| Module | Responsibility |
|---|---|
| `rng` | `src/perf/rng.ts` (mulberry32 PRNG) |
| `math` | `src/utils.ts` (clamp, distance, circle_hit) |
| `balance_curves` | `balance.ts` formulas (waveTarget, scaledEnemyStats…) |
| `effects` | `effect-dsl.ts` interpreter |
| `player` | `Player` struct + `recomputeMultiplicativeStats` |
| `entities` | Enemy, Bullet, ExperienceOrb, PowerupOrb, ChestEntity |
| `state` / `world` | GameState + EntityCounters + World |
| `spatial_grid` | Runtime broad-phase lookup for collisions and pickups |
| `pools` | Runtime acquire/release with swap_remove |
| `spawn` | Enemy and elite spawn selection |
| `bullets` / `enemies` | update loops + collisions + synergies |
| `experience` / `powerups` / `chests` | drop + pickup + apply |
| `synergies` | build-tag synergy detection |
| `progression` | XP collection + level-up |
| `roguelike` | startingWaveForStage + miniBoss eligibility |
| `simulation` | `Sim` orchestrator owning all state; `step()` |

Tests target known TS reference values from `balance.test.ts`:
- `wave_target(10) == 96`
- `scaled_enemy_stats(scout, 10).hp == 69.51`
- `kinetic-shield standard → maxHp=120, hp=53`
- mulberry32 first 8 values match Node V8 exactly

### `voidline-meta`

Meta-progression layer:

- `AccountSnapshot` — crystals, upgrade levels, weapon/character selection
- Crystal reward calculation mirroring `account-progression.ts`
- `MetaProgressionEnv` — Gym-like `state/step/reset` API
  - `step(Purchase(id))` → buys a meta-upgrade (validates can_purchase)
  - `step(NextRun)` → spawns a `Sim`, applies char/weapon DSL effects to
    the player, runs until death/timeout, applies crystal reward
- 4 policies: `RandomPolicy`, `GreedyCheapPolicy`,
  `FocusedAttackPolicy`, `HoarderPolicy`
- `run_meta_campaign` — drives the env with a policy for N runs, captures
  the timeline (which meta-upgrade unlocked at which run, milestone runs)

### `voidline-cli`

Binary that ties it all together:

```sh
sim/target/release/voidline-cli --quick   # 4 × 15 × 25, max_wave=12
sim/target/release/voidline-cli --default # 4 × 50 × 40, max_wave=30, ~30s budget
```

Or via npm wrappers:

```sh
npm run balance:meta-report:quick
npm run balance:meta-report
```

Output: `scripts/meta-progression-report.json` with per-policy aggregates
(median/P25/P75 unlock times, median wave at run index, milestones, death
rates).

## How to maintain (the "intelligently" part)

### Changing a balance knob

1. Edit `src/game/balance.ts` (one number)
2. `npm run data:export` (writes `data/balance.json`)
3. `npm run data:check` confirms no drift
4. `cargo test --workspace` — Rust picks up the new values automatically

No Rust edit needed. **Zero divergence risk.**

### Adding a new upgrade

1. Add entry to `src/game/upgrade-catalog.ts` with `effects: EffectOp[]`
2. `npm run data:export`
3. Done. Rust sim already understands all 9 effect types.

### Adding a new enemy kind

1. Add to `enemyTypes` in `balance.ts` and to `enemySpawnRules`
2. Add the kind to `EnemyKind` enum in `voidline-sim/src/entities.rs`
3. `npm run data:export`
4. `cargo test --workspace`

(2 file edits in Rust because EnemyKind is an enum used in iteration.)

### Adding a new synergy

1. Add to `SYNERGY_DEFINITIONS` in `src/systems/synergies.ts`
2. Add to `SynergyId` enum + `active_synergies` matcher in
   `voidline-sim/src/synergies.rs`

(Synergies are not data-driven yet. Could be migrated to JSON in v2.)

## Parity vs TS

The Rust sim should produce numerically identical results to the TS sim
for the same seed, persona, and config. We verify this with focused unit
tests (mulberry32 first values, balance curves at known waves, DSL
effects on Player). A full-trial parity test (300+ frames identical) is
on the roadmap (`scripts/ts-reference-dump.ts` to capture references,
`sim/tests/parity/snapshot.rs` to compare).

Floating-point divergence is bounded by tolerance `1e-4` on stats and
strict equality on integer counts. If parity drifts after a balance.ts
change without a matching `data:export`, CI catches it via
`data:check`.

## Roadmap

- Full-trial parity tests (TS↔Rust on 30 fixtures)
- Persona AI port (kiter / optimizer / randomized) for input emulation —
  currently the sim assumes idle player input
- LRU cache by (persona, weapon, character, upgrades, seed) signature for
  policy-shared early-run results (~50% hit rate expected)
- Plug a real RL agent (PPO via tch-rs or export to ONNX for stable-
  baselines3) on the same `MetaProgressionEnv`

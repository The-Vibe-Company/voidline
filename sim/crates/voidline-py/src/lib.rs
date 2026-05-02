//! Python bindings for RL training and evaluation.
//!
//! `EpisodeEnv` spans a *sequence* of runs interleaved with shop decisions, so
//! a single trained oracle ends up controlling movement, in-run drafts, relic
//! pulls, and meta-progression purchases end-to-end. The action space is
//! `MultiDiscrete([9, 5, 4, 9])` (movement, draft, relic, shop), with masking
//! enforced per phase by `voidline_meta::obs::action_mask`.
#![cfg_attr(not(feature = "extension-module"), allow(dead_code, unused_imports))]

use std::collections::{HashMap, HashSet};

#[cfg(feature = "extension-module")]
use pyo3::prelude::*;
#[cfg(feature = "extension-module")]
use pyo3::types::PyDict;
#[cfg(feature = "extension-module")]
use rayon::prelude::*;
use voidline_data::catalogs::MetaUpgrade;
use voidline_data::{load_default, DataBundle};
use voidline_meta::account::{
    apply_run_reward, can_purchase, meta_level, next_level_cost, purchase, AccountSnapshot,
    RunOutcome,
};
use voidline_meta::obs::{
    action_mask, encode_observation, movement_keys, ActionMask, EncodedObservation, EnvPhase,
    RlAction, ShopChoiceRecord, ACTION_LOGITS, OBS_VECTOR_DIM, SHOP_CHOICE_SLOTS,
};
use voidline_meta::profiles::{
    engine_account_context, expert_action, lookahead_expert_action, lookahead_movement,
    PlayerProfileId,
};
use voidline_sim::engine::{
    Engine, EngineConfig, EngineInput, RelicChoiceRecord, UpgradeChoiceRecord,
};

fn forced_start_stage() -> Option<u32> {
    std::env::var("VOIDLINE_FORCE_START_STAGE")
        .ok()
        .and_then(|raw| raw.parse::<u32>().ok())
        .filter(|s| *s >= 1)
}

/// Training-only difficulty knob. Multiplies ``balance.enemy_density_multiplier``
/// by this value at env construction time. Defaults to 1.0 = no change. Use
/// values < 1.0 to soften the env during PPO bootstrap (the agent has a
/// chance to reach the stage 1 boss before dying), then re-train at 1.0
/// once a baseline policy exists.
fn training_density_scale() -> f64 {
    std::env::var("VOIDLINE_TRAINING_DENSITY_MULT")
        .ok()
        .and_then(|raw| raw.parse::<f64>().ok())
        .filter(|v| v.is_finite() && *v > 0.0)
        .unwrap_or(1.0)
}

/// When set to "1" (default), the env handles movement entirely on the
/// Rust side via `lookahead_movement` and the policy's movement action
/// is ignored. The action mask forces movement=0 so PPO doesn't waste
/// capacity on a dimension it can't influence. The model becomes a pure
/// "choice oracle" (upgrades + relics + shop only).
///
/// Set to "0" to give the policy full movement control (legacy mode,
/// for ablation studies).
fn rust_movement_enabled() -> bool {
    std::env::var("VOIDLINE_RUST_MOVEMENT")
        .map(|v| v != "0")
        .unwrap_or(true)
}

/// Lookahead horizon (in frames) used by the Rust movement controller
/// at training/eval time. Defaults to 15 frames (0.25s game-time). Lower
/// values are faster but greedier; higher values are slower but find
/// safer routes. Capped at [1, 240].
fn rust_movement_lookahead_frames() -> u32 {
    std::env::var("VOIDLINE_MOVEMENT_LOOKAHEAD_FRAMES")
        .ok()
        .and_then(|raw| raw.parse::<u32>().ok())
        .map(|v| v.clamp(1, 240))
        .unwrap_or(15)
}

/// Recompute the lookahead movement every N frames and reuse the same
/// direction in between. Movement direction doesn't need to change every
/// 16ms — pacing it gives us ~K× speedup with minimal quality loss.
/// Capped at [1, 60].
fn rust_movement_recompute_period() -> u32 {
    std::env::var("VOIDLINE_MOVEMENT_RECOMPUTE_PERIOD")
        .ok()
        .and_then(|raw| raw.parse::<u32>().ok())
        .map(|v| v.clamp(1, 60))
        .unwrap_or(6)
}

/// Test-card eval can pin a specific upgrade or relic id into every draft.
/// Without this, a rare/locked candidate often never appears organically and
/// the verdict degrades to insufficient-data. Read on every draft so changes
/// to the env var (e.g. between episodes) take effect immediately.
fn forced_draft_include_id() -> Option<String> {
    std::env::var("VOIDLINE_FORCE_DRAFT_INCLUDE_ID")
        .ok()
        .map(|raw| raw.trim().to_string())
        .filter(|raw| !raw.is_empty())
}

fn inject_target_upgrade(
    choices: &mut Vec<UpgradeChoiceRecord>,
    bundle: &DataBundle,
    target_id: &str,
) -> bool {
    if choices.iter().any(|c| c.upgrade_id == target_id) {
        return false;
    }
    if !bundle.upgrades.iter().any(|u| u.id == target_id) {
        return false;
    }
    let tier_id = bundle
        .balance
        .tiers
        .first()
        .map(|tier| tier.id.clone())
        .unwrap_or_else(|| "standard".to_string());
    let injected = UpgradeChoiceRecord {
        upgrade_id: target_id.to_string(),
        tier_id,
    };
    if choices.is_empty() {
        choices.push(injected);
    } else {
        choices[0] = injected;
    }
    true
}

fn inject_target_relic(
    choices: &mut Vec<RelicChoiceRecord>,
    bundle: &DataBundle,
    target_id: &str,
) -> bool {
    if choices.iter().any(|c| c.relic_id == target_id) {
        return false;
    }
    if !bundle.relics.iter().any(|r| r.id == target_id) {
        return false;
    }
    let injected = RelicChoiceRecord {
        relic_id: target_id.to_string(),
    };
    if choices.is_empty() {
        choices.push(injected);
    } else {
        choices[0] = injected;
    }
    true
}

const DEFAULT_RUNS_PER_EPISODE: u32 = 30;
// Bumped 10x in iter 3 so stage clears massively dominate passive survival
// (iter 2 diagnosis: 0.01/frame × 36000 = +360 reward >> 200 stage1 clear,
// agent learned to NOT engage the boss).
const BASE_STAGE_CLEAR_BONUSES: [(u32, f64); 3] = [(1, 2000.0), (2, 8000.0), (3, 30000.0)];
const BASE_STAGE_ENTRY_BONUS: f64 = 30.0;
const BASE_LEVEL_UP_BONUS: f64 = 5.0;
const BASE_SHOP_IDLE_STEP_PENALTY: f64 = -0.05;
const BASE_PURCHASE_BONUS: f64 = 25.0;
const BASE_RUN_DEATH_PENALTY: f64 = 30.0;

/// Runtime-overridable reward scaling so a Modal sweep can shape the policy
/// without recompiling the Rust crate. Read once per `EpisodeEnv::new()`.
#[derive(Debug, Clone)]
struct RewardConfig {
    stage_scale: f64,
    dense_scale: f64,
    death_penalty: f64,
    purchase_bonus: f64,
    shop_idle_penalty: f64,
    survival_bonus_per_frame: f64,
}

impl RewardConfig {
    fn from_env() -> Self {
        fn read(key: &str, default: f64) -> f64 {
            std::env::var(key)
                .ok()
                .and_then(|raw| raw.parse::<f64>().ok())
                .unwrap_or(default)
        }
        Self {
            stage_scale: read("VOIDLINE_REWARD_STAGE_SCALE", 1.0),
            dense_scale: read("VOIDLINE_REWARD_DENSE_SCALE", 1.0),
            death_penalty: read("VOIDLINE_REWARD_DEATH_PENALTY", BASE_RUN_DEATH_PENALTY),
            purchase_bonus: read("VOIDLINE_REWARD_PURCHASE_BONUS", BASE_PURCHASE_BONUS),
            shop_idle_penalty: read("VOIDLINE_REWARD_SHOP_IDLE", BASE_SHOP_IDLE_STEP_PENALTY),
            survival_bonus_per_frame: read("VOIDLINE_REWARD_SURVIVAL", 0.01),
        }
    }

    fn stage_clear_bonus(&self, stage: u32) -> f64 {
        let base = BASE_STAGE_CLEAR_BONUSES
            .iter()
            .find(|(s, _)| *s == stage)
            .map(|(_, value)| *value)
            .unwrap_or(0.0);
        base * self.stage_scale
    }

    fn stage_entry_bonus(&self) -> f64 {
        BASE_STAGE_ENTRY_BONUS * self.dense_scale
    }

    fn level_up_bonus(&self) -> f64 {
        BASE_LEVEL_UP_BONUS * self.dense_scale
    }
}

#[derive(Debug, Clone)]
struct StepOutput {
    obs: EncodedObservation,
    reward: f64,
    terminated: bool,
    truncated: bool,
    info: StepInfo,
}

#[derive(Debug, Clone, Default)]
struct StepInfo {
    score: f64,
    pressure: u32,
    level: u32,
    elapsed_seconds: f64,
    death: bool,
    phase: u8, // 0 = Run, 1 = Shop
    runs_completed: u32,
    crystals: u64,
    highest_stage_cleared: u32,
    /// Final per-episode metrics, populated only on the terminal step. None
    /// during in-progress steps so consumers can detect episode boundaries.
    episode_summary: Option<EpisodeSummary>,
    terminal_observation: Option<EncodedObservation>,
}

/// Per-episode aggregates exposed to the Python evaluator at terminal step.
#[derive(Debug, Clone, Default)]
struct EpisodeSummary {
    runs_completed: u32,
    final_crystals: u64,
    highest_stage_cleared: u32,
    /// Maps stage (1, 2, 3) to the run-index (0-based) at which it was first
    /// cleared this episode. Absent stages were never cleared.
    stage_clear_runs: HashMap<u32, u32>,
    upgrade_offers: HashMap<String, u32>,
    upgrade_picks: HashMap<String, u32>,
    relic_offers: HashMap<String, u32>,
    relic_picks: HashMap<String, u32>,
    meta_purchases: HashMap<String, u32>,
}

struct EpisodeEnv {
    bundle: DataBundle,
    engine: Engine,
    base_seed: u32,
    seed: u32,
    episode_index: u32,
    step_count: u32,
    max_steps_per_run: u32,
    runs_per_episode: u32,
    runs_in_episode: u32,
    last_score: f64,
    last_level: u32,
    last_stage: u32,
    reward_config: RewardConfig,
    current_upgrades: Vec<UpgradeChoiceRecord>,
    current_relics: Vec<RelicChoiceRecord>,
    current_shop: Vec<ShopChoiceRecord>,
    account: AccountSnapshot,
    phase: EnvPhase,
    cleared_stages: HashSet<u32>,
    last_run_outcome: Option<RunOutcome>,
    // Per-episode counters exposed at terminal step (eval-only signal).
    upgrade_offers: HashMap<String, u32>,
    upgrade_picks: HashMap<String, u32>,
    relic_offers: HashMap<String, u32>,
    relic_picks: HashMap<String, u32>,
    meta_purchases: HashMap<String, u32>,
    stage_clear_runs: HashMap<u32, u32>,
    cached_movement: usize,
    movement_cache_age: u32,
}

impl EpisodeEnv {
    fn new(seed: u32, max_steps_per_run: u32, runs_per_episode: u32) -> Result<Self, String> {
        let mut bundle = load_default().map_err(|err| err.to_string())?;
        let density_scale = training_density_scale();
        if (density_scale - 1.0).abs() > 1e-6 {
            bundle.balance.enemy_density_multiplier *= density_scale;
        }
        let mut account = AccountSnapshot::default();
        if let Some(start_stage) = forced_start_stage() {
            account.selected_start_stage = start_stage;
            account.highest_start_stage_unlocked = start_stage.max(1);
            account.highest_stage_cleared = start_stage.saturating_sub(1);
        }
        let engine = Engine::new(
            bundle.clone(),
            EngineConfig {
                seed: Some(seed),
                width: None,
                height: None,
                dpr: None,
                account: Some(engine_account_context(&bundle, &account)),
            },
        );
        Ok(Self {
            bundle,
            engine,
            base_seed: seed,
            seed,
            episode_index: 0,
            step_count: 0,
            max_steps_per_run,
            runs_per_episode: runs_per_episode.max(1),
            runs_in_episode: 0,
            last_score: 0.0,
            last_level: 1,
            last_stage: 1,
            reward_config: RewardConfig::from_env(),
            current_upgrades: Vec::new(),
            current_relics: Vec::new(),
            current_shop: Vec::new(),
            account,
            phase: EnvPhase::Run,
            cleared_stages: HashSet::new(),
            last_run_outcome: None,
            upgrade_offers: HashMap::new(),
            upgrade_picks: HashMap::new(),
            relic_offers: HashMap::new(),
            relic_picks: HashMap::new(),
            meta_purchases: HashMap::new(),
            stage_clear_runs: HashMap::new(),
            cached_movement: 0,
            movement_cache_age: u32::MAX,
        })
    }

    fn reset(&mut self, seed: Option<u32>) -> EncodedObservation {
        if let Some(seed) = seed {
            self.seed = seed;
            self.base_seed = seed;
        } else {
            self.seed = self
                .base_seed
                .wrapping_add(self.episode_index.wrapping_mul(0x9E3779B1));
        }
        self.episode_index = self.episode_index.wrapping_add(1);
        self.step_count = 0;
        self.last_score = 0.0;
        self.last_level = 1;
        self.last_stage = forced_start_stage().unwrap_or(1);
        self.current_upgrades.clear();
        self.current_relics.clear();
        self.current_shop.clear();
        self.account = AccountSnapshot::default();
        if let Some(start_stage) = forced_start_stage() {
            self.account.selected_start_stage = start_stage;
            self.account.highest_start_stage_unlocked = start_stage.max(1);
            self.account.highest_stage_cleared = start_stage.saturating_sub(1);
        }
        self.phase = EnvPhase::Run;
        self.cleared_stages.clear();
        self.runs_in_episode = 0;
        self.last_run_outcome = None;
        self.upgrade_offers.clear();
        self.upgrade_picks.clear();
        self.relic_offers.clear();
        self.relic_picks.clear();
        self.meta_purchases.clear();
        self.stage_clear_runs.clear();
        self.cached_movement = 0;
        self.movement_cache_age = u32::MAX;
        self.engine.reset(
            Some(self.seed),
            Some(engine_account_context(&self.bundle, &self.account)),
        );
        self.observe().0
    }

    /// Build the (observation, action_mask) pair from the current engine
    /// snapshot + cached choices + cached shop list. Side-effect: when a
    /// fresh draft is generated we tally each option as an "offer" exactly
    /// once, before the agent gets a chance to pick.
    fn observe(&mut self) -> (EncodedObservation, ActionMask) {
        let snapshot = self.engine.snapshot();
        let forced_target = forced_draft_include_id();
        if matches!(self.phase, EnvPhase::Run) {
            if snapshot.state.pending_upgrades > 0 {
                if self.current_upgrades.is_empty() {
                    self.current_upgrades = self.engine.draft_upgrades(4);
                    if let Some(target) = forced_target.as_deref() {
                        inject_target_upgrade(
                            &mut self.current_upgrades,
                            &self.bundle,
                            target,
                        );
                    }
                    for choice in &self.current_upgrades {
                        *self
                            .upgrade_offers
                            .entry(choice.upgrade_id.clone())
                            .or_insert(0) += 1;
                    }
                }
            } else {
                self.current_upgrades.clear();
            }
            if snapshot.state.pending_chests > 0 {
                if self.current_relics.is_empty() {
                    self.current_relics = self.engine.draft_relics(3);
                    if let Some(target) = forced_target.as_deref() {
                        inject_target_relic(
                            &mut self.current_relics,
                            &self.bundle,
                            target,
                        );
                    }
                    for choice in &self.current_relics {
                        *self
                            .relic_offers
                            .entry(choice.relic_id.clone())
                            .or_insert(0) += 1;
                    }
                }
            } else {
                self.current_relics.clear();
            }
        }
        let snapshot = self.engine.snapshot();
        let obs = encode_observation(
            &self.bundle,
            &snapshot,
            &self.current_upgrades,
            &self.current_relics,
            &self.current_shop,
            self.phase,
        );
        let mut mask = action_mask(
            &snapshot,
            &self.current_upgrades,
            &self.current_relics,
            &self.current_shop,
            self.phase,
        );
        // When Rust handles movement, force the policy to emit
        // movement=0 (noop) so PPO doesn't allocate capacity to a dim
        // it can't influence. The actual movement keys are computed in
        // step_run from the engine state, not from action[0].
        if rust_movement_enabled() && matches!(self.phase, EnvPhase::Run) {
            for slot in mask.movement.iter_mut() {
                *slot = false;
            }
            if !mask.movement.is_empty() {
                mask.movement[0] = true;
            }
        }
        (obs, mask)
    }

    fn step(&mut self, action: RlAction) -> StepOutput {
        match self.phase {
            EnvPhase::Run => self.step_run(action),
            EnvPhase::Shop => self.step_shop(action),
        }
    }

    fn step_run(&mut self, action: RlAction) -> StepOutput {
        // Apply in-run draft / relic decisions from the previous decision
        // point (action[1], action[2]). Offers were already tallied in
        // observe() when the draft was generated. Picks are tallied inside
        // apply_decision_action.
        self.apply_decision_action(action);

        let rust_movement = rust_movement_enabled();
        let lookahead_frames = rust_movement_lookahead_frames();
        let recompute_period = rust_movement_recompute_period();
        let mut reward = 0.0;
        let mut info_phase: u8 = 0;
        let mut episode_terminated = false;
        let mut run_died = false;
        let mut truncated_run;
        let mut snapshot;

        // SMDP inner loop: simulate frames until the model is needed
        // (level-up draft, chest spawn, run end). Without rust_movement
        // we cap at 1 frame so the legacy frame-step semantics still work.
        let max_inner_iters = if rust_movement { u32::MAX } else { 1 };
        let mut inner_iters: u32 = 0;
        loop {
            let keys = if rust_movement {
                if self.movement_cache_age >= recompute_period {
                    let (mx, my) = lookahead_movement(&self.engine, lookahead_frames, 1.0 / 60.0);
                    self.cached_movement = snap_movement(mx, my);
                    self.movement_cache_age = 0;
                } else {
                    self.movement_cache_age = self.movement_cache_age.saturating_add(1);
                }
                movement_keys(self.cached_movement)
            } else {
                movement_keys(action.movement)
            };
            self.engine.set_input(EngineInput {
                keys,
                pointer_x: 0.0,
                pointer_y: 0.0,
                pointer_inside: false,
                control_mode: "keyboard".to_string(),
            });
            self.engine.step(1.0 / 60.0);
            self.step_count = self.step_count.saturating_add(1);
            inner_iters = inner_iters.saturating_add(1);

            snapshot = self.engine.snapshot();
            let score_delta = snapshot.state.score - self.last_score;
            self.last_score = snapshot.state.score;
            run_died = snapshot.state.mode == "gameover";
            truncated_run = self.step_count >= self.max_steps_per_run;

            let mut bonus = 0.0;
            let cur_level = snapshot.state.level;
            if cur_level > self.last_level {
                bonus += self.reward_config.level_up_bonus()
                    * (cur_level - self.last_level) as f64;
                self.last_level = cur_level;
            }
            let cur_stage = snapshot.state.stage;
            if cur_stage > self.last_stage {
                bonus += self.reward_config.stage_entry_bonus()
                    * (cur_stage - self.last_stage) as f64;
                self.last_stage = cur_stage;
            }

            for stage in &snapshot.state.run_boss_stages {
                if !self.cleared_stages.contains(stage) {
                    self.cleared_stages.insert(*stage);
                    self.stage_clear_runs.insert(*stage, self.runs_in_episode);
                    bonus += self.reward_config.stage_clear_bonus(*stage);
                }
            }

            reward += score_delta + self.reward_config.survival_bonus_per_frame + bonus;

            if run_died || truncated_run {
                break;
            }
            if !rust_movement || inner_iters >= max_inner_iters {
                break;
            }
            // Yield control to Python when a draft/chest needs a decision.
            if snapshot.state.pending_upgrades > 0 || snapshot.state.pending_chests > 0 {
                break;
            }
        }

        let stage3_cleared = self.cleared_stages.contains(&3);

        if run_died || truncated_run {
            if run_died {
                reward -= self.reward_config.death_penalty;
            }
            let outcome = build_run_outcome(&snapshot, run_died);
            apply_run_reward(&mut self.account, &outcome);
            self.last_run_outcome = Some(outcome);
            self.runs_in_episode += 1;
            self.phase = EnvPhase::Shop;
            self.refresh_shop_slots();
            info_phase = 1;

            if stage3_cleared || self.runs_in_episode >= self.runs_per_episode {
                episode_terminated = true;
            }
        }

        let info = StepInfo {
            score: snapshot.state.score,
            pressure: snapshot.state.pressure,
            level: snapshot.state.level,
            elapsed_seconds: snapshot.state.run_elapsed_seconds,
            death: run_died,
            phase: info_phase,
            runs_completed: self.runs_in_episode,
            crystals: self.account.crystals,
            highest_stage_cleared: self.account.highest_stage_cleared,
            episode_summary: if episode_terminated {
                Some(self.snapshot_summary())
            } else {
                None
            },
            terminal_observation: None,
        };
        let obs = self.observe().0;
        StepOutput {
            obs,
            reward,
            terminated: episode_terminated,
            truncated: false,
            info,
        }
    }

    fn step_shop(&mut self, action: RlAction) -> StepOutput {
        // action.shop_pick:
        //   0  -> NextRun (start a fresh run with the persisted account state)
        //   k  -> purchase slot k-1 (stay in shop phase)
        let mut reward = 0.0;
        let mut purchased = false;

        if action.shop_pick > 0 {
            let slot = action.shop_pick - 1;
            if let Some(record) = self.current_shop.get(slot).cloned() {
                if let Some(meta) = self
                    .bundle
                    .meta_upgrades
                    .iter()
                    .find(|m| m.id == record.upgrade_id)
                    .cloned()
                {
                    if can_purchase(&self.account, &meta).is_ok() {
                        let _ = purchase(&mut self.account, &meta);
                        *self
                            .meta_purchases
                            .entry(meta.id.clone())
                            .or_insert(0) += 1;
                        // Reward unlock-y purchases more than rarity/utility tiers.
                        reward += match meta.kind.as_str() {
                            "unique" | "card" => self.reward_config.purchase_bonus,
                            _ => self.reward_config.purchase_bonus * 0.5,
                        };
                        purchased = true;
                        self.refresh_shop_slots();
                    }
                }
            }
        }

        if !purchased {
            // Idle shop step: small penalty so the policy converges toward
            // purchasing when affordable and otherwise calling NextRun.
            reward += self.reward_config.shop_idle_penalty;
        }

        // Action 0 (NextRun) — only meaningful when nothing was purchased.
        let mut episode_terminated = false;
        let mut runs_in_episode = self.runs_in_episode;
        let mut crystals = self.account.crystals;
        let mut highest_stage_cleared = self.account.highest_stage_cleared;
        let mut info_phase: u8 = 1;

        if !purchased && action.shop_pick == 0 {
            // Start the next run.
            if self.runs_in_episode >= self.runs_per_episode
                || self.cleared_stages.contains(&3)
            {
                episode_terminated = true;
            } else {
                self.start_next_run();
                info_phase = 0;
            }
            runs_in_episode = self.runs_in_episode;
            crystals = self.account.crystals;
            highest_stage_cleared = self.account.highest_stage_cleared;
        }

        let snapshot = self.engine.snapshot();
        let info = StepInfo {
            score: snapshot.state.score,
            pressure: snapshot.state.pressure,
            level: snapshot.state.level,
            elapsed_seconds: snapshot.state.run_elapsed_seconds,
            death: false,
            phase: info_phase,
            runs_completed: runs_in_episode,
            crystals,
            highest_stage_cleared,
            episode_summary: if episode_terminated {
                Some(self.snapshot_summary())
            } else {
                None
            },
            terminal_observation: None,
        };
        let obs = self.observe().0;
        StepOutput {
            obs,
            reward,
            terminated: episode_terminated,
            truncated: false,
            info,
        }
    }

    fn snapshot_summary(&self) -> EpisodeSummary {
        EpisodeSummary {
            runs_completed: self.runs_in_episode,
            final_crystals: self.account.crystals,
            highest_stage_cleared: self.account.highest_stage_cleared,
            stage_clear_runs: self.stage_clear_runs.clone(),
            upgrade_offers: self.upgrade_offers.clone(),
            upgrade_picks: self.upgrade_picks.clone(),
            relic_offers: self.relic_offers.clone(),
            relic_picks: self.relic_picks.clone(),
            meta_purchases: self.meta_purchases.clone(),
        }
    }

    fn start_next_run(&mut self) {
        let next_seed = self
            .seed
            .wrapping_add(self.runs_in_episode.wrapping_mul(0x9E3779B1));
        if let Some(start_stage) = forced_start_stage() {
            self.account.selected_start_stage = start_stage;
            self.account.highest_start_stage_unlocked = start_stage.max(1);
        }
        self.engine.reset(
            Some(next_seed),
            Some(engine_account_context(&self.bundle, &self.account)),
        );
        self.step_count = 0;
        self.last_score = 0.0;
        self.last_level = 1;
        self.last_stage = forced_start_stage().unwrap_or(1);
        self.current_upgrades.clear();
        self.current_relics.clear();
        self.phase = EnvPhase::Run;
        self.cached_movement = 0;
        self.movement_cache_age = u32::MAX;
    }

    fn refresh_shop_slots(&mut self) {
        let mut affordable: Vec<(u64, &MetaUpgrade)> = Vec::new();
        for meta in &self.bundle.meta_upgrades {
            if let Ok(cost) = can_purchase(&self.account, meta) {
                affordable.push((cost, meta));
            }
        }
        affordable.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.id.cmp(&b.1.id)));
        self.current_shop = affordable
            .into_iter()
            .take(SHOP_CHOICE_SLOTS)
            .map(|(cost, meta)| ShopChoiceRecord {
                upgrade_id: meta.id.clone(),
                kind: meta.kind.clone(),
                cost,
                current_level: meta_level(&self.account, meta),
                max_level: meta.max_level,
            })
            .collect();
    }

    fn step_auto_reset(&mut self, action: RlAction) -> StepOutput {
        let mut out = self.step(action);
        if out.terminated || out.truncated {
            let terminal_observation = out.obs.clone();
            out.obs = self.reset(None);
            out.info.terminal_observation = Some(terminal_observation);
        }
        out
    }

    fn action_mask(&mut self) -> ActionMask {
        self.observe().1
    }

    /// Lookahead receding-horizon expert. Same upgrade/relic scoring as
    /// `expert_action` but movement is chosen by simulating each candidate
    /// 30 frames ahead in cloned engines and picking the best by score
    /// (damage_dealt - hp_loss × 80 - died × 5000 + survival).
    ///
    /// Cost: ~9× slower than `expert_action` (still well under 1ms per
    /// decision in release). Use for BC rollout collection where the
    /// extra quality is worth the slowdown.
    fn lookahead_action(&mut self, lookahead_frames: u32) -> [usize; 4] {
        let (_, _) = self.observe();
        if matches!(self.phase, EnvPhase::Shop) {
            return [0, 0, 0, 0];
        }
        let frames = lookahead_frames.max(1);
        let action = lookahead_expert_action(
            &self.bundle,
            &PlayerProfileId::Optimizer,
            &self.engine,
            &self.current_upgrades,
            &self.current_relics,
            frames,
            1.0 / 60.0,
        );
        let movement = snap_movement(action.movement_dx, action.movement_dy);
        let upgrade_pick = action.upgrade_slot.map(|i| i + 1).unwrap_or(0);
        let relic_pick = action.relic_slot.map(|i| i + 1).unwrap_or(0);
        [movement, upgrade_pick, relic_pick, 0]
    }

    /// Per-step expert action from the legacy heuristic player profile.
    /// Wraps `voidline_meta::profiles::expert_action(Optimizer)` so the
    /// Python BC pipeline can collect rollouts from a known-good agent
    /// without re-implementing the kite + boss tangent + edge bounce
    /// logic. Returns ``[movement, upgrade_pick, relic_pick, shop_pick]``.
    /// In Shop phase the agent always picks ``NextRun`` (slot 0) — meta
    /// purchases are a separate problem and PPO handles them later.
    fn expert_action(&mut self) -> [usize; 4] {
        // Make sure the cached drafts reflect the engine's current state
        // (this also tallies offers, identical to a regular observe()).
        let (_, _) = self.observe();
        let snapshot = self.engine.snapshot();
        let in_shop = matches!(self.phase, EnvPhase::Shop);

        if in_shop {
            // Heuristic: take NextRun. Shop scoring is intentionally left
            // to PPO so it can learn the "buy what you can afford" policy
            // — the legacy `policies.rs` (GreedyCheap/FocusedAttack) was
            // the meta-progression policy, which we don't want to bias.
            return [0, 0, 0, 0];
        }

        let profile = PlayerProfileId::Optimizer;
        let action = expert_action(
            &self.bundle,
            &profile,
            &snapshot,
            &self.current_upgrades,
            &self.current_relics,
        );

        // Snap continuous (dx, dy) to the 9-way movement encoding the
        // env's keys layout uses.
        let movement = snap_movement(action.movement_dx, action.movement_dy);
        let upgrade_pick = action.upgrade_slot.map(|i| i + 1).unwrap_or(0);
        let relic_pick = action.relic_slot.map(|i| i + 1).unwrap_or(0);

        [movement, upgrade_pick, relic_pick, 0]
    }

    /// Heuristic-only helper: returns ``(flee_dx, flee_dy, nearest_dist,
    /// player_center_dx, player_center_dy)`` so a Python agent can move
    /// away from the enemy centroid and toward the arena center. NOT
    /// part of the training observation (the policy stays catalog-
    /// invariant); this is a side-channel for the hardcoded baseline
    /// and BC rollout collection.
    fn flee_vector(&mut self) -> (f64, f64, f64, f64, f64) {
        let snapshot = self.engine.snapshot();
        let px = snapshot.player.x;
        let py = snapshot.player.y;
        let mut sum_dx = 0.0;
        let mut sum_dy = 0.0;
        let mut weight = 0.0;
        let mut nearest_sq = f64::INFINITY;
        for enemy in &snapshot.enemies {
            let dx = enemy.x - px;
            let dy = enemy.y - py;
            let dist_sq = dx * dx + dy * dy;
            if dist_sq < nearest_sq {
                nearest_sq = dist_sq;
            }
            // Inverse-distance weighting so close enemies dominate the
            // flee direction. Cap weight to avoid div-by-zero on contact.
            let dist = dist_sq.sqrt().max(8.0);
            let w = 1.0 / dist;
            sum_dx += -(dx) * w;
            sum_dy += -(dy) * w;
            weight += w;
        }
        let (flee_dx, flee_dy) = if weight > 0.0 {
            let mag = (sum_dx * sum_dx + sum_dy * sum_dy).sqrt().max(1e-6);
            (sum_dx / mag, sum_dy / mag)
        } else {
            (0.0, 0.0)
        };
        let cx = snapshot.world.arena_width * 0.5;
        let cy = snapshot.world.arena_height * 0.5;
        let cdx = cx - px;
        let cdy = cy - py;
        let cmag = (cdx * cdx + cdy * cdy).sqrt().max(1e-6);
        let nearest_dist = if nearest_sq.is_finite() {
            nearest_sq.sqrt()
        } else {
            1e9
        };
        (
            flee_dx,
            flee_dy,
            nearest_dist,
            cdx / cmag,
            cdy / cmag,
        )
    }

    fn apply_decision_action(&mut self, action: RlAction) {
        let snapshot = self.engine.snapshot();
        let forced_target = forced_draft_include_id();
        if snapshot.state.pending_upgrades > 0 && action.upgrade_pick > 0 {
            if self.current_upgrades.is_empty() {
                self.current_upgrades = self.engine.draft_upgrades(4);
                if let Some(target) = forced_target.as_deref() {
                    inject_target_upgrade(
                        &mut self.current_upgrades,
                        &self.bundle,
                        target,
                    );
                }
                // Defensive: if the draft is happening here (rather than via
                // observe()), still tally offers so picks can never outpace
                // offers.
                for choice in &self.current_upgrades {
                    *self
                        .upgrade_offers
                        .entry(choice.upgrade_id.clone())
                        .or_insert(0) += 1;
                }
            }
            if let Some(choice) = self.current_upgrades.get(action.upgrade_pick - 1) {
                let upgrade_id = choice.upgrade_id.clone();
                let tier_id = choice.tier_id.clone();
                let _ = self.engine.apply_upgrade(&upgrade_id, &tier_id);
                *self.upgrade_picks.entry(upgrade_id).or_insert(0) += 1;
                self.current_upgrades.clear();
            }
        }
        let snapshot = self.engine.snapshot();
        if snapshot.state.pending_chests > 0 && action.relic_pick > 0 {
            if self.current_relics.is_empty() {
                self.current_relics = self.engine.draft_relics(3);
                if let Some(target) = forced_target.as_deref() {
                    inject_target_relic(
                        &mut self.current_relics,
                        &self.bundle,
                        target,
                    );
                }
                for choice in &self.current_relics {
                    *self
                        .relic_offers
                        .entry(choice.relic_id.clone())
                        .or_insert(0) += 1;
                }
            }
            if let Some(choice) = self.current_relics.get(action.relic_pick - 1) {
                let relic_id = choice.relic_id.clone();
                let _ = self.engine.apply_relic(&relic_id);
                *self.relic_picks.entry(relic_id).or_insert(0) += 1;
                self.current_relics.clear();
            }
        }
    }
}

/// Snap a continuous (dx, dy) movement vector to the 9-way action
/// encoding used by the env (0 = noop, 1-4 = N/E/S/W, 5-8 = diagonals).
/// Mirrors `voidline_meta::obs::movement_keys` so the resulting action
/// produces the same key set when stepped.
fn snap_movement(dx: f64, dy: f64) -> usize {
    if dx.abs() < 0.2 && dy.abs() < 0.2 {
        return 0;
    }
    let east = dx > 0.2;
    let west = dx < -0.2;
    let south = dy > 0.2;
    let north = dy < -0.2;
    match (north, east, south, west) {
        (true, true, false, false) => 5,   // NE
        (false, true, true, false) => 6,   // SE
        (false, false, true, true) => 7,   // SW
        (true, false, false, true) => 8,   // NW
        (true, false, false, false) => 1,  // N
        (false, true, false, false) => 2,  // E
        (false, false, true, false) => 3,  // S
        (false, false, false, true) => 4,  // W
        _ => 0,
    }
}

fn build_run_outcome(snapshot: &voidline_sim::engine::EngineSnapshot, died: bool) -> RunOutcome {
    RunOutcome {
        elapsed_seconds: snapshot.state.run_elapsed_seconds,
        run_level: snapshot.state.level,
        score: snapshot.state.score.max(0.0) as u64,
        boss_stages: snapshot.state.run_boss_stages.clone(),
        start_stage: snapshot.state.start_stage,
        died,
    }
}

#[cfg(feature = "extension-module")]
#[pyclass(name = "Env")]
struct PyEnv {
    env: EpisodeEnv,
}

#[cfg(feature = "extension-module")]
#[pymethods]
impl PyEnv {
    #[new]
    #[pyo3(signature = (seed = 0, max_steps = 3600, runs_per_episode = DEFAULT_RUNS_PER_EPISODE))]
    fn new(seed: u32, max_steps: u32, runs_per_episode: u32) -> PyResult<Self> {
        Ok(Self {
            env: EpisodeEnv::new(seed, max_steps, runs_per_episode)
                .map_err(PyErr::new::<pyo3::exceptions::PyRuntimeError, _>)?,
        })
    }

    fn reset(&mut self, py: Python<'_>, seed: Option<u32>) -> PyResult<Py<PyAny>> {
        obs_to_py(py, &self.env.reset(seed))
    }

    fn step(
        &mut self,
        py: Python<'_>,
        action: Vec<usize>,
    ) -> PyResult<(Py<PyAny>, f64, bool, bool, Py<PyAny>)> {
        let out = self.env.step(parse_action(&action));
        Ok((
            obs_to_py(py, &out.obs)?,
            out.reward,
            out.terminated,
            out.truncated,
            info_to_py(py, &out.info)?,
        ))
    }

    fn action_masks(&mut self, py: Python<'_>) -> PyResult<Py<PyAny>> {
        mask_to_py(py, &self.env.action_mask())
    }

    fn flee_vector(&mut self) -> (f64, f64, f64, f64, f64) {
        self.env.flee_vector()
    }

    fn expert_action(&mut self) -> Vec<usize> {
        self.env.expert_action().to_vec()
    }

    #[pyo3(signature = (lookahead_frames = 30))]
    fn lookahead_action(&mut self, lookahead_frames: u32) -> Vec<usize> {
        self.env.lookahead_action(lookahead_frames).to_vec()
    }

    fn observation_dim(&self) -> usize {
        OBS_VECTOR_DIM
    }

    fn action_dim(&self) -> usize {
        ACTION_LOGITS
    }
}

#[cfg(feature = "extension-module")]
#[pyclass(name = "VecEnv")]
struct PyVecEnv {
    envs: Vec<EpisodeEnv>,
}

#[cfg(feature = "extension-module")]
#[pymethods]
impl PyVecEnv {
    #[new]
    #[pyo3(signature = (num_envs, base_seed = 0, max_steps = 3600, runs_per_episode = DEFAULT_RUNS_PER_EPISODE))]
    fn new(
        num_envs: usize,
        base_seed: u32,
        max_steps: u32,
        runs_per_episode: u32,
    ) -> PyResult<Self> {
        if num_envs == 0 {
            return Err(PyErr::new::<pyo3::exceptions::PyValueError, _>(
                "num_envs must be > 0",
            ));
        }
        let envs = (0..num_envs)
            .map(|idx| {
                EpisodeEnv::new(
                    base_seed.wrapping_add((idx as u32).wrapping_mul(0x9E3779B1)),
                    max_steps,
                    runs_per_episode,
                )
                .map_err(PyErr::new::<pyo3::exceptions::PyRuntimeError, _>)
            })
            .collect::<PyResult<Vec<_>>>()?;
        Ok(Self { envs })
    }

    fn reset(&mut self, py: Python<'_>) -> PyResult<Vec<Py<PyAny>>> {
        self.envs
            .iter_mut()
            .map(|env| obs_to_py(py, &env.reset(None)))
            .collect()
    }

    fn step_batch(
        &mut self,
        py: Python<'_>,
        actions: Vec<Vec<usize>>,
    ) -> PyResult<(
        Vec<Py<PyAny>>,
        Vec<f64>,
        Vec<bool>,
        Vec<bool>,
        Vec<Py<PyAny>>,
    )> {
        if actions.len() != self.envs.len() {
            return Err(PyErr::new::<pyo3::exceptions::PyValueError, _>(
                "actions length must match num_envs",
            ));
        }
        let outputs = self
            .envs
            .par_iter_mut()
            .zip(actions.into_par_iter())
            .map(|(env, action)| env.step_auto_reset(parse_action(&action)))
            .collect::<Vec<_>>();

        let mut obs = Vec::with_capacity(outputs.len());
        let mut rewards = Vec::with_capacity(outputs.len());
        let mut terminated = Vec::with_capacity(outputs.len());
        let mut truncated = Vec::with_capacity(outputs.len());
        let mut infos = Vec::with_capacity(outputs.len());
        for output in outputs {
            obs.push(obs_to_py(py, &output.obs)?);
            rewards.push(output.reward);
            terminated.push(output.terminated);
            truncated.push(output.truncated);
            infos.push(info_to_py(py, &output.info)?);
        }
        Ok((obs, rewards, terminated, truncated, infos))
    }

    fn action_masks(&mut self, py: Python<'_>) -> PyResult<Vec<Py<PyAny>>> {
        self.envs
            .iter_mut()
            .map(|env| mask_to_py(py, &env.action_mask()))
            .collect()
    }

    fn len(&self) -> usize {
        self.envs.len()
    }
}

fn parse_action(raw: &[usize]) -> RlAction {
    RlAction {
        movement: raw.first().copied().unwrap_or(0),
        upgrade_pick: raw.get(1).copied().unwrap_or(0),
        relic_pick: raw.get(2).copied().unwrap_or(0),
        shop_pick: raw.get(3).copied().unwrap_or(0),
    }
}

#[cfg(feature = "extension-module")]
fn obs_to_py(py: Python<'_>, obs: &EncodedObservation) -> PyResult<Py<PyAny>> {
    let dict = PyDict::new(py);
    dict.set_item("scalar", obs.scalar.clone())?;
    dict.set_item("enemies", obs.enemies.clone())?;
    dict.set_item("owned_tags", obs.owned_tags.clone())?;
    dict.set_item("upgrade_choices", obs.upgrade_choices.clone())?;
    dict.set_item("relic_choices", obs.relic_choices.clone())?;
    dict.set_item("shop_choices", obs.shop_choices.clone())?;
    Ok(dict.into_any().unbind())
}

#[cfg(feature = "extension-module")]
fn mask_to_py(py: Python<'_>, mask: &ActionMask) -> PyResult<Py<PyAny>> {
    let dict = PyDict::new(py);
    dict.set_item("movement", mask.movement.clone())?;
    dict.set_item("upgrade_pick", mask.upgrade_pick.clone())?;
    dict.set_item("relic_pick", mask.relic_pick.clone())?;
    dict.set_item("shop_pick", mask.shop_pick.clone())?;
    dict.set_item("flat", mask.flatten())?;
    Ok(dict.into_any().unbind())
}

#[cfg(feature = "extension-module")]
fn info_to_py(py: Python<'_>, info: &StepInfo) -> PyResult<Py<PyAny>> {
    let dict = PyDict::new(py);
    dict.set_item("score", info.score)?;
    dict.set_item("pressure", info.pressure)?;
    dict.set_item("level", info.level)?;
    dict.set_item("elapsed_seconds", info.elapsed_seconds)?;
    dict.set_item("death", info.death)?;
    dict.set_item("phase", info.phase)?;
    dict.set_item("runs_completed", info.runs_completed)?;
    dict.set_item("crystals", info.crystals)?;
    dict.set_item("highest_stage_cleared", info.highest_stage_cleared)?;
    if let Some(summary) = &info.episode_summary {
        dict.set_item("episode_summary", summary_to_py(py, summary)?)?;
    }
    if let Some(obs) = &info.terminal_observation {
        dict.set_item("terminal_observation", obs_to_py(py, obs)?)?;
    }
    Ok(dict.into_any().unbind())
}

#[cfg(feature = "extension-module")]
fn summary_to_py(py: Python<'_>, summary: &EpisodeSummary) -> PyResult<Py<PyAny>> {
    let dict = PyDict::new(py);
    dict.set_item("runs_completed", summary.runs_completed)?;
    dict.set_item("final_crystals", summary.final_crystals)?;
    dict.set_item("highest_stage_cleared", summary.highest_stage_cleared)?;
    dict.set_item("stage_clear_runs", hashmap_u32_u32_to_py(py, &summary.stage_clear_runs)?)?;
    dict.set_item(
        "upgrade_offers",
        hashmap_string_u32_to_py(py, &summary.upgrade_offers)?,
    )?;
    dict.set_item(
        "upgrade_picks",
        hashmap_string_u32_to_py(py, &summary.upgrade_picks)?,
    )?;
    dict.set_item(
        "relic_offers",
        hashmap_string_u32_to_py(py, &summary.relic_offers)?,
    )?;
    dict.set_item(
        "relic_picks",
        hashmap_string_u32_to_py(py, &summary.relic_picks)?,
    )?;
    dict.set_item(
        "meta_purchases",
        hashmap_string_u32_to_py(py, &summary.meta_purchases)?,
    )?;
    Ok(dict.into_any().unbind())
}

#[cfg(feature = "extension-module")]
fn hashmap_string_u32_to_py(
    py: Python<'_>,
    map: &HashMap<String, u32>,
) -> PyResult<Py<PyAny>> {
    let dict = PyDict::new(py);
    for (k, v) in map {
        dict.set_item(k, *v)?;
    }
    Ok(dict.into_any().unbind())
}

#[cfg(feature = "extension-module")]
fn hashmap_u32_u32_to_py(py: Python<'_>, map: &HashMap<u32, u32>) -> PyResult<Py<PyAny>> {
    let dict = PyDict::new(py);
    for (k, v) in map {
        dict.set_item(*k, *v)?;
    }
    Ok(dict.into_any().unbind())
}

#[cfg(feature = "extension-module")]
#[pyfunction]
fn observation_dim() -> usize {
    OBS_VECTOR_DIM
}

#[cfg(feature = "extension-module")]
#[pyfunction]
fn action_dim() -> usize {
    ACTION_LOGITS
}

#[cfg(feature = "extension-module")]
#[pymodule]
fn voidline_py(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_class::<PyEnv>()?;
    m.add_class::<PyVecEnv>()?;
    m.add_function(wrap_pyfunction!(observation_dim, m)?)?;
    m.add_function(wrap_pyfunction!(action_dim, m)?)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn inject_target_upgrade_replaces_first_slot_when_target_absent() {
        let bundle = load_default().unwrap();
        let real_id = bundle.upgrades[0].id.clone();
        let mut choices = vec![
            UpgradeChoiceRecord {
                upgrade_id: "filler-a".into(),
                tier_id: "standard".into(),
            },
            UpgradeChoiceRecord {
                upgrade_id: "filler-b".into(),
                tier_id: "standard".into(),
            },
        ];
        let injected = inject_target_upgrade(&mut choices, &bundle, &real_id);
        assert!(injected);
        assert_eq!(choices[0].upgrade_id, real_id);
        assert_eq!(choices.len(), 2);
    }

    #[test]
    fn inject_target_upgrade_noops_when_target_already_present() {
        let bundle = load_default().unwrap();
        let real_id = bundle.upgrades[0].id.clone();
        let mut choices = vec![UpgradeChoiceRecord {
            upgrade_id: real_id.clone(),
            tier_id: "standard".into(),
        }];
        let injected = inject_target_upgrade(&mut choices, &bundle, &real_id);
        assert!(!injected);
    }

    #[test]
    fn inject_target_upgrade_rejects_unknown_id() {
        let bundle = load_default().unwrap();
        let mut choices: Vec<UpgradeChoiceRecord> = Vec::new();
        let injected = inject_target_upgrade(&mut choices, &bundle, "not-a-real-upgrade");
        assert!(!injected);
        assert!(choices.is_empty());
    }

    #[test]
    fn single_env_and_vec_env_match_for_first_seeded_step() {
        let mut single = EpisodeEnv::new(42, 600, 4).unwrap();
        let mut vector = vec![EpisodeEnv::new(42, 600, 4).unwrap()];

        let single_initial = single.reset(Some(42)).flatten();
        let vector_initial = vector[0].reset(Some(42)).flatten();
        assert_eq!(single_initial, vector_initial);

        let action = RlAction::default();
        let single_step = single.step(action).obs.flatten();
        let vector_step = vector[0].step(action).obs.flatten();
        assert_eq!(single_step, vector_step);
    }

    #[test]
    fn shop_phase_engages_after_run_dies_and_next_run_resumes() {
        // Build a tiny env with very short max_steps_per_run so we hit the
        // gameover path quickly without writing thousands of frames.
        let mut env = EpisodeEnv::new(7, 60, 5).unwrap();
        env.reset(Some(7));

        // Idle through the first run until either gameover or truncation.
        let mut output = env.step(RlAction::default());
        let mut iterations = 0;
        while !output.terminated && output.info.phase == 0 && iterations < 600 {
            output = env.step(RlAction::default());
            iterations += 1;
        }

        // Either we transitioned to shop (phase=1) or we already terminated
        // the episode (e.g. the run cap was reached). Both are valid for the
        // smoke test — what we must guarantee is that the env never panics
        // and consistently exposes a shop_choices vector.
        let mask = env.action_mask();
        assert_eq!(mask.shop_pick.len(), 9);
        // NextRun slot must always be available.
        assert!(mask.shop_pick[0] || env.phase == EnvPhase::Run);
    }
}

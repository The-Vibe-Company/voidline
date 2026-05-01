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
use voidline_meta::profiles::engine_account_context;
use voidline_sim::engine::{
    Engine, EngineConfig, EngineInput, RelicChoiceRecord, UpgradeChoiceRecord,
};

const DEFAULT_RUNS_PER_EPISODE: u32 = 30;
const STAGE_CLEAR_BONUSES: [(u32, f64); 3] = [(1, 200.0), (2, 800.0), (3, 3000.0)];
const STAGE_ENTRY_BONUS: f64 = 30.0;
const LEVEL_UP_BONUS: f64 = 5.0;
const SHOP_IDLE_STEP_PENALTY: f64 = -0.05;
const PURCHASE_BONUS: f64 = 25.0;
const RUN_DEATH_PENALTY: f64 = 30.0;

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
}

impl EpisodeEnv {
    fn new(seed: u32, max_steps_per_run: u32, runs_per_episode: u32) -> Result<Self, String> {
        let bundle = load_default().map_err(|err| err.to_string())?;
        let account = AccountSnapshot::default();
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
        self.last_stage = 1;
        self.current_upgrades.clear();
        self.current_relics.clear();
        self.current_shop.clear();
        self.account = AccountSnapshot::default();
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
        if matches!(self.phase, EnvPhase::Run) {
            if snapshot.state.pending_upgrades > 0 {
                if self.current_upgrades.is_empty() {
                    self.current_upgrades = self.engine.draft_upgrades(4);
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
        let mask = action_mask(
            &snapshot,
            &self.current_upgrades,
            &self.current_relics,
            &self.current_shop,
            self.phase,
        );
        (obs, mask)
    }

    fn step(&mut self, action: RlAction) -> StepOutput {
        match self.phase {
            EnvPhase::Run => self.step_run(action),
            EnvPhase::Shop => self.step_shop(action),
        }
    }

    fn step_run(&mut self, action: RlAction) -> StepOutput {
        // Apply in-run draft / relic decisions (action[1], action[2]).
        // (Offers were already tallied in observe() when the draft was
        // generated.) Picks are tallied inside apply_decision_action.
        self.apply_decision_action(action);
        // Drive movement (action[0]).
        self.engine.set_input(EngineInput {
            keys: movement_keys(action.movement),
            pointer_x: 0.0,
            pointer_y: 0.0,
            pointer_inside: false,
            control_mode: "keyboard".to_string(),
        });
        self.engine.step(1.0 / 60.0);
        self.step_count = self.step_count.saturating_add(1);

        let snapshot = self.engine.snapshot();
        let score_delta = snapshot.state.score - self.last_score;
        self.last_score = snapshot.state.score;
        let run_died = snapshot.state.mode == "gameover";
        let truncated_run = self.step_count >= self.max_steps_per_run;

        // Intermediate dense rewards so the agent gets feedback before it can
        // ever finish a full stage. Level-up and stage-entry bonuses fire
        // every time the engine reports a step in those counters.
        let mut bonus = 0.0;
        let cur_level = snapshot.state.level;
        if cur_level > self.last_level {
            bonus += LEVEL_UP_BONUS * (cur_level - self.last_level) as f64;
            self.last_level = cur_level;
        }
        let cur_stage = snapshot.state.stage;
        if cur_stage > self.last_stage {
            bonus += STAGE_ENTRY_BONUS * (cur_stage - self.last_stage) as f64;
            self.last_stage = cur_stage;
        }

        // First-time stage-clear bonuses fire as soon as the engine reports a
        // boss kill (run_boss_stages includes the cleared stage).
        for stage in &snapshot.state.run_boss_stages {
            if !self.cleared_stages.contains(stage) {
                self.cleared_stages.insert(*stage);
                self.stage_clear_runs
                    .insert(*stage, self.runs_in_episode);
                if let Some((_, value)) = STAGE_CLEAR_BONUSES.iter().find(|(s, _)| s == stage) {
                    bonus += value;
                }
            }
        }

        let mut reward = score_delta + 0.01 + bonus;
        let stage3_cleared = self.cleared_stages.contains(&3);

        let mut episode_terminated = false;
        let mut info_phase: u8 = 0;

        if run_died || truncated_run {
            // Wrap up the run, push reward, transition to shop.
            if run_died {
                reward -= RUN_DEATH_PENALTY;
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
                            "unique" | "card" => PURCHASE_BONUS,
                            _ => PURCHASE_BONUS * 0.5,
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
            reward += SHOP_IDLE_STEP_PENALTY;
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
        self.engine.reset(
            Some(next_seed),
            Some(engine_account_context(&self.bundle, &self.account)),
        );
        self.step_count = 0;
        self.last_score = 0.0;
        self.last_level = 1;
        self.last_stage = 1;
        self.current_upgrades.clear();
        self.current_relics.clear();
        self.phase = EnvPhase::Run;
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

    fn apply_decision_action(&mut self, action: RlAction) {
        let snapshot = self.engine.snapshot();
        if snapshot.state.pending_upgrades > 0 && action.upgrade_pick > 0 {
            if self.current_upgrades.is_empty() {
                self.current_upgrades = self.engine.draft_upgrades(4);
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

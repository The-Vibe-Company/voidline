//! Automated run profiles used by balance reports.
//!
//! The idle profile preserves the historical meta-report behavior. Active
//! profiles drive the public Rust engine facade so movement, drafts, upgrades,
//! relics, and snapshots stay close to the browser runtime.

use std::collections::HashMap;
use std::fmt;
use std::path::{Path, PathBuf};

use serde::Serialize;
use voidline_data::catalogs::{Relic, Upgrade};
use voidline_data::DataBundle;
use voidline_sim::engine::{
    Engine, EngineAccountContext, EngineConfig, EngineInput, EngineRarityProfile, EngineSnapshot,
    RelicChoiceRecord, SnapshotPlayer, UpgradeChoiceRecord,
};

use crate::account::{
    current_rarity_profile, current_rarity_rank, meta_level, unlocked_build_tags,
    unlocked_technology_ids, AccountSnapshot,
};

#[cfg(feature = "learned-policy")]
use crate::learned_policy::LearnedPolicy;

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum PlayerProfileId {
    Idle,
    ExpertHuman,
    Optimizer,
    LearnedHuman,
    LearnedOptimizer,
    LearnedExplorer,
    LearnedNovice,
}

impl PlayerProfileId {
    pub fn as_str(&self) -> &'static str {
        match self {
            PlayerProfileId::Idle => "idle",
            PlayerProfileId::ExpertHuman => "expert-human",
            PlayerProfileId::Optimizer => "optimizer",
            PlayerProfileId::LearnedHuman => "learned-human",
            PlayerProfileId::LearnedOptimizer => "learned-optimizer",
            PlayerProfileId::LearnedExplorer => "learned-explorer",
            PlayerProfileId::LearnedNovice => "learned-novice",
        }
    }

    pub fn is_active(&self) -> bool {
        !matches!(self, PlayerProfileId::Idle)
    }

    pub fn is_learned(&self) -> bool {
        matches!(
            self,
            PlayerProfileId::LearnedHuman
                | PlayerProfileId::LearnedOptimizer
                | PlayerProfileId::LearnedExplorer
                | PlayerProfileId::LearnedNovice
        )
    }

    pub fn heuristic_fallback(&self) -> PlayerProfileId {
        match self {
            PlayerProfileId::LearnedOptimizer | PlayerProfileId::LearnedExplorer => {
                PlayerProfileId::Optimizer
            }
            PlayerProfileId::LearnedHuman | PlayerProfileId::LearnedNovice => {
                PlayerProfileId::ExpertHuman
            }
            other => other.clone(),
        }
    }
}

#[derive(Debug)]
pub enum RunPolicyError {
    MissingModel {
        profile: String,
        path: PathBuf,
    },
    ModelLoad {
        profile: String,
        path: PathBuf,
        message: String,
    },
}

impl fmt::Display for RunPolicyError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            RunPolicyError::MissingModel { profile, path } => {
                write!(f, "missing RL model for {profile}: {}", path.display())
            }
            RunPolicyError::ModelLoad {
                profile,
                path,
                message,
            } => write!(
                f,
                "failed to load RL model for {profile} at {}: {message}",
                path.display()
            ),
        }
    }
}

impl std::error::Error for RunPolicyError {}

pub trait RunPolicy {
    fn movement_keys(&mut self, bundle: &DataBundle, snapshot: &EngineSnapshot) -> Vec<String>;
    fn choose_upgrade(
        &mut self,
        bundle: &DataBundle,
        snapshot: &EngineSnapshot,
        choices: &[UpgradeChoiceRecord],
    ) -> Option<UpgradeChoiceRecord>;
    fn choose_relic(
        &mut self,
        bundle: &DataBundle,
        snapshot: &EngineSnapshot,
        choices: &[RelicChoiceRecord],
    ) -> Option<RelicChoiceRecord>;
}

struct HeuristicRunPolicy {
    profile: PlayerProfileId,
}

impl HeuristicRunPolicy {
    fn new(profile: PlayerProfileId) -> Self {
        Self {
            profile: profile.heuristic_fallback(),
        }
    }
}

impl RunPolicy for HeuristicRunPolicy {
    fn movement_keys(&mut self, _bundle: &DataBundle, snapshot: &EngineSnapshot) -> Vec<String> {
        movement_keys(&self.profile, snapshot)
    }

    fn choose_upgrade(
        &mut self,
        bundle: &DataBundle,
        snapshot: &EngineSnapshot,
        choices: &[UpgradeChoiceRecord],
    ) -> Option<UpgradeChoiceRecord> {
        choose_upgrade(bundle, &self.profile, snapshot, choices)
    }

    fn choose_relic(
        &mut self,
        bundle: &DataBundle,
        snapshot: &EngineSnapshot,
        choices: &[RelicChoiceRecord],
    ) -> Option<RelicChoiceRecord> {
        choose_relic(bundle, &self.profile, snapshot, choices)
    }
}

pub fn default_model_dir() -> PathBuf {
    std::env::var_os("VOIDLINE_RL_MODEL_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(".context/rl-models"))
}

pub fn model_path_for_profile(
    profile: &PlayerProfileId,
    model_dir: Option<&Path>,
) -> Option<PathBuf> {
    if !profile.is_learned() {
        return None;
    }
    let dir = model_dir
        .map(Path::to_path_buf)
        .unwrap_or_else(default_model_dir);
    Some(dir.join(format!("{}.onnx", profile.as_str())))
}

pub fn create_run_policy(
    profile: PlayerProfileId,
    model_dir: Option<&Path>,
) -> Result<Box<dyn RunPolicy>, RunPolicyError> {
    if profile.is_learned() {
        let path = model_path_for_profile(&profile, model_dir).expect("learned profile path");
        if cfg!(feature = "learned-policy") {
            #[cfg(feature = "learned-policy")]
            {
                Ok(Box::new(LearnedPolicy::load(profile.as_str(), &path)?))
            }
            #[cfg(not(feature = "learned-policy"))]
            unreachable!()
        } else {
            Err(RunPolicyError::ModelLoad {
                profile: profile.as_str().to_string(),
                path,
                message: "voidline-meta was built without the learned-policy feature".to_string(),
            })
        }
    } else {
        Ok(Box::new(HeuristicRunPolicy::new(profile)))
    }
}

#[derive(Debug, Clone, Copy, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunStatSnapshot {
    pub hp: f64,
    pub max_hp: f64,
    pub damage: f64,
    pub fire_rate: f64,
    pub projectile_count: f64,
    pub pierce: f64,
    pub drones: f64,
    pub shield: f64,
    pub shield_max: f64,
    pub crit_chance: f64,
    pub pickup_radius: f64,
    pub bullet_radius: f64,
    pub speed: f64,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileRunSummary {
    pub elapsed_seconds: f64,
    pub run_level: u32,
    pub final_pressure: u32,
    pub score: u64,
    pub boss_stages: Vec<u32>,
    pub died: bool,
    pub upgrade_offers: HashMap<String, u32>,
    pub upgrade_picks: HashMap<String, u32>,
    pub relic_offers: HashMap<String, u32>,
    pub relic_picks: HashMap<String, u32>,
    pub boss_spawn_stats: Option<RunStatSnapshot>,
    pub final_stats: RunStatSnapshot,
}

#[derive(Debug, Clone)]
pub struct ActiveRunOptions {
    pub seed: u32,
    pub max_seconds: f64,
    pub max_pressure: u32,
    pub step_seconds: f64,
    pub max_decisions_per_run: u32,
    pub learned_model_dir: Option<PathBuf>,
}

pub fn run_active_profile_trial(
    bundle: &DataBundle,
    account: &AccountSnapshot,
    profile: PlayerProfileId,
    options: ActiveRunOptions,
) -> Result<ProfileRunSummary, RunPolicyError> {
    debug_assert!(profile.is_active());
    let mut policy = create_run_policy(profile.clone(), options.learned_model_dir.as_deref())?;
    let mut engine = Engine::new(
        bundle.clone(),
        EngineConfig {
            seed: Some(options.seed),
            width: None,
            height: None,
            dpr: None,
            account: Some(engine_account_context(bundle, account)),
        },
    );

    let mut summary = ProfileRunSummary::default();
    let mut snapshot = engine.snapshot();
    let mut boss_spawn_recorded = false;
    let level_up_choice_count = current_level_up_choice_count(account);
    let mut steps = 0u32;
    let max_steps = ((options.max_seconds / options.step_seconds).ceil() as u32)
        .saturating_add(options.max_decisions_per_run)
        .saturating_add(600);

    while snapshot.state.run_elapsed_seconds < options.max_seconds
        && snapshot.state.mode != "gameover"
        && snapshot.state.pressure < options.max_pressure
        && steps < max_steps
    {
        resolve_pending_decisions(
            bundle,
            &mut engine,
            policy.as_mut(),
            level_up_choice_count,
            options.max_decisions_per_run,
            &mut summary,
        );
        snapshot = engine.snapshot();

        if !boss_spawn_recorded && snapshot.state.stage_boss_active {
            summary.boss_spawn_stats = Some(stats_from_player(&snapshot.player));
            boss_spawn_recorded = true;
        }

        let keys = policy.movement_keys(bundle, &snapshot);
        engine.set_input(EngineInput {
            keys,
            pointer_x: 0.0,
            pointer_y: 0.0,
            pointer_inside: false,
            control_mode: "keyboard".to_string(),
        });
        engine.step(options.step_seconds);
        snapshot = engine.snapshot();
        steps += 1;
    }

    Ok(finish_summary(summary, &snapshot))
}

pub fn engine_account_context(
    bundle: &DataBundle,
    account: &AccountSnapshot,
) -> EngineAccountContext {
    let mut unlocked_relic_ids = bundle.default_relic_ids.clone();
    for unlock in &bundle.relic_unlocks {
        if unlock.stage <= account.highest_stage_cleared as f64 {
            for id in &unlock.relic_ids {
                if !unlocked_relic_ids.iter().any(|value| value == id) {
                    unlocked_relic_ids.push(id.clone());
                }
            }
        }
    }
    EngineAccountContext {
        selected_character_id: account.selected_character_id.clone(),
        selected_weapon_id: account.selected_weapon_id.clone(),
        selected_start_stage: account.selected_start_stage.max(1),
        highest_start_stage_unlocked: account.highest_start_stage_unlocked.max(1),
        rarity_rank: current_rarity_rank(account),
        rarity_profile: {
            let profile = current_rarity_profile(account);
            EngineRarityProfile {
                rare: profile.rare,
                prototype: profile.prototype,
                singularity: profile.singularity,
            }
        },
        upgrade_tier_caps: upgrade_tier_caps(bundle, account),
        unlocked_technology_ids: unlocked_technology_ids(bundle, account)
            .into_iter()
            .collect(),
        unlocked_build_tags: unlocked_build_tags(bundle, account).into_iter().collect(),
        unlocked_relic_ids,
        level_up_choice_count: current_level_up_choice_count(account),
    }
}

pub fn current_level_up_choice_count(account: &AccountSnapshot) -> u32 {
    let extra_choice = account.level_of("unique:extra-choice") > 0;
    3 + u32::from(extra_choice)
}

fn upgrade_tier_caps(bundle: &DataBundle, account: &AccountSnapshot) -> HashMap<String, String> {
    let mut caps = HashMap::new();
    for meta in &bundle.meta_upgrades {
        if meta.kind != "card" {
            continue;
        }
        let Some(upgrade_id) = &meta.upgrade_id else {
            continue;
        };
        if let Some(tier_id) = tier_cap_at_level(meta_level(account, meta)) {
            caps.insert(upgrade_id.clone(), tier_id.to_string());
        }
    }
    caps
}

fn tier_cap_at_level(level: u32) -> Option<&'static str> {
    match level {
        0 => None,
        1 => Some("standard"),
        2 => Some("rare"),
        3 => Some("prototype"),
        _ => Some("singularity"),
    }
}

pub fn finish_summary(
    mut summary: ProfileRunSummary,
    snapshot: &EngineSnapshot,
) -> ProfileRunSummary {
    summary.elapsed_seconds = snapshot.state.run_elapsed_seconds;
    summary.run_level = snapshot.state.level;
    summary.final_pressure = snapshot.state.pressure;
    summary.score = snapshot.state.score.max(0.0) as u64;
    summary.boss_stages = snapshot.state.run_boss_stages.clone();
    summary.died = snapshot.state.mode == "gameover";
    summary.final_stats = stats_from_player(&snapshot.player);
    summary
}

fn resolve_pending_decisions(
    bundle: &DataBundle,
    engine: &mut Engine,
    policy: &mut dyn RunPolicy,
    level_up_choice_count: u32,
    max_decisions: u32,
    summary: &mut ProfileRunSummary,
) {
    let mut decisions = 0;
    loop {
        if decisions >= max_decisions {
            break;
        }
        let snapshot = engine.snapshot();
        if snapshot.state.pending_upgrades > 0 {
            let choices = engine.draft_upgrades(level_up_choice_count.max(1));
            for choice in &choices {
                *summary
                    .upgrade_offers
                    .entry(choice.upgrade_id.clone())
                    .or_insert(0) += 1;
            }
            if let Some(choice) = policy.choose_upgrade(bundle, &snapshot, &choices) {
                *summary
                    .upgrade_picks
                    .entry(choice.upgrade_id.clone())
                    .or_insert(0) += 1;
                let _ = engine.apply_upgrade(&choice.upgrade_id, &choice.tier_id);
            }
            decisions += 1;
            continue;
        }
        if snapshot.state.pending_chests > 0 {
            let choices = engine.draft_relics(3);
            for choice in &choices {
                *summary
                    .relic_offers
                    .entry(choice.relic_id.clone())
                    .or_insert(0) += 1;
            }
            if let Some(choice) = policy.choose_relic(bundle, &snapshot, &choices) {
                *summary
                    .relic_picks
                    .entry(choice.relic_id.clone())
                    .or_insert(0) += 1;
                let _ = engine.apply_relic(&choice.relic_id);
            }
            decisions += 1;
            continue;
        }
        break;
    }
}

fn choose_upgrade(
    bundle: &DataBundle,
    profile: &PlayerProfileId,
    snapshot: &EngineSnapshot,
    choices: &[UpgradeChoiceRecord],
) -> Option<UpgradeChoiceRecord> {
    choices
        .iter()
        .max_by(|a, b| {
            let a_score = upgrade_score(bundle, profile, snapshot, a);
            let b_score = upgrade_score(bundle, profile, snapshot, b);
            a_score
                .partial_cmp(&b_score)
                .unwrap_or(std::cmp::Ordering::Equal)
        })
        .cloned()
}

fn choose_relic(
    bundle: &DataBundle,
    profile: &PlayerProfileId,
    snapshot: &EngineSnapshot,
    choices: &[RelicChoiceRecord],
) -> Option<RelicChoiceRecord> {
    choices
        .iter()
        .max_by(|a, b| {
            let a_score = relic_score(bundle, profile, snapshot, a);
            let b_score = relic_score(bundle, profile, snapshot, b);
            a_score
                .partial_cmp(&b_score)
                .unwrap_or(std::cmp::Ordering::Equal)
        })
        .cloned()
}

fn upgrade_score(
    bundle: &DataBundle,
    profile: &PlayerProfileId,
    snapshot: &EngineSnapshot,
    choice: &UpgradeChoiceRecord,
) -> f64 {
    let Some(upgrade) = bundle.upgrades.iter().find(|u| u.id == choice.upgrade_id) else {
        return 0.0;
    };
    let tier_power = bundle
        .balance
        .tiers
        .iter()
        .find(|tier| tier.id == choice.tier_id)
        .map(|tier| tier.power)
        .unwrap_or(1.0);

    let hp_ratio = snapshot.player.hp / snapshot.player.max_hp.max(1.0);
    let mut score = base_upgrade_score(upgrade, profile);
    score *= tier_power;
    score += synergy_completion_bonus(bundle, snapshot, &upgrade.tags, profile);
    if upgrade.tags.iter().any(|tag| tag == "shield") && hp_ratio < 0.45 {
        score += if *profile == PlayerProfileId::Optimizer {
            16.0
        } else {
            26.0
        };
    }
    if upgrade.tags.iter().any(|tag| tag == "magnet") && snapshot.state.level <= 4 {
        score += if *profile == PlayerProfileId::Optimizer {
            10.0
        } else {
            16.0
        };
    }
    if *profile == PlayerProfileId::Optimizer && upgrade.tags.iter().any(|tag| tag == "cannon") {
        score += 8.0;
    }
    score
}

fn relic_score(
    bundle: &DataBundle,
    profile: &PlayerProfileId,
    snapshot: &EngineSnapshot,
    choice: &RelicChoiceRecord,
) -> f64 {
    let relic = bundle
        .relics
        .iter()
        .find(|r| r.id == choice.relic_id)
        .unwrap_or(&bundle.fallback_relic);
    let hp_ratio = snapshot.player.hp / snapshot.player.max_hp.max(1.0);
    let mut score = base_relic_score(relic, profile);
    score += synergy_completion_bonus(bundle, snapshot, &relic.tags, profile);
    if relic
        .tags
        .iter()
        .any(|tag| tag == "shield" || tag == "salvage")
        && hp_ratio < 0.45
    {
        score += if *profile == PlayerProfileId::Optimizer {
            10.0
        } else {
            20.0
        };
    }
    if *profile == PlayerProfileId::Optimizer && relic.tags.iter().any(|tag| tag == "cannon") {
        score += 7.0;
    }
    score
}

fn base_upgrade_score(upgrade: &Upgrade, profile: &PlayerProfileId) -> f64 {
    let optimizer = *profile == PlayerProfileId::Optimizer;
    match upgrade.id.as_str() {
        "twin-cannon" => {
            if optimizer {
                52.0
            } else {
                45.0
            }
        }
        "rail-slug" => {
            if optimizer {
                56.0
            } else {
                48.0
            }
        }
        "plasma-core" => {
            if optimizer {
                54.0
            } else {
                44.0
            }
        }
        "pulse-overdrive" => {
            if optimizer {
                52.0
            } else {
                44.0
            }
        }
        "scatter-loader" => {
            if optimizer {
                55.0
            } else {
                46.0
            }
        }
        "lance-capacitor" => {
            if optimizer {
                52.0
            } else {
                44.0
            }
        }
        "drone-uplink" => {
            if optimizer {
                49.0
            } else {
                45.0
            }
        }
        "kinetic-shield" => {
            if optimizer {
                36.0
            } else {
                38.0
            }
        }
        "magnet-array" => {
            if optimizer {
                40.0
            } else {
                36.0
            }
        }
        "crit-array" => {
            if optimizer {
                44.0
            } else {
                36.0
            }
        }
        "heavy-caliber" => {
            if optimizer {
                40.0
            } else {
                35.0
            }
        }
        "ion-engine" => {
            if optimizer {
                42.0
            } else {
                36.0
            }
        }
        _ => 20.0,
    }
}

fn base_relic_score(relic: &Relic, profile: &PlayerProfileId) -> f64 {
    let optimizer = *profile == PlayerProfileId::Optimizer;
    match relic.id.as_str() {
        "splitter-matrix" => {
            if optimizer {
                56.0
            } else {
                48.0
            }
        }
        "rail-focus" => {
            if optimizer {
                51.0
            } else {
                42.0
            }
        }
        "reactor-surge" => {
            if optimizer {
                50.0
            } else {
                40.0
            }
        }
        "critical-orbit" => {
            if optimizer {
                50.0
            } else {
                42.0
            }
        }
        "drone-contract" => {
            if optimizer {
                47.0
            } else {
                44.0
            }
        }
        "salvage-plating" => {
            if optimizer {
                32.0
            } else {
                38.0
            }
        }
        "emergency-nanites" => {
            if optimizer {
                34.0
            } else {
                36.0
            }
        }
        "magnetized-map" => {
            if optimizer {
                36.0
            } else {
                36.0
            }
        }
        "field-repair" => 24.0,
        _ => 18.0,
    }
}

fn synergy_completion_bonus(
    bundle: &DataBundle,
    snapshot: &EngineSnapshot,
    tags: &[String],
    profile: &PlayerProfileId,
) -> f64 {
    let counts = build_tag_counts(bundle, snapshot);
    let bonus = if *profile == PlayerProfileId::Optimizer {
        34.0
    } else {
        22.0
    };
    let tag_count = |tag: &str| *counts.get(tag).unwrap_or(&0);
    let has = |tag: &str| tags.iter().any(|candidate| candidate == tag);

    let synergies: &[(&[&str], &[u32])] = &[
        (&["cannon", "crit", "pierce"], &[1, 1, 1]),
        (&["drone", "cannon"], &[1, 1]),
        (&["shield", "salvage"], &[1, 1]),
        (&["magnet"], &[2]),
    ];
    for (required_tags, required_counts) in synergies {
        let has_progress = required_tags
            .iter()
            .any(|tag| tag_count(tag) > 0 || has(tag));
        let mut missing_after = 0;
        let mut fills_missing = false;
        for (tag, required) in required_tags.iter().zip(*required_counts) {
            let before = tag_count(tag);
            let after = before + u32::from(has(tag));
            if before < *required && after >= *required {
                fills_missing = true;
            }
            if after < *required {
                missing_after += 1;
            }
        }
        if has_progress && fills_missing {
            return if missing_after == 0 {
                bonus
            } else {
                bonus * 0.45
            };
        }
    }
    0.0
}

fn build_tag_counts(bundle: &DataBundle, snapshot: &EngineSnapshot) -> HashMap<String, u32> {
    let mut counts = HashMap::new();
    for owned in &snapshot.owned_upgrades {
        if let Some(upgrade) = bundle
            .upgrades
            .iter()
            .find(|candidate| candidate.id == owned.upgrade_id)
        {
            for tag in &upgrade.tags {
                *counts.entry(tag.clone()).or_insert(0) += owned.count.max(1);
            }
        }
    }
    for owned in &snapshot.owned_relics {
        let relic = bundle
            .relics
            .iter()
            .find(|candidate| candidate.id == owned.relic_id)
            .or_else(|| {
                (bundle.fallback_relic.id == owned.relic_id).then_some(&bundle.fallback_relic)
            });
        if let Some(relic) = relic {
            for tag in &relic.tags {
                *counts.entry(tag.clone()).or_insert(0) += owned.count.max(1);
            }
        }
    }
    counts
}

fn movement_keys(profile: &PlayerProfileId, snapshot: &EngineSnapshot) -> Vec<String> {
    let (dx, dy) = movement_vector(profile, snapshot);
    let mut keys = Vec::new();
    if dx > 0.2 {
        keys.push("KeyD".to_string());
    } else if dx < -0.2 {
        keys.push("KeyA".to_string());
    }
    if dy > 0.2 {
        keys.push("KeyS".to_string());
    } else if dy < -0.2 {
        keys.push("KeyW".to_string());
    }
    keys
}

fn movement_vector(profile: &PlayerProfileId, snapshot: &EngineSnapshot) -> (f64, f64) {
    let px = snapshot.player.x;
    let py = snapshot.player.y;
    let mut vx = 0.0;
    let mut vy = 0.0;
    let mut nearest_threat = f64::INFINITY;

    for enemy in &snapshot.enemies {
        let away_x = px - enemy.x;
        let away_y = py - enemy.y;
        let dist = (away_x * away_x + away_y * away_y).sqrt().max(1.0);
        nearest_threat = nearest_threat.min(dist - enemy.radius - snapshot.player.radius);
        let is_boss = enemy.role == "boss" || enemy.role == "mini-boss";
        let danger = if is_boss {
            520.0
        } else {
            240.0 + enemy.radius * 2.2
        };
        if dist < danger {
            let weight = ((danger - dist) / danger).powi(2) * if is_boss { 2.4 } else { 1.0 };
            vx += away_x / dist * weight;
            vy += away_y / dist * weight;
        }
        if is_boss && dist > 300.0 && dist < 760.0 {
            let tangent = if *profile == PlayerProfileId::Optimizer {
                0.35
            } else {
                0.55
            };
            vx += -away_y / dist * tangent;
            vy += away_x / dist * tangent;
        }
    }

    let margin = 260.0;
    if px < margin {
        vx += (margin - px) / margin;
    }
    if px > snapshot.world.arena_width - margin {
        vx -= (px - (snapshot.world.arena_width - margin)) / margin;
    }
    if py < margin {
        vy += (margin - py) / margin;
    }
    if py > snapshot.world.arena_height - margin {
        vy -= (py - (snapshot.world.arena_height - margin)) / margin;
    }

    let collect_threshold = if *profile == PlayerProfileId::Optimizer {
        220.0
    } else {
        320.0
    };
    if nearest_threat > collect_threshold {
        if let Some((tx, ty)) = nearest_orb(snapshot, px, py) {
            let to_x = tx - px;
            let to_y = ty - py;
            let dist = (to_x * to_x + to_y * to_y).sqrt().max(1.0);
            let pull = if *profile == PlayerProfileId::Optimizer {
                1.1
            } else {
                0.8
            };
            vx += to_x / dist * pull;
            vy += to_y / dist * pull;
        }
    }

    normalize(vx, vy)
}

fn nearest_orb(snapshot: &EngineSnapshot, px: f64, py: f64) -> Option<(f64, f64)> {
    snapshot
        .experience_orbs
        .iter()
        .min_by(|a, b| {
            let da = (a.x - px).powi(2) + (a.y - py).powi(2);
            let db = (b.x - px).powi(2) + (b.y - py).powi(2);
            da.partial_cmp(&db).unwrap_or(std::cmp::Ordering::Equal)
        })
        .map(|orb| (orb.x, orb.y))
}

fn normalize(x: f64, y: f64) -> (f64, f64) {
    let len = (x * x + y * y).sqrt();
    if len <= 1e-9 {
        (0.0, 0.0)
    } else {
        (x / len, y / len)
    }
}

fn stats_from_player(player: &SnapshotPlayer) -> RunStatSnapshot {
    RunStatSnapshot {
        hp: player.hp,
        max_hp: player.max_hp,
        damage: player.damage,
        fire_rate: player.fire_rate,
        projectile_count: player.projectile_count,
        pierce: player.pierce,
        drones: player.drones,
        shield: player.shield,
        shield_max: player.shield_max,
        crit_chance: player.crit_chance,
        pickup_radius: player.pickup_radius,
        bullet_radius: player.bullet_radius,
        speed: player.speed,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use voidline_data::load_default;

    #[test]
    fn level_up_choice_count_matches_account_unlocks() {
        let mut account = AccountSnapshot::default();
        assert_eq!(current_level_up_choice_count(&account), 3);
        account
            .upgrade_levels
            .insert("rarity:rare-signal".to_string(), 3);
        assert_eq!(current_level_up_choice_count(&account), 3);
        account
            .upgrade_levels
            .insert("unique:extra-choice".to_string(), 1);
        assert_eq!(current_level_up_choice_count(&account), 4);
    }

    #[test]
    fn account_context_unlocks_relics_from_cleared_stages() {
        let bundle = load_default().unwrap();
        let mut account = AccountSnapshot::default();
        account.highest_stage_cleared = 2;

        let context = engine_account_context(&bundle, &account);

        assert!(context
            .unlocked_relic_ids
            .iter()
            .any(|id| id == "splitter-matrix"));
        assert!(context
            .unlocked_relic_ids
            .iter()
            .any(|id| id == "drone-contract"));
        assert!(!context
            .unlocked_relic_ids
            .iter()
            .any(|id| id == "critical-orbit"));
    }

    #[test]
    fn active_profile_runs_are_deterministic_for_same_seed() {
        let bundle = load_default().unwrap();
        let account = AccountSnapshot::default();
        let options = ActiveRunOptions {
            seed: 42,
            max_seconds: 8.0,
            max_pressure: 3,
            step_seconds: 1.0 / 60.0,
            max_decisions_per_run: 8,
            learned_model_dir: None,
        };

        let a = run_active_profile_trial(
            &bundle,
            &account,
            PlayerProfileId::ExpertHuman,
            options.clone(),
        )
        .unwrap();
        let b = run_active_profile_trial(&bundle, &account, PlayerProfileId::ExpertHuman, options)
            .unwrap();

        assert_eq!(a.final_pressure, b.final_pressure);
        assert_eq!(a.run_level, b.run_level);
        assert_eq!(a.upgrade_picks, b.upgrade_picks);
        assert_eq!(a.relic_picks, b.relic_picks);
        assert!((a.final_stats.hp - b.final_stats.hp).abs() < 1e-9);
    }

    #[test]
    fn learned_profile_trial_surfaces_missing_model_error() {
        let bundle = load_default().unwrap();
        let account = AccountSnapshot::default();
        let options = ActiveRunOptions {
            seed: 42,
            max_seconds: 1.0,
            max_pressure: 1,
            step_seconds: 1.0 / 60.0,
            max_decisions_per_run: 1,
            learned_model_dir: Some(std::env::temp_dir().join("voidline-missing-rl-models")),
        };

        let err =
            run_active_profile_trial(&bundle, &account, PlayerProfileId::LearnedHuman, options)
                .unwrap_err();

        assert!(matches!(err, RunPolicyError::MissingModel { .. }));
    }
}

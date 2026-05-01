//! Voidline CLI — runs meta-progression campaigns in parallel via rayon
//! and emits a JSON report.

use std::collections::HashMap;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use clap::{ArgAction, Parser, ValueEnum};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use voidline_data::DataBundle;
use voidline_meta::campaign::{
    run_meta_campaign, CampaignCheckpoint, CampaignOptions, CampaignResult,
};
use voidline_meta::policies::{
    FocusedAttackPolicy, GreedyCheapPolicy, HoarderPolicy, MetaPolicy, PolicyId, RandomPolicy,
};
use voidline_meta::profiles::{default_model_dir, model_path_for_profile, RunStatSnapshot};
use voidline_meta::{PlayerProfileId, ProfileRunSummary};

#[derive(Clone, Debug, ValueEnum)]
enum PlayerProfileArg {
    Idle,
    ExpertHuman,
    Optimizer,
    LearnedHuman,
    LearnedOptimizer,
    LearnedExplorer,
    LearnedNovice,
    LearnedAll,
    Skilled,
    All,
}

impl PlayerProfileArg {
    fn as_str(&self) -> &'static str {
        match self {
            PlayerProfileArg::Idle => "idle",
            PlayerProfileArg::ExpertHuman => "expert-human",
            PlayerProfileArg::Optimizer => "optimizer",
            PlayerProfileArg::LearnedHuman => "learned-human",
            PlayerProfileArg::LearnedOptimizer => "learned-optimizer",
            PlayerProfileArg::LearnedExplorer => "learned-explorer",
            PlayerProfileArg::LearnedNovice => "learned-novice",
            PlayerProfileArg::LearnedAll => "learned-all",
            PlayerProfileArg::Skilled => "skilled",
            PlayerProfileArg::All => "all",
        }
    }

    fn expand(&self) -> Vec<PlayerProfileId> {
        match self {
            PlayerProfileArg::Idle => vec![PlayerProfileId::Idle],
            PlayerProfileArg::ExpertHuman => vec![PlayerProfileId::ExpertHuman],
            PlayerProfileArg::Optimizer => vec![PlayerProfileId::Optimizer],
            PlayerProfileArg::LearnedHuman => vec![PlayerProfileId::LearnedHuman],
            PlayerProfileArg::LearnedOptimizer => vec![PlayerProfileId::LearnedOptimizer],
            PlayerProfileArg::LearnedExplorer => vec![PlayerProfileId::LearnedExplorer],
            PlayerProfileArg::LearnedNovice => vec![PlayerProfileId::LearnedNovice],
            PlayerProfileArg::LearnedAll => vec![
                PlayerProfileId::LearnedHuman,
                PlayerProfileId::LearnedOptimizer,
                PlayerProfileId::LearnedExplorer,
                PlayerProfileId::LearnedNovice,
            ],
            PlayerProfileArg::Skilled => {
                vec![PlayerProfileId::ExpertHuman, PlayerProfileId::Optimizer]
            }
            PlayerProfileArg::All => vec![
                PlayerProfileId::Idle,
                PlayerProfileId::ExpertHuman,
                PlayerProfileId::Optimizer,
            ],
        }
    }
}

#[derive(Clone, Debug, ValueEnum)]
enum CheckTargetArg {
    Phase1,
    Balance,
}

impl CheckTargetArg {
    fn as_str(&self) -> &'static str {
        match self {
            CheckTargetArg::Phase1 => "phase1",
            CheckTargetArg::Balance => "balance",
        }
    }
}

#[derive(Clone, Debug, ValueEnum)]
enum PolicySetArg {
    All,
    Focused,
}

impl PolicySetArg {
    fn as_str(&self) -> &'static str {
        match self {
            PolicySetArg::All => "all",
            PolicySetArg::Focused => "focused",
        }
    }

    fn policy_count(&self) -> usize {
        match self {
            PolicySetArg::All => 4,
            PolicySetArg::Focused => 1,
        }
    }
}

#[derive(Clone, Debug, ValueEnum, PartialEq, Eq)]
enum PhaseArg {
    Full,
    Stage1,
    Stage2,
    Stage3,
}

impl PhaseArg {
    fn as_str(&self) -> &'static str {
        match self {
            PhaseArg::Full => "full",
            PhaseArg::Stage1 => "stage1",
            PhaseArg::Stage2 => "stage2",
            PhaseArg::Stage3 => "stage3",
        }
    }

    fn checkpoint_stage(&self) -> Option<u32> {
        match self {
            PhaseArg::Full | PhaseArg::Stage1 => None,
            PhaseArg::Stage2 => Some(1),
            PhaseArg::Stage3 => Some(2),
        }
    }

    fn is_isolated(&self) -> bool {
        matches!(self, PhaseArg::Stage2 | PhaseArg::Stage3)
    }
}

#[derive(Parser, Debug)]
#[command(name = "voidline-cli", about = "Voidline meta-progression report")]
struct Args {
    /// Path to balance.json (defaults to <repo>/data/balance.json)
    #[arg(long)]
    balance: Option<PathBuf>,

    /// Output JSON report path
    #[arg(long, default_value = "scripts/meta-progression-report.json")]
    output: PathBuf,

    /// Quick mode: smaller config for fast iteration
    #[arg(long, conflicts_with = "default_mode")]
    quick: bool,

    /// Default mode (deeper pressure cap, ~30s wall-clock budget)
    #[arg(long = "default", conflicts_with = "quick")]
    default_mode: bool,

    /// Wall-clock budget (seconds), abort if exceeded
    #[arg(long, default_value_t = 30.0)]
    max_seconds: f64,

    /// Override number of campaigns per policy
    #[arg(long)]
    campaigns: Option<u32>,

    /// Override runs per campaign
    #[arg(long)]
    runs: Option<u32>,

    /// Override max pressure per trial
    #[arg(long)]
    max_pressure: Option<u32>,

    /// Override max simulated seconds per trial
    #[arg(long)]
    trial_seconds: Option<f64>,

    /// Threads (defaults to rayon's auto)
    #[arg(long)]
    threads: Option<usize>,

    /// Player profile used by the run simulator
    #[arg(long, value_enum, default_value = "idle")]
    player_profile: PlayerProfileArg,

    /// Directory containing learned RL ONNX models.
    #[arg(long)]
    model_dir: Option<PathBuf>,

    /// Base seed used to derive deterministic campaign/run seeds
    #[arg(long, default_value_t = 1109)]
    seed: u32,

    /// Optional balance check to enforce after writing the report
    #[arg(long, value_enum)]
    check_target: Option<CheckTargetArg>,

    /// Policy set to simulate. Balance checks only need focused-attack.
    #[arg(long, value_enum, default_value = "all")]
    policy_set: PolicySetArg,

    /// Fixed in-memory override, e.g. balance.bosses.stageScaling.hpPerStage=120
    #[arg(long = "set")]
    set_overrides: Vec<String>,

    /// Sweep an in-memory override over comma-separated values.
    #[arg(long = "sweep")]
    sweeps: Vec<String>,

    /// Include a baseline row when running a sweep.
    #[arg(long, default_value_t = true, action = ArgAction::Set)]
    include_baseline: bool,

    /// Max number of generated variations, including baseline.
    #[arg(long, default_value_t = 48)]
    max_variations: usize,

    /// Phase mode. full is the validating path; stage2/stage3 use checkpoints.
    #[arg(long, value_enum, default_value = "full")]
    phase: PhaseArg,

    /// Write captured checkpoints to this file.
    #[arg(long)]
    checkpoint_out: Option<PathBuf>,

    /// Read phase checkpoints from this file.
    #[arg(long)]
    checkpoint_in: Option<PathBuf>,

    /// Directory for automatic phase checkpoints.
    #[arg(long, default_value = ".context/balance-checkpoints")]
    checkpoint_dir: PathBuf,

    /// Rebuild automatic checkpoints even when cached files exist.
    #[arg(long)]
    refresh_checkpoints: bool,

    /// Append a compact replayable snapshot to the history JSONL file
    #[arg(long)]
    record_history: bool,

    /// History JSONL path used with --record-history
    #[arg(long, default_value = "data/balance-profile-history.jsonl")]
    history_path: PathBuf,

    /// Allow history recording when the git worktree is dirty
    #[arg(long)]
    allow_dirty_history: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PercentileSummary {
    p25: Option<f64>,
    p50: Option<f64>,
    p75: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PickRateSection {
    id: String,
    offers: u32,
    picks: u32,
    offer_rate_per_run: f64,
    pick_rate_when_offered: f64,
    picked_run_rate: f64,
    clear_lift: f64,
    median_pressure_lift: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BalanceWarning {
    kind: String,
    subject: String,
    message: String,
    value: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StatSnapshotSummary {
    hp: Option<f64>,
    max_hp: Option<f64>,
    damage: Option<f64>,
    fire_rate: Option<f64>,
    projectile_count: Option<f64>,
    pierce: Option<f64>,
    drones: Option<f64>,
    shield: Option<f64>,
    shield_max: Option<f64>,
    crit_chance: Option<f64>,
    pickup_radius: Option<f64>,
    bullet_radius: Option<f64>,
    speed: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
struct PolicySection {
    policy: String,
    campaigns: u32,
    runs_per_campaign: u32,
    median_runs_to_unlock: HashMap<String, f64>,
    p25_runs_to_unlock: HashMap<String, f64>,
    p75_runs_to_unlock: HashMap<String, f64>,
    median_pressure_at_run_index: HashMap<String, f64>,
    median_first_stage1_clear: Option<f64>,
    median_first_stage2_clear: Option<f64>,
    median_first_stage3_clear: Option<f64>,
    median_first_boss_kill: Option<f64>,
    median_final_crystals: f64,
    deaths_rate_per_run: f64,
    runs_to_stage1_clear: PercentileSummary,
    runs_to_first_boss_kill: PercentileSummary,
    runs_to_stage2_clear: PercentileSummary,
    runs_to_stage3_clear: PercentileSummary,
    cumulative_runs_to_stage1_clear: PercentileSummary,
    cumulative_runs_to_stage2_clear: PercentileSummary,
    cumulative_runs_to_stage3_clear: PercentileSummary,
    stage1_clear_rate: f64,
    stage2_clear_rate: f64,
    stage3_clear_rate: f64,
    boss_kill_rate: f64,
    median_run_level: Option<f64>,
    median_elapsed_seconds: Option<f64>,
    upgrade_pick_rates: Vec<PickRateSection>,
    relic_pick_rates: Vec<PickRateSection>,
    warnings: Vec<BalanceWarning>,
    median_boss_spawn_stats: Option<StatSnapshotSummary>,
    median_final_stats: Option<StatSnapshotSummary>,
}

#[derive(Debug, Clone, Serialize)]
struct ProfileSection {
    player_profile: String,
    policies: Vec<PolicySection>,
}

#[derive(Debug, Clone, Serialize)]
struct Report {
    generated_at: String,
    config: ReportConfig,
    profiles: Vec<ProfileSection>,
    /// Compatibility mirror for consumers that read the historical top-level
    /// policy list. This contains the first requested profile.
    policies: Vec<PolicySection>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SweepReport {
    generated_at: String,
    config: SweepConfig,
    variations: Vec<VariationResult>,
    summary_table: Vec<VariationSummaryRow>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SweepConfig {
    include_baseline: bool,
    max_variations: usize,
    axes: Vec<SweepAxisSummary>,
    fixed_overrides: Vec<OverrideSpec>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SweepAxisSummary {
    path: String,
    values: Vec<Value>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct VariationResult {
    name: String,
    overrides: Vec<OverrideSpec>,
    report: Report,
    check_errors: Vec<String>,
    passed: bool,
    elapsed_seconds: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct VariationSummaryRow {
    variation: String,
    overrides: Vec<OverrideSpec>,
    expert_human_stage1_p50: Option<f64>,
    expert_human_stage2_p50: Option<f64>,
    expert_human_stage3_p50: Option<f64>,
    optimizer_stage1_p50: Option<f64>,
    optimizer_stage2_p50: Option<f64>,
    optimizer_stage3_p50: Option<f64>,
    stage1_clear_rate: Option<f64>,
    stage2_clear_rate: Option<f64>,
    stage3_clear_rate: Option<f64>,
    warning_count: usize,
    op_pick_count: usize,
    passed: bool,
    check_errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Phase1Thresholds {
    expert_human_stage1_p50_min: f64,
    expert_human_stage1_p50_max: f64,
    expert_human_stage1_p75_max: f64,
    optimizer_stage1_p50_min: f64,
    expert_human_stage2_p50_min: f64,
    expert_human_stage2_p50_max: f64,
    optimizer_stage2_p50_min: f64,
    expert_human_stage3_p50_min: f64,
    expert_human_stage3_p50_max: f64,
    optimizer_stage3_p50_min: f64,
    min_campaigns_for_check: u32,
    min_runs_for_check: u32,
    min_trial_seconds_for_check: f64,
    min_min_max_pressure_for_check: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ReportConfig {
    quick: bool,
    campaigns: u32,
    runs_per_campaign: u32,
    max_pressure: u32,
    trial_seconds: f64,
    seed: u32,
    player_profile_arg: String,
    player_profiles: Vec<String>,
    model_dir: Option<String>,
    policy_set: String,
    phase: String,
    phase_isolated: bool,
    checkpoint_in: Option<String>,
    checkpoint_out: Option<String>,
    check_target: Option<String>,
    thresholds: Phase1Thresholds,
    threads: usize,
    elapsed_seconds: f64,
}

#[derive(Debug, Clone, Copy)]
struct ReportProfile {
    campaigns: u32,
    runs: u32,
    max_pressure: u32,
    trial_seconds: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct OverrideSpec {
    path: String,
    value: Value,
}

#[derive(Debug, Clone)]
struct SweepAxis {
    path: String,
    values: Vec<Value>,
}

#[derive(Debug, Clone)]
struct VariationSpec {
    name: String,
    overrides: Vec<OverrideSpec>,
}

#[derive(Debug, Clone)]
struct RunSettings {
    campaigns: u32,
    runs: u32,
    max_pressure: u32,
    trial_seconds: f64,
    player_profiles: Vec<PlayerProfileId>,
    model_dir: Option<PathBuf>,
    thresholds: Phase1Thresholds,
    base_options: CampaignOptions,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CheckpointFile {
    schema_version: u32,
    base_data_hash: String,
    profile: String,
    policy: String,
    checkpoint_stage: u32,
    checkpoints: Vec<CampaignCheckpoint>,
}

impl Default for Phase1Thresholds {
    fn default() -> Self {
        Self {
            expert_human_stage1_p50_min: 10.0,
            expert_human_stage1_p50_max: 20.0,
            expert_human_stage1_p75_max: 45.0,
            optimizer_stage1_p50_min: 5.0,
            expert_human_stage2_p50_min: 40.0,
            expert_human_stage2_p50_max: 60.0,
            optimizer_stage2_p50_min: 20.0,
            expert_human_stage3_p50_min: 85.0,
            expert_human_stage3_p50_max: 115.0,
            optimizer_stage3_p50_min: 45.0,
            min_campaigns_for_check: 12,
            min_runs_for_check: 120,
            min_trial_seconds_for_check: 660.0,
            min_min_max_pressure_for_check: 50,
        }
    }
}

impl ReportProfile {
    fn quick() -> Self {
        Self {
            campaigns: 15,
            runs: 25,
            max_pressure: 12,
            trial_seconds: 90.0,
        }
    }

    fn default() -> Self {
        Self {
            campaigns: 50,
            runs: 40,
            max_pressure: 30,
            trial_seconds: 240.0,
        }
    }
}

fn parse_override(raw: &str) -> Result<OverrideSpec, String> {
    let (path, value) = raw
        .split_once('=')
        .ok_or_else(|| format!("override must be path=value: {raw}"))?;
    validate_override_path(path)?;
    Ok(OverrideSpec {
        path: path.to_string(),
        value: parse_override_value(value),
    })
}

fn parse_sweep(raw: &str) -> Result<SweepAxis, String> {
    let (path, values) = raw
        .split_once('=')
        .ok_or_else(|| format!("sweep must be path=v1,v2: {raw}"))?;
    validate_override_path(path)?;
    let values: Vec<Value> = values.split(',').map(parse_override_value).collect();
    if values.is_empty() {
        return Err(format!("sweep has no values: {raw}"));
    }
    Ok(SweepAxis {
        path: path.to_string(),
        values,
    })
}

fn validate_override_path(path: &str) -> Result<(), String> {
    if path.is_empty() {
        return Err("override path cannot be empty".to_string());
    }
    if path.contains('[') || path.contains(']') {
        return Err(format!("array paths are not supported yet: {path}"));
    }
    if path.split('.').any(|part| part.is_empty()) {
        return Err(format!("override path contains an empty segment: {path}"));
    }
    Ok(())
}

fn parse_override_value(raw: &str) -> Value {
    serde_json::from_str(raw).unwrap_or_else(|_| Value::String(raw.to_string()))
}

fn build_variations(
    fixed: &[OverrideSpec],
    axes: &[SweepAxis],
    include_baseline: bool,
    max_variations: usize,
) -> Result<Vec<VariationSpec>, String> {
    let mut out = Vec::new();
    if include_baseline {
        out.push(VariationSpec {
            name: "baseline".to_string(),
            overrides: fixed.to_vec(),
        });
    }
    if axes.is_empty() {
        if out.is_empty() {
            out.push(VariationSpec {
                name: "override".to_string(),
                overrides: fixed.to_vec(),
            });
        }
        return Ok(out);
    }
    let mut combinations: Vec<Vec<OverrideSpec>> = vec![Vec::new()];
    for axis in axes {
        let mut next = Vec::new();
        for combo in &combinations {
            for value in &axis.values {
                let mut item = combo.clone();
                item.push(OverrideSpec {
                    path: axis.path.clone(),
                    value: value.clone(),
                });
                next.push(item);
            }
        }
        combinations = next;
    }
    for combo in combinations {
        let mut overrides = fixed.to_vec();
        overrides.extend(combo);
        out.push(VariationSpec {
            name: variation_name(&overrides, fixed.len()),
            overrides,
        });
    }
    if out.len() > max_variations {
        return Err(format!(
            "sweep generated {} variations, above --max-variations {max_variations}",
            out.len()
        ));
    }
    Ok(out)
}

fn variation_name(overrides: &[OverrideSpec], fixed_count: usize) -> String {
    let dynamic = overrides.iter().skip(fixed_count).collect::<Vec<_>>();
    if dynamic.is_empty() {
        return "override".to_string();
    }
    dynamic
        .iter()
        .map(|item| format!("{}={}", item.path, value_label(&item.value)))
        .collect::<Vec<_>>()
        .join(",")
}

fn value_label(value: &Value) -> String {
    match value {
        Value::String(s) => s.clone(),
        _ => value.to_string(),
    }
}

fn apply_overrides(base: &Value, overrides: &[OverrideSpec]) -> Result<Value, String> {
    let mut value = base.clone();
    for override_spec in overrides {
        apply_override(&mut value, override_spec)?;
    }
    Ok(value)
}

fn apply_override(root: &mut Value, override_spec: &OverrideSpec) -> Result<(), String> {
    let mut current = root;
    let mut segments = override_spec.path.split('.').peekable();
    while let Some(segment) = segments.next() {
        let is_last = segments.peek().is_none();
        let object = current
            .as_object_mut()
            .ok_or_else(|| format!("{} reaches a non-object at {segment}", override_spec.path))?;
        let Some(next) = object.get_mut(segment) else {
            return Err(format!(
                "override path does not exist: {}",
                override_spec.path
            ));
        };
        if is_last {
            if !override_type_compatible(next, &override_spec.value) {
                return Err(format!(
                    "override type mismatch at {}: existing {}, new {}",
                    override_spec.path,
                    value_type(next),
                    value_type(&override_spec.value)
                ));
            }
            *next = override_spec.value.clone();
            return Ok(());
        }
        current = next;
    }
    Err(format!(
        "override path cannot be empty: {}",
        override_spec.path
    ))
}

fn override_type_compatible(existing: &Value, next: &Value) -> bool {
    matches!(
        (existing, next),
        (Value::Number(_), Value::Number(_))
            | (Value::Bool(_), Value::Bool(_))
            | (Value::String(_), Value::String(_))
    )
}

fn value_type(value: &Value) -> &'static str {
    match value {
        Value::Null => "null",
        Value::Bool(_) => "bool",
        Value::Number(_) => "number",
        Value::String(_) => "string",
        Value::Array(_) => "array",
        Value::Object(_) => "object",
    }
}

fn bundle_from_value(value: Value) -> Result<DataBundle, String> {
    serde_json::from_value(value)
        .map_err(|err| format!("balance JSON does not match schema: {err}"))
}

fn percentile(mut values: Vec<f64>, p: f64) -> Option<f64> {
    if values.is_empty() {
        return None;
    }
    values.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let idx = (((values.len() - 1) as f64) * p).round() as usize;
    Some(values[idx.min(values.len() - 1)])
}

fn percentiles(values: Vec<f64>) -> PercentileSummary {
    PercentileSummary {
        p25: percentile(values.clone(), 0.25),
        p50: percentile(values.clone(), 0.5),
        p75: percentile(values, 0.75),
    }
}

fn aggregate_by_upgrade<F>(results: &[CampaignResult], extract: F, p: f64) -> HashMap<String, f64>
where
    F: Fn(&CampaignResult) -> &HashMap<String, u32>,
{
    let mut by_id: HashMap<String, Vec<f64>> = HashMap::new();
    for r in results {
        for (id, &run_idx) in extract(r) {
            by_id.entry(id.clone()).or_default().push(run_idx as f64);
        }
    }
    by_id
        .into_iter()
        .map(|(k, v)| (k, percentile(v, p).unwrap_or(0.0)))
        .collect()
}

#[derive(Default)]
struct PickAggregate {
    offers: u32,
    picks: u32,
    picked_runs: u32,
    clear_picked_runs: u32,
    pressures_when_picked: Vec<f64>,
}

fn run_summaries(results: &[CampaignResult]) -> Vec<&ProfileRunSummary> {
    results
        .iter()
        .flat_map(|r| r.timeline.iter())
        .filter_map(|entry| entry.profile.as_ref())
        .collect()
}

fn aggregate_pick_rates(
    results: &[CampaignResult],
    kind: &str,
    pick_maps: fn(&ProfileRunSummary) -> &HashMap<String, u32>,
    offer_maps: fn(&ProfileRunSummary) -> &HashMap<String, u32>,
) -> Vec<PickRateSection> {
    let summaries = run_summaries(results);
    let total_runs = summaries.len().max(1) as f64;
    let baseline_clear_rate = summaries
        .iter()
        .filter(|summary| summary.boss_stages.iter().any(|stage| *stage >= 1))
        .count() as f64
        / total_runs;
    let baseline_pressure = percentile(
        summaries
            .iter()
            .map(|summary| summary.final_pressure as f64)
            .collect(),
        0.5,
    )
    .unwrap_or(0.0);

    let mut by_id: HashMap<String, PickAggregate> = HashMap::new();
    for summary in summaries {
        for (id, count) in offer_maps(summary) {
            by_id.entry(id.clone()).or_default().offers += *count;
        }
        for (id, count) in pick_maps(summary) {
            let entry = by_id.entry(id.clone()).or_default();
            entry.picks += *count;
            entry.picked_runs += 1;
            if summary.boss_stages.iter().any(|stage| *stage >= 1) {
                entry.clear_picked_runs += 1;
            }
            entry
                .pressures_when_picked
                .push(summary.final_pressure as f64);
        }
    }

    let mut rows: Vec<PickRateSection> = by_id
        .into_iter()
        .map(|(id, agg)| {
            let picked_runs = agg.picked_runs.max(1) as f64;
            let clear_rate_when_picked = agg.clear_picked_runs as f64 / picked_runs;
            let median_pressure_when_picked =
                percentile(agg.pressures_when_picked, 0.5).unwrap_or(0.0);
            PickRateSection {
                id,
                offers: agg.offers,
                picks: agg.picks,
                offer_rate_per_run: agg.offers as f64 / total_runs,
                pick_rate_when_offered: if agg.offers > 0 {
                    agg.picks as f64 / agg.offers as f64
                } else {
                    0.0
                },
                picked_run_rate: agg.picked_runs as f64 / total_runs,
                clear_lift: clear_rate_when_picked - baseline_clear_rate,
                median_pressure_lift: median_pressure_when_picked - baseline_pressure,
            }
        })
        .collect();
    rows.sort_by(|a, b| {
        b.pick_rate_when_offered
            .partial_cmp(&a.pick_rate_when_offered)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| b.picks.cmp(&a.picks))
            .then_with(|| a.id.cmp(&b.id))
    });
    for row in &mut rows {
        row.id = format!("{kind}:{}", row.id);
    }
    rows
}

fn warnings_from_pick_rates(rows: &[PickRateSection]) -> Vec<BalanceWarning> {
    let mut warnings = Vec::new();
    for row in rows {
        if row.offer_rate_per_run >= 0.10
            && row.pick_rate_when_offered >= 0.72
            && (row.clear_lift >= 0.10 || row.median_pressure_lift >= 1.0)
        {
            warnings.push(BalanceWarning {
                kind: "op-pick".to_string(),
                subject: row.id.clone(),
                message: "High pick rate with positive clear/pressure lift".to_string(),
                value: row.pick_rate_when_offered,
            });
        }
        if row.offer_rate_per_run >= 0.10 && row.pick_rate_when_offered <= 0.08 {
            warnings.push(BalanceWarning {
                kind: "dead-pick".to_string(),
                subject: row.id.clone(),
                message: "Frequently offered but almost never selected".to_string(),
                value: row.pick_rate_when_offered,
            });
        }
    }
    warnings
}

fn median_stats(values: Vec<RunStatSnapshot>) -> Option<StatSnapshotSummary> {
    if values.is_empty() {
        return None;
    }
    let collect = |f: fn(&RunStatSnapshot) -> f64| values.iter().map(f).collect::<Vec<_>>();
    Some(StatSnapshotSummary {
        hp: percentile(collect(|s| s.hp), 0.5),
        max_hp: percentile(collect(|s| s.max_hp), 0.5),
        damage: percentile(collect(|s| s.damage), 0.5),
        fire_rate: percentile(collect(|s| s.fire_rate), 0.5),
        projectile_count: percentile(collect(|s| s.projectile_count), 0.5),
        pierce: percentile(collect(|s| s.pierce), 0.5),
        drones: percentile(collect(|s| s.drones), 0.5),
        shield: percentile(collect(|s| s.shield), 0.5),
        shield_max: percentile(collect(|s| s.shield_max), 0.5),
        crit_chance: percentile(collect(|s| s.crit_chance), 0.5),
        pickup_radius: percentile(collect(|s| s.pickup_radius), 0.5),
        bullet_radius: percentile(collect(|s| s.bullet_radius), 0.5),
        speed: percentile(collect(|s| s.speed), 0.5),
    })
}

fn run_policy_campaigns<P: MetaPolicy + Send>(
    bundle: &DataBundle,
    options: CampaignOptions,
    campaigns_count: u32,
    new_policy: impl Fn(u64) -> P + Sync + Send,
    initial_checkpoints: Option<&[CampaignCheckpoint]>,
) -> Vec<CampaignResult> {
    let progress = Mutex::new(0u32);
    let total = campaigns_count;
    (0..campaigns_count)
        .into_par_iter()
        .map(|i| {
            let mut policy = new_policy(i as u64 + 1);
            let mut local = options.clone();
            local.campaign_index = i;
            local.seed = options.seed.wrapping_add(i.wrapping_mul(0x9E3779B1));
            if let Some(checkpoints) = initial_checkpoints {
                let checkpoint = checkpoints
                    .get(i as usize % checkpoints.len())
                    .expect("non-empty checkpoints");
                local.seed = checkpoint.seed;
                local.initial_run_index = checkpoint.run_index;
                local.initial_account = Some(checkpoint.account.clone());
                local.initial_unlock_run_index = checkpoint.unlock_run_index.clone();
            }
            let result = run_meta_campaign(bundle, local, &mut policy);
            let mut p = progress.lock().unwrap();
            *p += 1;
            if *p % 10 == 0 || *p == total {
                eprintln!("  campaign {}/{}", *p, total);
            }
            result
        })
        .collect()
}

fn checkpoints_from_results(results: &[CampaignResult], stage: u32) -> Vec<CampaignCheckpoint> {
    results
        .iter()
        .filter_map(|result| match stage {
            1 => result.stage1_checkpoint.clone(),
            2 => result.stage2_checkpoint.clone(),
            _ => None,
        })
        .collect()
}

fn run_policy_id(
    policy: PolicyId,
    bundle: &DataBundle,
    options: CampaignOptions,
    campaigns: u32,
    initial_checkpoints: Option<&[CampaignCheckpoint]>,
) -> Vec<CampaignResult> {
    match policy {
        PolicyId::Random => run_policy_campaigns(
            bundle,
            options,
            campaigns,
            |seed| RandomPolicy::new(seed),
            initial_checkpoints,
        ),
        PolicyId::GreedyCheap => run_policy_campaigns(
            bundle,
            options,
            campaigns,
            |_| GreedyCheapPolicy,
            initial_checkpoints,
        ),
        PolicyId::FocusedAttack => run_policy_campaigns(
            bundle,
            options,
            campaigns,
            |_| FocusedAttackPolicy::default(),
            initial_checkpoints,
        ),
        PolicyId::Hoarder => run_policy_campaigns(
            bundle,
            options,
            campaigns,
            |_| HoarderPolicy,
            initial_checkpoints,
        ),
    }
}

fn policy_ids(policy_set: &PolicySetArg) -> Vec<PolicyId> {
    match policy_set {
        PolicySetArg::All => vec![
            PolicyId::Random,
            PolicyId::GreedyCheap,
            PolicyId::FocusedAttack,
            PolicyId::Hoarder,
        ],
        PolicySetArg::Focused => vec![PolicyId::FocusedAttack],
    }
}

fn load_checkpoint_file(path: &Path) -> Result<CheckpointFile, String> {
    let raw = std::fs::read_to_string(path)
        .map_err(|err| format!("failed to read checkpoint {}: {err}", path.display()))?;
    serde_json::from_str(&raw)
        .map_err(|err| format!("failed to parse checkpoint {}: {err}", path.display()))
}

fn write_checkpoint_file(path: &Path, file: &CheckpointFile) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    let json = serde_json::to_string_pretty(file).map_err(|err| err.to_string())?;
    std::fs::write(path, json + "\n").map_err(|err| err.to_string())
}

fn checkpoint_cache_path(
    dir: &Path,
    data_hash: &str,
    profile: &PlayerProfileId,
    policy: PolicyId,
    checkpoint_stage: u32,
) -> PathBuf {
    let hash = data_hash.replace(':', "-");
    dir.join(format!(
        "stage{checkpoint_stage}-{}-{}-{hash}.json",
        profile.as_str(),
        policy.as_str()
    ))
}

fn checkpoint_file_from_results(
    data_hash: &str,
    profile: &PlayerProfileId,
    policy: PolicyId,
    checkpoint_stage: u32,
    results: &[CampaignResult],
) -> CheckpointFile {
    CheckpointFile {
        schema_version: 1,
        base_data_hash: data_hash.to_string(),
        profile: profile.as_str().to_string(),
        policy: policy.as_str().to_string(),
        checkpoint_stage,
        checkpoints: checkpoints_from_results(results, checkpoint_stage),
    }
}

fn validate_checkpoint_file(
    file: &CheckpointFile,
    data_hash: &str,
    profile: &PlayerProfileId,
    policy: PolicyId,
    checkpoint_stage: u32,
) -> Result<(), String> {
    if file.schema_version != 1 {
        return Err(format!(
            "unsupported checkpoint schemaVersion {}",
            file.schema_version
        ));
    }
    if file.base_data_hash != data_hash {
        return Err(format!(
            "checkpoint data hash mismatch: {} != {}",
            file.base_data_hash, data_hash
        ));
    }
    if file.profile != profile.as_str() {
        return Err(format!(
            "checkpoint profile mismatch: {} != {}",
            file.profile,
            profile.as_str()
        ));
    }
    if file.policy != policy.as_str() {
        return Err(format!(
            "checkpoint policy mismatch: {} != {}",
            file.policy,
            policy.as_str()
        ));
    }
    if file.checkpoint_stage != checkpoint_stage {
        return Err(format!(
            "checkpoint stage mismatch: {} != {}",
            file.checkpoint_stage, checkpoint_stage
        ));
    }
    if file.checkpoints.is_empty() {
        return Err("checkpoint file contains no checkpoints".to_string());
    }
    Ok(())
}

fn load_or_generate_checkpoints(
    args: &Args,
    bundle: &DataBundle,
    settings: &RunSettings,
    data_hash: &str,
    profile: PlayerProfileId,
    policy: PolicyId,
    checkpoint_stage: u32,
) -> Result<Vec<CampaignCheckpoint>, String> {
    let path = if let Some(path) = &args.checkpoint_in {
        path.clone()
    } else {
        checkpoint_cache_path(
            &resolve_output_path(&args.checkpoint_dir),
            data_hash,
            &profile,
            policy,
            checkpoint_stage,
        )
    };

    if path.exists() && !args.refresh_checkpoints {
        let file = load_checkpoint_file(&path)?;
        validate_checkpoint_file(&file, data_hash, &profile, policy, checkpoint_stage)?;
        return Ok(file.checkpoints);
    }

    if args.checkpoint_in.is_some() {
        return Err(format!(
            "checkpoint input does not exist or refresh was requested: {}",
            path.display()
        ));
    }

    eprintln!(
        "[checkpoint:{}][profile:{}][policy:{}] generating {}",
        checkpoint_stage,
        profile.as_str(),
        policy.as_str(),
        path.display()
    );
    let mut options = settings.base_options.clone();
    options.player_profile = profile.clone();
    let results = run_policy_id(policy, bundle, options, settings.campaigns, None);
    let file =
        checkpoint_file_from_results(data_hash, &profile, policy, checkpoint_stage, &results);
    if file.checkpoints.is_empty() {
        return Err(format!(
            "could not generate stage {checkpoint_stage} checkpoints for {} {}",
            profile.as_str(),
            policy.as_str()
        ));
    }
    write_checkpoint_file(&path, &file)?;
    Ok(file.checkpoints)
}

fn write_checkpoint_out(
    args: &Args,
    data_hash: &str,
    report_profiles: &[(PlayerProfileId, Vec<(PolicyId, Vec<CampaignResult>)>)],
) -> Result<(), String> {
    let Some(path) = &args.checkpoint_out else {
        return Ok(());
    };
    if report_profiles.len() != 1 || report_profiles[0].1.len() != 1 {
        return Err(
            "--checkpoint-out requires exactly one player profile and one policy; use --checkpoint-dir for automatic multi-profile caches"
                .to_string(),
        );
    }
    let Some((profile, policies)) = report_profiles.first() else {
        return Err("no profiles available for checkpoint output".to_string());
    };
    let Some((policy, results)) = policies.first() else {
        return Err("no policies available for checkpoint output".to_string());
    };
    let checkpoint_stage = args.phase.checkpoint_stage().unwrap_or(1);
    let file = checkpoint_file_from_results(data_hash, profile, *policy, checkpoint_stage, results);
    write_checkpoint_file(path, &file)
}

fn build_section(
    policy: PolicyId,
    runs_per_campaign: u32,
    results: &[CampaignResult],
) -> PolicySection {
    let p50 = aggregate_by_upgrade(results, |r| &r.unlock_run_index, 0.5);
    let p25 = aggregate_by_upgrade(results, |r| &r.unlock_run_index, 0.25);
    let p75 = aggregate_by_upgrade(results, |r| &r.unlock_run_index, 0.75);

    // Median pressure at run index 0..runs_per_campaign-1
    let mut pressures_at: HashMap<u32, Vec<f64>> = HashMap::new();
    let mut deaths_total = 0.0_f64;
    let mut runs_total = 0.0_f64;
    let mut run_levels = Vec::new();
    let mut elapsed_seconds = Vec::new();
    for r in results {
        for entry in &r.timeline {
            if let (Some(pressure), Some(died)) = (entry.pressure_reached, entry.died) {
                pressures_at
                    .entry(entry.run_index)
                    .or_default()
                    .push(pressure as f64);
                runs_total += 1.0;
                if died {
                    deaths_total += 1.0;
                }
            }
            if let Some(profile) = &entry.profile {
                run_levels.push(profile.run_level as f64);
                elapsed_seconds.push(profile.elapsed_seconds);
            }
        }
    }
    let median_pressure_at_run_index: HashMap<String, f64> = pressures_at
        .into_iter()
        .map(|(k, v)| (k.to_string(), percentile(v, 0.5).unwrap_or(0.0)))
        .collect();

    let final_crystals: Vec<f64> = results.iter().map(|r| r.final_crystals as f64).collect();
    let median_final_crystals = percentile(final_crystals, 0.5).unwrap_or(0.0);
    let local_runs_to_clear = |result: &CampaignResult, clear: Option<u32>| -> Option<f64> {
        clear.map(|v| v.saturating_sub(result.initial_run_index) as f64)
    };
    let local_censor = |result: &CampaignResult| -> f64 {
        result
            .final_run_index
            .saturating_sub(result.initial_run_index)
            .saturating_add(1) as f64
    };

    let stage1_success: Vec<f64> = results
        .iter()
        .filter_map(|r| r.first_stage1_clear.map(|v| v as f64))
        .collect();
    let stage1_censored: Vec<f64> = results
        .iter()
        .map(|r| {
            r.first_stage1_clear
                .map(|v| v as f64)
                .unwrap_or(r.final_run_index as f64 + 1.0)
        })
        .collect();
    let stage1_local_censored: Vec<f64> = results
        .iter()
        .map(|r| local_runs_to_clear(r, r.first_stage1_clear).unwrap_or_else(|| local_censor(r)))
        .collect();
    let stage2: Vec<f64> = results
        .iter()
        .filter_map(|r| r.first_stage2_clear.map(|v| v as f64))
        .collect();
    let stage2_censored: Vec<f64> = results
        .iter()
        .map(|r| {
            r.first_stage2_clear
                .map(|v| v as f64)
                .unwrap_or(r.final_run_index as f64 + 1.0)
        })
        .collect();
    let stage2_local_censored: Vec<f64> = results
        .iter()
        .map(|r| local_runs_to_clear(r, r.first_stage2_clear).unwrap_or_else(|| local_censor(r)))
        .collect();
    let stage3: Vec<f64> = results
        .iter()
        .filter_map(|r| r.first_stage3_clear.map(|v| v as f64))
        .collect();
    let stage3_censored: Vec<f64> = results
        .iter()
        .map(|r| {
            r.first_stage3_clear
                .map(|v| v as f64)
                .unwrap_or(r.final_run_index as f64 + 1.0)
        })
        .collect();
    let stage3_local_censored: Vec<f64> = results
        .iter()
        .map(|r| local_runs_to_clear(r, r.first_stage3_clear).unwrap_or_else(|| local_censor(r)))
        .collect();
    let boss_success: Vec<f64> = results
        .iter()
        .filter_map(|r| r.first_boss_kill.map(|v| v as f64))
        .collect();
    let boss_censored: Vec<f64> = results
        .iter()
        .map(|r| {
            r.first_boss_kill
                .map(|v| v as f64)
                .unwrap_or(r.final_run_index as f64 + 1.0)
        })
        .collect();
    let upgrade_pick_rates = aggregate_pick_rates(
        results,
        "upgrade",
        |s| &s.upgrade_picks,
        |s| &s.upgrade_offers,
    );
    let relic_pick_rates =
        aggregate_pick_rates(results, "relic", |s| &s.relic_picks, |s| &s.relic_offers);
    let mut warnings = warnings_from_pick_rates(&upgrade_pick_rates);
    warnings.extend(warnings_from_pick_rates(&relic_pick_rates));
    let summaries = run_summaries(results);
    let boss_spawn_stats = median_stats(
        summaries
            .iter()
            .filter_map(|summary| summary.boss_spawn_stats)
            .collect(),
    );
    let final_stats = median_stats(
        summaries
            .iter()
            .map(|summary| summary.final_stats)
            .collect(),
    );

    let runs_to_stage1_clear = percentiles(stage1_local_censored);
    let runs_to_stage2_clear = percentiles(stage2_local_censored);
    let runs_to_stage3_clear = percentiles(stage3_local_censored);
    let cumulative_runs_to_stage1_clear = percentiles(stage1_censored);
    let cumulative_runs_to_stage2_clear = percentiles(stage2_censored);
    let cumulative_runs_to_stage3_clear = percentiles(stage3_censored);
    PolicySection {
        policy: policy.as_str().to_string(),
        campaigns: results.len() as u32,
        runs_per_campaign,
        median_runs_to_unlock: p50,
        p25_runs_to_unlock: p25,
        p75_runs_to_unlock: p75,
        median_pressure_at_run_index,
        median_first_stage1_clear: percentile(stage1_success, 0.5),
        median_first_stage2_clear: percentile(stage2, 0.5),
        median_first_stage3_clear: percentile(stage3, 0.5),
        median_first_boss_kill: percentile(boss_success, 0.5),
        median_final_crystals,
        deaths_rate_per_run: if runs_total > 0.0 {
            deaths_total / runs_total
        } else {
            0.0
        },
        runs_to_stage1_clear: runs_to_stage1_clear.clone(),
        runs_to_first_boss_kill: percentiles(boss_censored),
        runs_to_stage2_clear: runs_to_stage2_clear.clone(),
        runs_to_stage3_clear: runs_to_stage3_clear.clone(),
        cumulative_runs_to_stage1_clear,
        cumulative_runs_to_stage2_clear,
        cumulative_runs_to_stage3_clear,
        stage1_clear_rate: results
            .iter()
            .filter(|result| result.first_stage1_clear.is_some())
            .count() as f64
            / (results.len().max(1) as f64),
        stage2_clear_rate: results
            .iter()
            .filter(|result| result.first_stage2_clear.is_some())
            .count() as f64
            / (results.len().max(1) as f64),
        stage3_clear_rate: results
            .iter()
            .filter(|result| result.first_stage3_clear.is_some())
            .count() as f64
            / (results.len().max(1) as f64),
        boss_kill_rate: results
            .iter()
            .filter(|result| result.first_boss_kill.is_some())
            .count() as f64
            / (results.len().max(1) as f64),
        median_run_level: percentile(run_levels, 0.5),
        median_elapsed_seconds: percentile(elapsed_seconds, 0.5),
        upgrade_pick_rates,
        relic_pick_rates,
        warnings,
        median_boss_spawn_stats: boss_spawn_stats,
        median_final_stats: final_stats,
    }
}

fn resolve_settings(args: &Args) -> RunSettings {
    let profile = if args.quick {
        ReportProfile::quick()
    } else {
        ReportProfile::default()
    };
    let (campaigns, runs) = (profile.campaigns, profile.runs);
    let campaigns = args.campaigns.unwrap_or(campaigns);
    let runs = args.runs.unwrap_or(runs);
    let max_pressure = args.max_pressure.unwrap_or(profile.max_pressure);
    let trial_seconds = args.trial_seconds.unwrap_or(profile.trial_seconds);
    let player_profiles = args.player_profile.expand();
    let model_dir = player_profiles
        .iter()
        .any(PlayerProfileId::is_learned)
        .then(|| args.model_dir.clone().unwrap_or_else(default_model_dir));
    let thresholds = Phase1Thresholds::default();
    let base_options = CampaignOptions {
        seed: args.seed,
        campaign_index: 0,
        runs_count: runs,
        max_seconds: trial_seconds,
        max_pressure,
        step_seconds: 1.0 / 60.0,
        max_decisions_per_run: 16,
        player_profile: PlayerProfileId::Idle,
        learned_model_dir: model_dir.clone(),
        initial_account: None,
        initial_run_index: 0,
        initial_unlock_run_index: HashMap::new(),
    };
    RunSettings {
        campaigns,
        runs,
        max_pressure,
        trial_seconds,
        player_profiles,
        model_dir,
        thresholds,
        base_options,
    }
}

#[derive(Debug)]
struct ReportRunOutput {
    report: Report,
    policy_results: Vec<(PlayerProfileId, Vec<(PolicyId, Vec<CampaignResult>)>)>,
}

fn run_report(
    args: &Args,
    bundle: &DataBundle,
    settings: &RunSettings,
    data_hash: &str,
) -> Result<ReportRunOutput, String> {
    eprintln!(
        "voidline-cli: {} profile(s) × {} policy/policies × {campaigns} campaigns × {runs} runs (max_pressure={}, trial_seconds={}s, budget={}s)",
        settings.player_profiles.len(),
        args.policy_set.policy_count(),
        settings.max_pressure,
        settings.trial_seconds,
        args.max_seconds,
        campaigns = settings.campaigns,
        runs = settings.runs,
    );

    let start = Instant::now();
    let mut profiles = Vec::new();
    let mut policy_results_by_profile = Vec::new();

    for player_profile in &settings.player_profiles {
        let mut options = settings.base_options.clone();
        options.player_profile = player_profile.clone();
        let mut sections = Vec::new();
        let mut policy_results = Vec::new();

        for policy in policy_ids(&args.policy_set) {
            eprintln!("[profile:{}][{}]", player_profile.as_str(), policy.as_str());
            let initial_checkpoints = match args.phase.checkpoint_stage() {
                Some(stage) => Some(load_or_generate_checkpoints(
                    args,
                    bundle,
                    settings,
                    data_hash,
                    player_profile.clone(),
                    policy,
                    stage,
                )?),
                None => None,
            };
            let results = run_policy_id(
                policy,
                bundle,
                options.clone(),
                settings.campaigns,
                initial_checkpoints.as_deref(),
            );
            sections.push(build_section(policy, settings.runs, &results));
            policy_results.push((policy, results));
            check_budget(&start, args.max_seconds);
        }

        profiles.push(ProfileSection {
            player_profile: player_profile.as_str().to_string(),
            policies: sections,
        });
        policy_results_by_profile.push((player_profile.clone(), policy_results));
    }

    let elapsed = start.elapsed();
    let compatibility_policies = profiles
        .first()
        .map(|profile| profile.policies.clone())
        .unwrap_or_default();
    let report = Report {
        generated_at: chrono_now_utc(),
        config: ReportConfig {
            quick: args.quick,
            campaigns: settings.campaigns,
            runs_per_campaign: settings.runs,
            max_pressure: settings.max_pressure,
            trial_seconds: settings.trial_seconds,
            seed: args.seed,
            player_profile_arg: args.player_profile.as_str().to_string(),
            player_profiles: settings
                .player_profiles
                .iter()
                .map(|profile| profile.as_str().to_string())
                .collect(),
            model_dir: settings
                .model_dir
                .as_ref()
                .map(|path| path.display().to_string()),
            policy_set: args.policy_set.as_str().to_string(),
            phase: args.phase.as_str().to_string(),
            phase_isolated: args.phase.is_isolated(),
            checkpoint_in: args
                .checkpoint_in
                .as_ref()
                .map(|path| path.display().to_string()),
            checkpoint_out: args
                .checkpoint_out
                .as_ref()
                .map(|path| path.display().to_string()),
            check_target: args
                .check_target
                .as_ref()
                .map(|target| target.as_str().to_string()),
            thresholds: settings.thresholds.clone(),
            threads: rayon::current_num_threads(),
            elapsed_seconds: elapsed.as_secs_f64(),
        },
        profiles,
        policies: compatibility_policies,
    };

    Ok(ReportRunOutput {
        report,
        policy_results: policy_results_by_profile,
    })
}

fn write_json_report<T: Serialize>(path: &PathBuf, report: &T) {
    let json = serde_json::to_string_pretty(report).expect("serialize report");
    let output_path = resolve_output_path(path);
    std::fs::create_dir_all(
        output_path
            .parent()
            .unwrap_or_else(|| std::path::Path::new(".")),
    )
    .ok();
    std::fs::write(&output_path, json + "\n").expect("write report");
}

fn focused_section<'a>(report: &'a Report, profile_name: &str) -> Option<&'a PolicySection> {
    report
        .profiles
        .iter()
        .find(|profile| profile.player_profile == profile_name)
        .and_then(|profile| {
            profile
                .policies
                .iter()
                .find(|policy| policy.policy == "focused-attack")
        })
}

fn summary_row(
    variation: &str,
    overrides: &[OverrideSpec],
    report: &Report,
    passed: bool,
    check_errors: &[String],
) -> VariationSummaryRow {
    let expert = focused_section(report, "expert-human");
    let optimizer = focused_section(report, "optimizer");
    let warning_count = report
        .profiles
        .iter()
        .flat_map(|profile| &profile.policies)
        .map(|policy| policy.warnings.len())
        .sum();
    let op_pick_count = report
        .profiles
        .iter()
        .flat_map(|profile| &profile.policies)
        .flat_map(|policy| &policy.warnings)
        .filter(|warning| warning.kind == "op-pick")
        .count();
    VariationSummaryRow {
        variation: variation.to_string(),
        overrides: overrides.to_vec(),
        expert_human_stage1_p50: expert.and_then(|section| section.runs_to_stage1_clear.p50),
        expert_human_stage2_p50: expert.and_then(|section| section.runs_to_stage2_clear.p50),
        expert_human_stage3_p50: expert.and_then(|section| section.runs_to_stage3_clear.p50),
        optimizer_stage1_p50: optimizer.and_then(|section| section.runs_to_stage1_clear.p50),
        optimizer_stage2_p50: optimizer.and_then(|section| section.runs_to_stage2_clear.p50),
        optimizer_stage3_p50: optimizer.and_then(|section| section.runs_to_stage3_clear.p50),
        stage1_clear_rate: expert.map(|section| section.stage1_clear_rate),
        stage2_clear_rate: expert.map(|section| section.stage2_clear_rate),
        stage3_clear_rate: expert.map(|section| section.stage3_clear_rate),
        warning_count,
        op_pick_count,
        passed,
        check_errors: check_errors.to_vec(),
    }
}

fn validate_learned_models(settings: &RunSettings) -> Result<(), String> {
    let learned_profiles = settings
        .player_profiles
        .iter()
        .filter(|profile| profile.is_learned())
        .collect::<Vec<_>>();
    if learned_profiles.is_empty() {
        return Ok(());
    }
    let Some(model_dir) = settings.model_dir.as_deref() else {
        return Err("learned profiles require --model-dir or VOIDLINE_RL_MODEL_DIR".to_string());
    };
    for profile in learned_profiles {
        let path = model_path_for_profile(profile, Some(model_dir))
            .ok_or_else(|| format!("no model path for {}", profile.as_str()))?;
        if !path.exists() {
            return Err(format!(
                "missing RL model for {}: {}",
                profile.as_str(),
                path.display()
            ));
        }
    }
    Ok(())
}

fn main() {
    let args = Args::parse();

    if let Some(threads) = args.threads {
        rayon::ThreadPoolBuilder::new()
            .num_threads(threads)
            .build_global()
            .expect("rayon thread pool");
    }

    let (base_value, _balance_path, base_hash) = load_data_value(args.balance.as_ref())
        .unwrap_or_else(|err| {
            eprintln!("{err}");
            std::process::exit(2);
        });
    let fixed_overrides = args
        .set_overrides
        .iter()
        .map(|raw| parse_override(raw))
        .collect::<Result<Vec<_>, _>>()
        .unwrap_or_else(|err| {
            eprintln!("{err}");
            std::process::exit(2);
        });
    let sweep_axes = args
        .sweeps
        .iter()
        .map(|raw| parse_sweep(raw))
        .collect::<Result<Vec<_>, _>>()
        .unwrap_or_else(|err| {
            eprintln!("{err}");
            std::process::exit(2);
        });

    let settings = resolve_settings(&args);
    validate_learned_models(&settings).unwrap_or_else(|err| {
        eprintln!("{err}");
        std::process::exit(2);
    });
    let variation_mode = !fixed_overrides.is_empty() || !sweep_axes.is_empty();
    if variation_mode {
        if args.record_history {
            eprintln!("--record-history is not supported with --set/--sweep");
            std::process::exit(2);
        }
        if args.checkpoint_out.is_some() {
            eprintln!("--checkpoint-out is not supported with --set/--sweep; use --checkpoint-dir");
            std::process::exit(2);
        }
        let variations = build_variations(
            &fixed_overrides,
            &sweep_axes,
            args.include_baseline,
            args.max_variations,
        )
        .unwrap_or_else(|err| {
            eprintln!("{err}");
            std::process::exit(2);
        });
        let mut results = Vec::new();
        let mut summary_table = Vec::new();
        for variation in variations {
            eprintln!("[variation:{}]", variation.name);
            let value = apply_overrides(&base_value, &variation.overrides).unwrap_or_else(|err| {
                eprintln!("{err}");
                std::process::exit(2);
            });
            let data_hash = hash_bytes(value.to_string().as_bytes());
            let bundle = bundle_from_value(value).unwrap_or_else(|err| {
                eprintln!("{err}");
                std::process::exit(2);
            });
            let start = Instant::now();
            let output = run_report(&args, &bundle, &settings, &data_hash).unwrap_or_else(|err| {
                eprintln!("{err}");
                std::process::exit(2);
            });
            let check_errors = args
                .check_target
                .as_ref()
                .and_then(|target| run_balance_checks(&output.report, target).err())
                .unwrap_or_default();
            let passed = check_errors.is_empty();
            summary_table.push(summary_row(
                &variation.name,
                &variation.overrides,
                &output.report,
                passed,
                &check_errors,
            ));
            results.push(VariationResult {
                name: variation.name,
                overrides: variation.overrides,
                report: output.report,
                check_errors,
                passed,
                elapsed_seconds: start.elapsed().as_secs_f64(),
            });
        }
        let sweep_report = SweepReport {
            generated_at: chrono_now_utc(),
            config: SweepConfig {
                include_baseline: args.include_baseline,
                max_variations: args.max_variations,
                axes: sweep_axes
                    .iter()
                    .map(|axis| SweepAxisSummary {
                        path: axis.path.clone(),
                        values: axis.values.clone(),
                    })
                    .collect(),
                fixed_overrides,
            },
            variations: results,
            summary_table,
        };
        write_json_report(&args.output, &sweep_report);
        eprintln!("wrote {}", resolve_output_path(&args.output).display());
        return;
    }

    let bundle = bundle_from_value(base_value).unwrap_or_else(|err| {
        eprintln!("{err}");
        std::process::exit(2);
    });
    let output = run_report(&args, &bundle, &settings, &base_hash).unwrap_or_else(|err| {
        eprintln!("{err}");
        std::process::exit(2);
    });
    write_checkpoint_out(&args, &base_hash, &output.policy_results).unwrap_or_else(|err| {
        eprintln!("{err}");
        std::process::exit(2);
    });
    write_json_report(&args.output, &output.report);

    eprintln!("wrote {}", resolve_output_path(&args.output).display());

    if args.record_history {
        let output_path = resolve_output_path(&args.output);
        if let Err(err) = record_history(&args, &output.report, &output_path) {
            eprintln!("history error: {err}");
            std::process::exit(2);
        }
    }

    if let Some(check_target) = &args.check_target {
        if let Err(errors) = run_balance_checks(&output.report, check_target) {
            for error in errors {
                eprintln!("CHECK FAILED: {error}");
            }
            std::process::exit(3);
        }
    }
}

fn run_balance_checks(report: &Report, check_target: &CheckTargetArg) -> Result<(), Vec<String>> {
    let mut errors = Vec::new();
    let thresholds = &report.config.thresholds;
    if report.config.campaigns < thresholds.min_campaigns_for_check {
        errors.push(format!(
            "check sample too shallow: campaigns {} < {}",
            report.config.campaigns, thresholds.min_campaigns_for_check
        ));
    }
    if report.config.runs_per_campaign < thresholds.min_runs_for_check {
        errors.push(format!(
            "check sample too shallow: runsPerCampaign {} < {}",
            report.config.runs_per_campaign, thresholds.min_runs_for_check
        ));
    }
    if report.config.trial_seconds < thresholds.min_trial_seconds_for_check {
        errors.push(format!(
            "check trial too short: trialSeconds {:.0} < {:.0}",
            report.config.trial_seconds, thresholds.min_trial_seconds_for_check
        ));
    }
    if report.config.max_pressure < thresholds.min_min_max_pressure_for_check {
        errors.push(format!(
            "check pressure cap too low: maxPressure {} < {}",
            report.config.max_pressure, thresholds.min_min_max_pressure_for_check
        ));
    }

    let focused = |profile_name: &str| -> Option<&PolicySection> {
        report
            .profiles
            .iter()
            .find(|profile| profile.player_profile == profile_name)
            .and_then(|profile| {
                profile
                    .policies
                    .iter()
                    .find(|policy| policy.policy == "focused-attack")
            })
    };

    match focused("expert-human").and_then(|section| section.runs_to_stage1_clear.p50) {
        Some(p50)
            if p50 >= thresholds.expert_human_stage1_p50_min
                && p50 <= thresholds.expert_human_stage1_p50_max => {}
        Some(p50) => errors.push(format!(
            "expert-human focused-attack p50 runsToStage1Clear {p50:.1} outside {:.1}-{:.1}",
            thresholds.expert_human_stage1_p50_min, thresholds.expert_human_stage1_p50_max
        )),
        None => errors.push(
            "expert-human focused-attack never cleared phase 1 in sampled campaigns".to_string(),
        ),
    }

    match focused("expert-human").and_then(|section| section.runs_to_stage1_clear.p75) {
        Some(p75) if p75 <= thresholds.expert_human_stage1_p75_max => {}
        Some(p75) => errors.push(format!(
            "expert-human focused-attack p75 runsToStage1Clear {p75:.1} exceeds {:.1}",
            thresholds.expert_human_stage1_p75_max
        )),
        None => {}
    }

    match focused("optimizer").and_then(|section| section.runs_to_stage1_clear.p50) {
        Some(p50) if p50 >= thresholds.optimizer_stage1_p50_min => {}
        Some(p50) => errors.push(format!(
            "optimizer focused-attack p50 runsToStage1Clear {p50:.1} below exploit floor {:.1}",
            thresholds.optimizer_stage1_p50_min
        )),
        None => {}
    }

    if matches!(check_target, CheckTargetArg::Balance) {
        match focused("expert-human").and_then(|section| section.runs_to_stage2_clear.p50) {
            Some(p50)
                if p50 >= thresholds.expert_human_stage2_p50_min
                    && p50 <= thresholds.expert_human_stage2_p50_max => {}
            Some(p50) => errors.push(format!(
                "expert-human focused-attack p50 runsToStage2Clear {p50:.1} outside {:.1}-{:.1}",
                thresholds.expert_human_stage2_p50_min, thresholds.expert_human_stage2_p50_max
            )),
            None => errors.push(
                "expert-human focused-attack never cleared phase 2 in sampled campaigns"
                    .to_string(),
            ),
        }

        match focused("optimizer").and_then(|section| section.runs_to_stage2_clear.p50) {
            Some(p50) if p50 >= thresholds.optimizer_stage2_p50_min => {}
            Some(p50) => errors.push(format!(
                "optimizer focused-attack p50 runsToStage2Clear {p50:.1} below post-phase exploit floor {:.1}",
                thresholds.optimizer_stage2_p50_min
            )),
            None => {}
        }

        match focused("expert-human").and_then(|section| section.runs_to_stage3_clear.p50) {
            Some(p50)
                if p50 >= thresholds.expert_human_stage3_p50_min
                    && p50 <= thresholds.expert_human_stage3_p50_max => {}
            Some(p50) => errors.push(format!(
                "expert-human focused-attack p50 runsToStage3Clear {p50:.1} outside {:.1}-{:.1}",
                thresholds.expert_human_stage3_p50_min, thresholds.expert_human_stage3_p50_max
            )),
            None => errors.push(
                "expert-human focused-attack never cleared phase 3 in sampled campaigns"
                    .to_string(),
            ),
        }

        match focused("optimizer").and_then(|section| section.runs_to_stage3_clear.p50) {
            Some(p50) if p50 >= thresholds.optimizer_stage3_p50_min => {}
            Some(p50) => errors.push(format!(
                "optimizer focused-attack p50 runsToStage3Clear {p50:.1} below phase 3 exploit floor {:.1}",
                thresholds.optimizer_stage3_p50_min
            )),
            None => {}
        }

        for profile in &report.profiles {
            for policy in &profile.policies {
                for warning in &policy.warnings {
                    if warning.kind == "op-pick" {
                        errors.push(format!(
                            "{} {} has op-pick warning for {}: {}",
                            profile.player_profile, policy.policy, warning.subject, warning.message
                        ));
                    }
                }
            }
        }
    }

    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors)
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GitMetadata {
    commit: String,
    branch: String,
    dirty: bool,
    diff_hash: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct HistoryEntry {
    schema_version: u32,
    recorded_at: String,
    git: GitMetadata,
    balance_hash: Option<String>,
    replay_command: String,
    input: ReportConfig,
    output: serde_json::Value,
}

fn record_history(args: &Args, report: &Report, output_path: &PathBuf) -> Result<(), String> {
    let git = git_metadata();
    if git.dirty && !args.allow_dirty_history {
        return Err(
            "worktree is dirty; re-run with --allow-dirty-history to record an approximate replay"
                .to_string(),
        );
    }
    if git.dirty {
        eprintln!("warning: recording history with a dirty worktree; replay is approximate");
    }

    let balance_path = args
        .balance
        .clone()
        .unwrap_or_else(|| PathBuf::from("data/balance.json"));
    let entry = HistoryEntry {
        schema_version: 1,
        recorded_at: chrono_now_utc(),
        git,
        balance_hash: file_hash(&balance_path),
        replay_command: build_replay_command(args, output_path),
        input: report.config.clone(),
        output: serde_json::to_value(report).map_err(|err| err.to_string())?,
    };
    append_history_entry(&args.history_path, &entry)
}

fn append_history_entry(path: &PathBuf, entry: &HistoryEntry) -> Result<(), String> {
    let output_path = resolve_output_path(path);
    std::fs::create_dir_all(
        output_path
            .parent()
            .unwrap_or_else(|| std::path::Path::new(".")),
    )
    .map_err(|err| err.to_string())?;
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&output_path)
        .map_err(|err| err.to_string())?;
    let line = serde_json::to_string(entry).map_err(|err| err.to_string())?;
    writeln!(file, "{line}").map_err(|err| err.to_string())
}

fn build_replay_command(args: &Args, output_path: &PathBuf) -> String {
    let mut parts = vec!["./sim/target/release/voidline-cli".to_string()];
    if let Some(balance) = &args.balance {
        parts.push(format!(
            "--balance {}",
            shell_word(&balance.display().to_string())
        ));
    }
    parts.push(format!(
        "--output {}",
        shell_word(&output_path.display().to_string())
    ));
    parts.push(format!("--player-profile {}", args.player_profile.as_str()));
    if let Some(model_dir) = &args.model_dir {
        parts.push(format!(
            "--model-dir {}",
            shell_word(&model_dir.display().to_string())
        ));
    }
    parts.push(format!("--policy-set {}", args.policy_set.as_str()));
    parts.push(format!("--phase {}", args.phase.as_str()));
    parts.push(format!("--seed {}", args.seed));
    if args.quick {
        parts.push("--quick".to_string());
    } else {
        parts.push("--default".to_string());
    }
    if let Some(campaigns) = args.campaigns {
        parts.push(format!("--campaigns {campaigns}"));
    }
    if let Some(runs) = args.runs {
        parts.push(format!("--runs {runs}"));
    }
    if let Some(max_pressure) = args.max_pressure {
        parts.push(format!("--max-pressure {max_pressure}"));
    }
    if let Some(trial_seconds) = args.trial_seconds {
        parts.push(format!("--trial-seconds {trial_seconds}"));
    }
    parts.push(format!("--max-seconds {}", args.max_seconds));
    if let Some(threads) = args.threads {
        parts.push(format!("--threads {threads}"));
    }
    if let Some(check_target) = &args.check_target {
        parts.push(format!("--check-target {}", check_target.as_str()));
    }
    for item in &args.set_overrides {
        parts.push(format!("--set {}", shell_word(item)));
    }
    for item in &args.sweeps {
        parts.push(format!("--sweep {}", shell_word(item)));
    }
    if !args.include_baseline {
        parts.push("--include-baseline false".to_string());
    }
    if args.max_variations != 48 {
        parts.push(format!("--max-variations {}", args.max_variations));
    }
    if let Some(path) = &args.checkpoint_in {
        parts.push(format!(
            "--checkpoint-in {}",
            shell_word(&path.display().to_string())
        ));
    }
    if let Some(path) = &args.checkpoint_out {
        parts.push(format!(
            "--checkpoint-out {}",
            shell_word(&path.display().to_string())
        ));
    }
    if args.checkpoint_dir != PathBuf::from(".context/balance-checkpoints") {
        parts.push(format!(
            "--checkpoint-dir {}",
            shell_word(&args.checkpoint_dir.display().to_string())
        ));
    }
    if args.refresh_checkpoints {
        parts.push("--refresh-checkpoints".to_string());
    }
    parts.join(" ")
}

fn shell_word(value: &str) -> String {
    if value
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '/' | '.' | '_' | '-' | ':'))
    {
        value.to_string()
    } else {
        format!("'{}'", value.replace('\'', "'\\''"))
    }
}

fn git_metadata() -> GitMetadata {
    let commit = git_stdout(&["rev-parse", "HEAD"]).unwrap_or_else(|| "unknown".to_string());
    let branch = git_stdout(&["branch", "--show-current"]).unwrap_or_else(|| "unknown".to_string());
    let status = git_stdout(&["status", "--porcelain"]).unwrap_or_default();
    let dirty = !status.trim().is_empty();
    let diff_hash = if dirty {
        let diff = git_stdout(&["diff", "--binary"]).unwrap_or_default();
        Some(hash_bytes(format!("{status}\n{diff}").as_bytes()))
    } else {
        None
    };
    GitMetadata {
        commit,
        branch,
        dirty,
        diff_hash,
    }
}

fn git_stdout(args: &[&str]) -> Option<String> {
    let output = Command::new("git").args(args).output().ok()?;
    if !output.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn file_hash(path: &PathBuf) -> Option<String> {
    std::fs::read(path).ok().map(|bytes| hash_bytes(&bytes))
}

fn load_data_value(path: Option<&PathBuf>) -> Result<(Value, PathBuf, String), String> {
    let path = match path {
        Some(path) => path.clone(),
        None => find_default_balance_path()?,
    };
    let raw = std::fs::read_to_string(&path)
        .map_err(|err| format!("failed to read {}: {err}", path.display()))?;
    let value: Value = serde_json::from_str(&raw)
        .map_err(|err| format!("failed to parse {}: {err}", path.display()))?;
    let hash = hash_bytes(raw.as_bytes());
    Ok((value, path, hash))
}

fn find_default_balance_path() -> Result<PathBuf, String> {
    let candidates = [
        PathBuf::from("data/balance.json"),
        PathBuf::from("../data/balance.json"),
        PathBuf::from("../../data/balance.json"),
        PathBuf::from("../../../data/balance.json"),
        PathBuf::from("../../../../data/balance.json"),
    ];
    for candidate in candidates {
        if candidate.exists() {
            return Ok(candidate);
        }
    }
    Err("could not find data/balance.json".to_string())
}

fn hash_bytes(bytes: &[u8]) -> String {
    let mut hash = 0xcbf29ce484222325_u64;
    for byte in bytes {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("fnv1a64:{hash:016x}")
}

fn check_budget(start: &Instant, budget_seconds: f64) {
    if start.elapsed() > Duration::from_secs_f64(budget_seconds) {
        eprintln!(
            "ABORT: wall-clock budget {:.0}s exceeded (elapsed {:.0}s)",
            budget_seconds,
            start.elapsed().as_secs_f64(),
        );
        std::process::exit(2);
    }
}

fn resolve_output_path(path: &PathBuf) -> PathBuf {
    if path.is_absolute() {
        return path.clone();
    }
    let cwd = std::env::current_dir().ok();
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Some(d) = cwd.as_ref() {
        candidates.push(d.clone());
        if let Some(p) = d.parent() {
            candidates.push(p.to_path_buf());
            if let Some(pp) = p.parent() {
                candidates.push(pp.to_path_buf());
            }
        }
    }
    let candidates: Vec<Option<PathBuf>> = candidates.into_iter().map(Some).collect();
    for base in candidates.iter().flatten() {
        let candidate = base.join(path);
        if let Some(parent) = candidate.parent() {
            if parent.exists() {
                return candidate;
            }
        }
    }
    path.clone()
}

fn chrono_now_utc() -> String {
    use std::time::SystemTime;
    let secs = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("epoch:{secs}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use voidline_meta::account::AccountSnapshot;

    fn test_args() -> Args {
        Args {
            balance: None,
            output: PathBuf::from("scripts/meta-progression-report.json"),
            quick: true,
            default_mode: false,
            max_seconds: 12.0,
            campaigns: Some(2),
            runs: Some(3),
            max_pressure: Some(10),
            trial_seconds: Some(660.0),
            threads: Some(1),
            player_profile: PlayerProfileArg::Skilled,
            model_dir: None,
            seed: 1234,
            check_target: Some(CheckTargetArg::Balance),
            policy_set: PolicySetArg::Focused,
            set_overrides: Vec::new(),
            sweeps: Vec::new(),
            include_baseline: true,
            max_variations: 48,
            phase: PhaseArg::Full,
            checkpoint_out: None,
            checkpoint_in: None,
            checkpoint_dir: PathBuf::from(".context/balance-checkpoints"),
            refresh_checkpoints: false,
            record_history: true,
            history_path: PathBuf::from("data/balance-profile-history.jsonl"),
            allow_dirty_history: false,
        }
    }

    #[test]
    fn replay_command_expands_reproducible_inputs() {
        let args = test_args();
        let command = build_replay_command(&args, &args.output);

        assert!(command.contains("--player-profile skilled"));
        assert!(command.contains("--policy-set focused"));
        assert!(command.contains("--seed 1234"));
        assert!(command.contains("--campaigns 2"));
        assert!(command.contains("--runs 3"));
        assert!(command.contains("--max-pressure 10"));
        assert!(command.contains("--trial-seconds 660"));
        assert!(command.contains("--check-target balance"));
    }

    fn percentile_summary(p50: Option<f64>, p75: Option<f64>) -> PercentileSummary {
        PercentileSummary { p25: p50, p50, p75 }
    }

    fn policy_section(
        policy: &str,
        stage1_p50: Option<f64>,
        stage1_p75: Option<f64>,
        stage2_p50: Option<f64>,
        stage3_p50: Option<f64>,
    ) -> PolicySection {
        PolicySection {
            policy: policy.to_string(),
            campaigns: 8,
            runs_per_campaign: 20,
            median_runs_to_unlock: HashMap::new(),
            p25_runs_to_unlock: HashMap::new(),
            p75_runs_to_unlock: HashMap::new(),
            median_pressure_at_run_index: HashMap::new(),
            median_first_stage1_clear: stage1_p50,
            median_first_stage2_clear: stage2_p50,
            median_first_stage3_clear: stage3_p50,
            median_first_boss_kill: stage1_p50,
            median_final_crystals: 0.0,
            deaths_rate_per_run: 0.0,
            runs_to_stage1_clear: percentile_summary(stage1_p50, stage1_p75),
            runs_to_first_boss_kill: percentile_summary(stage1_p50, stage1_p75),
            runs_to_stage2_clear: percentile_summary(stage2_p50, stage2_p50),
            runs_to_stage3_clear: percentile_summary(stage3_p50, stage3_p50),
            cumulative_runs_to_stage1_clear: percentile_summary(stage1_p50, stage1_p75),
            cumulative_runs_to_stage2_clear: percentile_summary(stage2_p50, stage2_p50),
            cumulative_runs_to_stage3_clear: percentile_summary(stage3_p50, stage3_p50),
            stage1_clear_rate: 1.0,
            stage2_clear_rate: if stage2_p50.is_some() { 1.0 } else { 0.0 },
            stage3_clear_rate: if stage3_p50.is_some() { 1.0 } else { 0.0 },
            boss_kill_rate: 1.0,
            median_run_level: Some(1.0),
            median_elapsed_seconds: Some(60.0),
            upgrade_pick_rates: Vec::new(),
            relic_pick_rates: Vec::new(),
            warnings: Vec::new(),
            median_boss_spawn_stats: None,
            median_final_stats: None,
        }
    }

    fn profile_section(name: &str, focused: PolicySection) -> ProfileSection {
        ProfileSection {
            player_profile: name.to_string(),
            policies: vec![focused],
        }
    }

    fn checkable_report() -> Report {
        let thresholds = Phase1Thresholds::default();
        let expert = policy_section(
            "focused-attack",
            Some(thresholds.expert_human_stage1_p50_min),
            Some(thresholds.expert_human_stage1_p75_max),
            Some(thresholds.expert_human_stage2_p50_min),
            Some(thresholds.expert_human_stage3_p50_min),
        );
        let optimizer = policy_section(
            "focused-attack",
            Some(thresholds.optimizer_stage1_p50_min),
            Some(thresholds.optimizer_stage1_p50_min),
            Some(thresholds.optimizer_stage2_p50_min),
            Some(thresholds.optimizer_stage3_p50_min),
        );
        Report {
            generated_at: "epoch:0".to_string(),
            config: ReportConfig {
                quick: false,
                campaigns: thresholds.min_campaigns_for_check,
                runs_per_campaign: thresholds.min_runs_for_check,
                max_pressure: thresholds.min_min_max_pressure_for_check,
                trial_seconds: thresholds.min_trial_seconds_for_check,
                seed: 1,
                player_profile_arg: "skilled".to_string(),
                player_profiles: vec!["expert-human".to_string(), "optimizer".to_string()],
                model_dir: None,
                policy_set: "focused".to_string(),
                phase: "full".to_string(),
                phase_isolated: false,
                checkpoint_in: None,
                checkpoint_out: None,
                check_target: Some("balance".to_string()),
                thresholds,
                threads: 1,
                elapsed_seconds: 0.0,
            },
            profiles: vec![
                profile_section("expert-human", expert.clone()),
                profile_section("optimizer", optimizer),
            ],
            policies: vec![expert],
        }
    }

    #[test]
    fn balance_checks_pass_for_required_profiles() {
        let report = checkable_report();

        assert!(run_balance_checks(&report, &CheckTargetArg::Balance).is_ok());
    }

    #[test]
    fn balance_checks_reject_shallow_samples_and_pressure_caps() {
        let mut report = checkable_report();
        report.config.campaigns = 1;
        report.config.runs_per_campaign = 1;
        report.config.trial_seconds = 1.0;
        report.config.max_pressure = 1;

        let errors = run_balance_checks(&report, &CheckTargetArg::Balance).unwrap_err();

        assert!(errors.iter().any(|error| error.contains("campaigns")));
        assert!(errors.iter().any(|error| error.contains("runsPerCampaign")));
        assert!(errors.iter().any(|error| error.contains("trialSeconds")));
        assert!(errors.iter().any(|error| error.contains("maxPressure")));
    }

    #[test]
    fn phase1_check_skips_stage2_thresholds() {
        let mut report = checkable_report();
        report.profiles[0].policies[0].runs_to_stage2_clear.p50 = Some(1.0);
        report.profiles[1].policies[0].runs_to_stage2_clear.p50 = Some(1.0);
        report.profiles[0].policies[0].runs_to_stage3_clear.p50 = Some(1.0);
        report.profiles[1].policies[0].runs_to_stage3_clear.p50 = Some(1.0);

        assert!(run_balance_checks(&report, &CheckTargetArg::Phase1).is_ok());
        assert!(run_balance_checks(&report, &CheckTargetArg::Balance).is_err());
    }

    #[test]
    fn balance_checks_fail_without_expert_profile() {
        let mut report = checkable_report();
        report
            .profiles
            .retain(|profile| profile.player_profile != "expert-human");

        let errors = run_balance_checks(&report, &CheckTargetArg::Balance).unwrap_err();

        assert!(errors
            .iter()
            .any(|error| error.contains("expert-human focused-attack never cleared")));
    }

    #[test]
    fn parse_set_and_sweep_specs() {
        let set = parse_override("balance.bosses.stageScaling.hpPerStage=120").unwrap();
        assert_eq!(set.path, "balance.bosses.stageScaling.hpPerStage");
        assert_eq!(set.value, serde_json::json!(120));

        let sweep = parse_sweep("balance.enemyDensityMultiplier=2,3").unwrap();
        assert_eq!(sweep.path, "balance.enemyDensityMultiplier");
        assert_eq!(
            sweep.values,
            vec![serde_json::json!(2), serde_json::json!(3)]
        );
    }

    #[test]
    fn sweep_variations_are_cartesian_and_keep_baseline() {
        let fixed = vec![parse_override("balance.enemyDensityMultiplier=3").unwrap()];
        let axes = vec![
            parse_sweep("balance.bosses.stageScaling.hpPerStage=110,120").unwrap(),
            parse_sweep("balance.bosses.stageScaling.postStage2HpOffsetBase=0.45,0.5").unwrap(),
        ];

        let variations = build_variations(&fixed, &axes, true, 8).unwrap();

        assert_eq!(variations.len(), 5);
        assert_eq!(variations[0].name, "baseline");
        assert!(variations
            .iter()
            .any(|v| v.name.contains("hpPerStage=110")
                && v.name.contains("postStage2HpOffsetBase=0.45")));
    }

    #[test]
    fn apply_override_rejects_unknown_path_and_type_mismatch() {
        let base = serde_json::json!({"balance": {"enemyDensityMultiplier": 3}});
        let changed = apply_overrides(
            &base,
            &[parse_override("balance.enemyDensityMultiplier=2").unwrap()],
        )
        .unwrap();
        assert_eq!(
            changed["balance"]["enemyDensityMultiplier"],
            serde_json::json!(2)
        );

        assert!(apply_overrides(&base, &[parse_override("balance.missing=2").unwrap()],).is_err());
        assert!(apply_overrides(
            &base,
            &[parse_override("balance.enemyDensityMultiplier=false").unwrap()],
        )
        .is_err());
    }

    #[test]
    fn checkpoint_file_roundtrips_account_snapshot() {
        let mut account = AccountSnapshot::default();
        account.crystals = 123;
        account.highest_stage_cleared = 2;
        let checkpoint = CampaignCheckpoint {
            checkpoint_stage: 2,
            campaign_index: 4,
            seed: 77,
            run_index: 50,
            account,
            unlock_run_index: HashMap::from([("card:twin-cannon".to_string(), 1)]),
        };
        let file = CheckpointFile {
            schema_version: 1,
            base_data_hash: "fnv1a64:test".to_string(),
            profile: "expert-human".to_string(),
            policy: "focused-attack".to_string(),
            checkpoint_stage: 2,
            checkpoints: vec![checkpoint],
        };

        let json = serde_json::to_string(&file).unwrap();
        let decoded: CheckpointFile = serde_json::from_str(&json).unwrap();

        assert_eq!(decoded.checkpoints[0].run_index, 50);
        assert_eq!(decoded.checkpoints[0].account.crystals, 123);
        assert_eq!(decoded.checkpoints[0].account.highest_stage_cleared, 2);
    }

    #[test]
    fn isolated_phase_section_reports_local_and_cumulative_runs() {
        let result = CampaignResult {
            policy: PolicyId::FocusedAttack,
            seed: 77,
            timeline: Vec::new(),
            unlock_run_index: HashMap::new(),
            first_stage1_clear: Some(50),
            first_stage2_clear: Some(53),
            first_stage3_clear: None,
            first_boss_kill: Some(53),
            final_crystals: 0,
            final_run_index: 55,
            initial_run_index: 50,
            stage1_checkpoint: None,
            stage2_checkpoint: None,
        };

        let section = build_section(PolicyId::FocusedAttack, 5, &[result]);

        assert_eq!(section.runs_to_stage1_clear.p50, Some(0.0));
        assert_eq!(section.cumulative_runs_to_stage1_clear.p50, Some(50.0));
        assert_eq!(section.runs_to_stage2_clear.p50, Some(3.0));
        assert_eq!(section.cumulative_runs_to_stage2_clear.p50, Some(53.0));
        assert_eq!(section.runs_to_stage3_clear.p50, Some(6.0));
        assert_eq!(section.cumulative_runs_to_stage3_clear.p50, Some(56.0));
    }

    #[test]
    fn append_history_writes_one_jsonl_entry() {
        let mut path = std::env::temp_dir();
        path.push(format!(
            "voidline-history-test-{}-{}.jsonl",
            std::process::id(),
            hash_bytes(b"append")
        ));
        let entry = HistoryEntry {
            schema_version: 1,
            recorded_at: "epoch:0".to_string(),
            git: GitMetadata {
                commit: "abc".to_string(),
                branch: "test".to_string(),
                dirty: false,
                diff_hash: None,
            },
            balance_hash: Some("fnv1a64:1".to_string()),
            replay_command: "voidline-cli --quick".to_string(),
            input: ReportConfig {
                quick: true,
                campaigns: 1,
                runs_per_campaign: 1,
                max_pressure: 1,
                trial_seconds: 1.0,
                seed: 1,
                player_profile_arg: "skilled".to_string(),
                player_profiles: vec!["expert-human".to_string(), "optimizer".to_string()],
                model_dir: None,
                policy_set: "all".to_string(),
                phase: "full".to_string(),
                phase_isolated: false,
                checkpoint_in: None,
                checkpoint_out: None,
                check_target: None,
                thresholds: Phase1Thresholds::default(),
                threads: 1,
                elapsed_seconds: 0.0,
            },
            output: serde_json::json!({"ok": true}),
        };

        append_history_entry(&path, &entry).expect("append history");
        let content = std::fs::read_to_string(&path).expect("history content");
        let lines: Vec<&str> = content.lines().collect();
        assert_eq!(lines.len(), 1);
        assert!(lines[0].contains("\"schemaVersion\":1"));
        let _ = std::fs::remove_file(path);
    }
}

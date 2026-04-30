//! Voidline CLI — runs meta-progression campaigns in parallel via rayon
//! and emits a JSON report.

use std::collections::HashMap;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use std::process::Command;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use clap::{Parser, ValueEnum};
use rayon::prelude::*;
use serde::Serialize;

use voidline_data::{load_bundle, load_default, DataBundle};
use voidline_meta::campaign::{run_meta_campaign, CampaignOptions, CampaignResult};
use voidline_meta::policies::{
    FocusedAttackPolicy, GreedyCheapPolicy, HoarderPolicy, MetaPolicy, PolicyId, RandomPolicy,
};
use voidline_meta::profiles::RunStatSnapshot;
use voidline_meta::{PlayerProfileId, ProfileRunSummary};

#[derive(Clone, Debug, ValueEnum)]
enum PlayerProfileArg {
    Idle,
    ExpertHuman,
    Optimizer,
    Skilled,
    All,
}

impl PlayerProfileArg {
    fn as_str(&self) -> &'static str {
        match self {
            PlayerProfileArg::Idle => "idle",
            PlayerProfileArg::ExpertHuman => "expert-human",
            PlayerProfileArg::Optimizer => "optimizer",
            PlayerProfileArg::Skilled => "skilled",
            PlayerProfileArg::All => "all",
        }
    }

    fn expand(&self) -> Vec<PlayerProfileId> {
        match self {
            PlayerProfileArg::Idle => vec![PlayerProfileId::Idle],
            PlayerProfileArg::ExpertHuman => vec![PlayerProfileId::ExpertHuman],
            PlayerProfileArg::Optimizer => vec![PlayerProfileId::Optimizer],
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

    /// Base seed used to derive deterministic campaign/run seeds
    #[arg(long, default_value_t = 1109)]
    seed: u32,

    /// Optional balance check to enforce after writing the report
    #[arg(long, value_enum)]
    check_target: Option<CheckTargetArg>,

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
    median_first_boss_kill: Option<f64>,
    median_final_crystals: f64,
    deaths_rate_per_run: f64,
    runs_to_stage1_clear: PercentileSummary,
    runs_to_first_boss_kill: PercentileSummary,
    runs_to_stage2_clear: PercentileSummary,
    stage1_clear_rate: f64,
    stage2_clear_rate: f64,
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
struct Phase1Thresholds {
    expert_human_stage1_p50_min: f64,
    expert_human_stage1_p50_max: f64,
    expert_human_stage1_p75_max: f64,
    optimizer_stage1_p50_min: f64,
    expert_human_stage2_p50_min: f64,
    optimizer_stage2_p50_min: f64,
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

impl Default for Phase1Thresholds {
    fn default() -> Self {
        Self {
            expert_human_stage1_p50_min: 6.0,
            expert_human_stage1_p50_max: 16.0,
            expert_human_stage1_p75_max: 20.0,
            optimizer_stage1_p50_min: 3.0,
            expert_human_stage2_p50_min: 10.0,
            optimizer_stage2_p50_min: 5.0,
            min_campaigns_for_check: 4,
            min_runs_for_check: 16,
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
) -> Vec<CampaignResult> {
    let progress = Mutex::new(0u32);
    let total = campaigns_count;
    (0..campaigns_count)
        .into_par_iter()
        .map(|i| {
            let mut policy = new_policy(i as u64 + 1);
            let mut local = options;
            local.seed = options.seed.wrapping_add(i.wrapping_mul(0x9E3779B1));
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

    let stage1_success: Vec<f64> = results
        .iter()
        .filter_map(|r| r.first_stage1_clear.map(|v| v as f64))
        .collect();
    let stage1_censored: Vec<f64> = results
        .iter()
        .map(|r| {
            r.first_stage1_clear
                .map(|v| v as f64)
                .unwrap_or(runs_per_campaign as f64 + 1.0)
        })
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
                .unwrap_or(runs_per_campaign as f64 + 1.0)
        })
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
                .unwrap_or(runs_per_campaign as f64 + 1.0)
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
        median_first_boss_kill: percentile(boss_success, 0.5),
        median_final_crystals,
        deaths_rate_per_run: if runs_total > 0.0 {
            deaths_total / runs_total
        } else {
            0.0
        },
        runs_to_stage1_clear: percentiles(stage1_censored),
        runs_to_first_boss_kill: percentiles(boss_censored),
        runs_to_stage2_clear: percentiles(stage2_censored),
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

fn main() {
    let args = Args::parse();

    if let Some(threads) = args.threads {
        rayon::ThreadPoolBuilder::new()
            .num_threads(threads)
            .build_global()
            .expect("rayon thread pool");
    }

    let bundle = match &args.balance {
        Some(p) => load_bundle(p).expect("balance.json"),
        None => load_default().expect("balance.json"),
    };

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
    let thresholds = Phase1Thresholds::default();
    let base_options = CampaignOptions {
        seed: args.seed,
        runs_count: runs,
        max_seconds: trial_seconds,
        max_pressure,
        step_seconds: 1.0 / 60.0,
        max_decisions_per_run: 16,
        player_profile: PlayerProfileId::Idle,
    };

    eprintln!(
        "voidline-cli: {} profile(s) × 4 policies × {campaigns} campaigns × {runs} runs (max_pressure={}, trial_seconds={}s, budget={}s)",
        player_profiles.len(), max_pressure, trial_seconds, args.max_seconds,
    );

    let start = Instant::now();
    let mut profiles = Vec::new();

    for player_profile in &player_profiles {
        let mut options = base_options;
        options.player_profile = *player_profile;
        let mut sections = Vec::new();

        eprintln!("[profile:{}][random]", player_profile.as_str());
        let random_results =
            run_policy_campaigns(&bundle, options, campaigns, |seed| RandomPolicy::new(seed));
        sections.push(build_section(PolicyId::Random, runs, &random_results));
        check_budget(&start, args.max_seconds);

        eprintln!("[profile:{}][greedy-cheap]", player_profile.as_str());
        let greedy_results =
            run_policy_campaigns(&bundle, options, campaigns, |_| GreedyCheapPolicy);
        sections.push(build_section(PolicyId::GreedyCheap, runs, &greedy_results));
        check_budget(&start, args.max_seconds);

        eprintln!("[profile:{}][focused-attack]", player_profile.as_str());
        let focused_results = run_policy_campaigns(&bundle, options, campaigns, |_| {
            FocusedAttackPolicy::default()
        });
        sections.push(build_section(
            PolicyId::FocusedAttack,
            runs,
            &focused_results,
        ));
        check_budget(&start, args.max_seconds);

        eprintln!("[profile:{}][hoarder]", player_profile.as_str());
        let hoarder_results = run_policy_campaigns(&bundle, options, campaigns, |_| HoarderPolicy);
        sections.push(build_section(PolicyId::Hoarder, runs, &hoarder_results));
        check_budget(&start, args.max_seconds);

        profiles.push(ProfileSection {
            player_profile: player_profile.as_str().to_string(),
            policies: sections,
        });
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
            campaigns,
            runs_per_campaign: runs,
            max_pressure,
            trial_seconds,
            seed: args.seed,
            player_profile_arg: args.player_profile.as_str().to_string(),
            player_profiles: player_profiles
                .iter()
                .map(|profile| profile.as_str().to_string())
                .collect(),
            check_target: args
                .check_target
                .as_ref()
                .map(|target| target.as_str().to_string()),
            thresholds,
            threads: rayon::current_num_threads(),
            elapsed_seconds: elapsed.as_secs_f64(),
        },
        profiles,
        policies: compatibility_policies,
    };

    let json = serde_json::to_string_pretty(&report).expect("serialize report");
    let output_path = resolve_output_path(&args.output);
    std::fs::create_dir_all(
        output_path
            .parent()
            .unwrap_or_else(|| std::path::Path::new(".")),
    )
    .ok();
    std::fs::write(&output_path, json + "\n").expect("write report");

    eprintln!(
        "wrote {} ({:.1}s on {} threads)",
        output_path.display(),
        elapsed.as_secs_f64(),
        rayon::current_num_threads(),
    );

    if args.record_history {
        if let Err(err) = record_history(&args, &report, &output_path) {
            eprintln!("history error: {err}");
            std::process::exit(2);
        }
    }

    if let Some(check_target) = &args.check_target {
        if let Err(errors) = run_balance_checks(&report, check_target) {
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
            Some(p50) if p50 >= thresholds.expert_human_stage2_p50_min => {}
            Some(p50) => errors.push(format!(
                "expert-human focused-attack p50 runsToStage2Clear {p50:.1} below post-phase floor {:.1}",
                thresholds.expert_human_stage2_p50_min
            )),
            None => {}
        }

        match focused("optimizer").and_then(|section| section.runs_to_stage2_clear.p50) {
            Some(p50) if p50 >= thresholds.optimizer_stage2_p50_min => {}
            Some(p50) => errors.push(format!(
                "optimizer focused-attack p50 runsToStage2Clear {p50:.1} below post-phase exploit floor {:.1}",
                thresholds.optimizer_stage2_p50_min
            )),
            None => {}
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

    fn test_args() -> Args {
        Args {
            balance: None,
            output: PathBuf::from("scripts/balance-profile-report.json"),
            quick: true,
            default_mode: false,
            max_seconds: 12.0,
            campaigns: Some(2),
            runs: Some(3),
            max_pressure: Some(10),
            trial_seconds: Some(660.0),
            threads: Some(1),
            player_profile: PlayerProfileArg::Skilled,
            seed: 1234,
            check_target: Some(CheckTargetArg::Balance),
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
        assert!(command.contains("--seed 1234"));
        assert!(command.contains("--campaigns 2"));
        assert!(command.contains("--runs 3"));
        assert!(command.contains("--max-pressure 10"));
        assert!(command.contains("--trial-seconds 660"));
        assert!(command.contains("--check-target balance"));
    }

    fn percentile_summary(p50: Option<f64>, p75: Option<f64>) -> PercentileSummary {
        PercentileSummary {
            p25: p50,
            p50,
            p75,
        }
    }

    fn policy_section(
        policy: &str,
        stage1_p50: Option<f64>,
        stage1_p75: Option<f64>,
        stage2_p50: Option<f64>,
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
            median_first_boss_kill: stage1_p50,
            median_final_crystals: 0.0,
            deaths_rate_per_run: 0.0,
            runs_to_stage1_clear: percentile_summary(stage1_p50, stage1_p75),
            runs_to_first_boss_kill: percentile_summary(stage1_p50, stage1_p75),
            runs_to_stage2_clear: percentile_summary(stage2_p50, stage2_p50),
            stage1_clear_rate: 1.0,
            stage2_clear_rate: if stage2_p50.is_some() { 1.0 } else { 0.0 },
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
        );
        let optimizer = policy_section(
            "focused-attack",
            Some(thresholds.optimizer_stage1_p50_min),
            Some(thresholds.optimizer_stage1_p50_min),
            Some(thresholds.optimizer_stage2_p50_min),
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

        assert!(run_balance_checks(&report, &CheckTargetArg::Phase1).is_ok());
        assert!(run_balance_checks(&report, &CheckTargetArg::Balance).is_err());
    }

    #[test]
    fn balance_checks_fail_without_expert_profile() {
        let mut report = checkable_report();
        report.profiles.retain(|profile| profile.player_profile != "expert-human");

        let errors = run_balance_checks(&report, &CheckTargetArg::Balance).unwrap_err();

        assert!(errors
            .iter()
            .any(|error| error.contains("expert-human focused-attack never cleared")));
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

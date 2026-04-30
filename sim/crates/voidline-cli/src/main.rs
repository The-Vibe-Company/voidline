//! Voidline CLI — runs meta-progression campaigns in parallel via rayon
//! and emits a JSON report.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use clap::Parser;
use rayon::prelude::*;
use serde::Serialize;

use voidline_data::{load_bundle, load_default, DataBundle};
use voidline_meta::campaign::{run_meta_campaign, CampaignOptions, CampaignResult};
use voidline_meta::policies::{
    FocusedAttackPolicy, GreedyCheapPolicy, HoarderPolicy, MetaPolicy, PolicyId, RandomPolicy,
};

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

    /// Default mode (≤5 min wall clock)
    #[arg(long = "default", conflicts_with = "quick")]
    default_mode: bool,

    /// Wall-clock budget (seconds), abort if exceeded
    #[arg(long, default_value_t = 300.0)]
    max_seconds: f64,

    /// Override number of campaigns per policy
    #[arg(long)]
    campaigns: Option<u32>,

    /// Override runs per campaign
    #[arg(long)]
    runs: Option<u32>,

    /// Override max wave per trial (default 6)
    #[arg(long, default_value_t = 6)]
    max_wave: u32,

    /// Override max seconds per trial (default 45)
    #[arg(long, default_value_t = 45.0)]
    trial_seconds: f64,

    /// Threads (defaults to rayon's auto)
    #[arg(long)]
    threads: Option<usize>,
}

#[derive(Debug, Serialize)]
struct PolicySection {
    policy: String,
    campaigns: u32,
    runs_per_campaign: u32,
    median_runs_to_unlock: HashMap<String, f64>,
    p25_runs_to_unlock: HashMap<String, f64>,
    p75_runs_to_unlock: HashMap<String, f64>,
    median_wave_at_run_index: HashMap<String, f64>,
    median_first_stage1_clear: Option<f64>,
    median_first_stage2_clear: Option<f64>,
    median_first_boss_kill: Option<f64>,
    median_final_crystals: f64,
    deaths_rate_per_run: f64,
}

#[derive(Debug, Serialize)]
struct Report {
    generated_at: String,
    config: ReportConfig,
    policies: Vec<PolicySection>,
}

#[derive(Debug, Serialize)]
struct ReportConfig {
    quick: bool,
    campaigns: u32,
    runs_per_campaign: u32,
    max_wave: u32,
    trial_seconds: f64,
    threads: usize,
    elapsed_seconds: f64,
}

fn percentile(mut values: Vec<f64>, p: f64) -> Option<f64> {
    if values.is_empty() {
        return None;
    }
    values.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let idx = (((values.len() - 1) as f64) * p).round() as usize;
    Some(values[idx.min(values.len() - 1)])
}

fn aggregate_by_upgrade<F>(
    results: &[CampaignResult],
    extract: F,
    p: f64,
) -> HashMap<String, f64>
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

    // Median wave at run index 0..runs_per_campaign-1
    let mut waves_at: HashMap<u32, Vec<f64>> = HashMap::new();
    let mut deaths_total = 0.0;
    let mut runs_total = 0.0;
    for r in results {
        for entry in &r.timeline {
            if let (Some(wave), Some(died)) = (entry.wave_reached, entry.died) {
                waves_at.entry(entry.run_index).or_default().push(wave as f64);
                runs_total += 1.0;
                if died {
                    deaths_total += 1.0;
                }
            }
        }
    }
    let median_wave_at_run_index: HashMap<String, f64> = waves_at
        .into_iter()
        .map(|(k, v)| (k.to_string(), percentile(v, 0.5).unwrap_or(0.0)))
        .collect();

    let final_crystals: Vec<f64> = results.iter().map(|r| r.final_crystals as f64).collect();
    let median_final_crystals = percentile(final_crystals, 0.5).unwrap_or(0.0);

    let stage1: Vec<f64> = results
        .iter()
        .filter_map(|r| r.first_stage1_clear.map(|v| v as f64))
        .collect();
    let stage2: Vec<f64> = results
        .iter()
        .filter_map(|r| r.first_stage2_clear.map(|v| v as f64))
        .collect();
    let boss: Vec<f64> = results
        .iter()
        .filter_map(|r| r.first_boss_kill.map(|v| v as f64))
        .collect();

    PolicySection {
        policy: policy.as_str().to_string(),
        campaigns: results.len() as u32,
        runs_per_campaign,
        median_runs_to_unlock: p50,
        p25_runs_to_unlock: p25,
        p75_runs_to_unlock: p75,
        median_wave_at_run_index,
        median_first_stage1_clear: percentile(stage1, 0.5),
        median_first_stage2_clear: percentile(stage2, 0.5),
        median_first_boss_kill: percentile(boss, 0.5),
        median_final_crystals,
        deaths_rate_per_run: if runs_total > 0.0 { deaths_total / runs_total } else { 0.0 },
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

    let bundle = match args.balance {
        Some(ref p) => load_bundle(p).expect("balance.json"),
        None => load_default().expect("balance.json"),
    };

    let (campaigns, runs) = if args.quick {
        (15, 25)
    } else {
        (50, 40)
    };
    let campaigns = args.campaigns.unwrap_or(campaigns);
    let runs = args.runs.unwrap_or(runs);

    let options = CampaignOptions {
        seed: 1109,
        runs_count: runs,
        max_seconds: args.trial_seconds,
        max_wave: args.max_wave,
        step_seconds: 1.0 / 60.0,
        max_decisions_per_run: 16,
    };

    eprintln!(
        "voidline-cli: 4 policies × {campaigns} campaigns × {runs} runs (max_wave={}, trial_seconds={}s, budget={}s)",
        args.max_wave, args.trial_seconds, args.max_seconds,
    );

    let start = Instant::now();
    let mut sections = Vec::new();

    eprintln!("[random]");
    let random_results = run_policy_campaigns(&bundle, options, campaigns, |seed| {
        RandomPolicy::new(seed)
    });
    sections.push(build_section(PolicyId::Random, runs, &random_results));
    check_budget(&start, args.max_seconds);

    eprintln!("[greedy-cheap]");
    let greedy_results = run_policy_campaigns(&bundle, options, campaigns, |_| GreedyCheapPolicy);
    sections.push(build_section(PolicyId::GreedyCheap, runs, &greedy_results));
    check_budget(&start, args.max_seconds);

    eprintln!("[focused-attack]");
    let focused_results = run_policy_campaigns(&bundle, options, campaigns, |_| {
        FocusedAttackPolicy::default()
    });
    sections.push(build_section(PolicyId::FocusedAttack, runs, &focused_results));
    check_budget(&start, args.max_seconds);

    eprintln!("[hoarder]");
    let hoarder_results = run_policy_campaigns(&bundle, options, campaigns, |_| HoarderPolicy);
    sections.push(build_section(PolicyId::Hoarder, runs, &hoarder_results));

    let elapsed = start.elapsed();
    let report = Report {
        generated_at: chrono_now_utc(),
        config: ReportConfig {
            quick: args.quick,
            campaigns,
            runs_per_campaign: runs,
            max_wave: args.max_wave,
            trial_seconds: args.trial_seconds,
            threads: rayon::current_num_threads(),
            elapsed_seconds: elapsed.as_secs_f64(),
        },
        policies: sections,
    };

    let json = serde_json::to_string_pretty(&report).expect("serialize report");
    let output_path = resolve_output_path(&args.output);
    std::fs::create_dir_all(output_path.parent().unwrap_or_else(|| std::path::Path::new("."))).ok();
    std::fs::write(&output_path, json + "\n").expect("write report");

    eprintln!(
        "wrote {} ({:.1}s on {} threads)",
        output_path.display(),
        elapsed.as_secs_f64(),
        rayon::current_num_threads(),
    );
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

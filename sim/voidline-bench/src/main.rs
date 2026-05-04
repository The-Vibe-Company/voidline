mod host;
mod report;

use anyhow::{Context, Result};
use clap::{Parser, Subcommand};
use report::{aggregate, DeathReport, Pick, RunReport};
use serde::Serialize;
use std::collections::BTreeMap;
use std::collections::VecDeque;
use std::fs::File;
use std::io::Write;
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::Instant;
use voidline_bot::{
    choose_shop_action, next_meta_purchase, Champion, MetaLevels, ShopAction, Snapshot,
};

use crate::host::Host;

#[derive(Parser)]
#[command(name = "voidline-bench")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    Run {
        #[arg(long)]
        #[arg(default_value_t = 0)]
        seed: u64,
        #[arg(long)]
        meta_levels: Option<String>,
    },
    Bench {
        #[arg(long, default_value = "0..100")]
        seeds: String,
        #[arg(long)]
        threads: Option<usize>,
        #[arg(long)]
        meta_levels: Option<String>,
    },
    Campaign {
        #[arg(long, default_value = "0..10")]
        seeds: String,
        #[arg(long, default_value_t = 5)]
        target_kills: usize,
    },
    Replay {
        #[arg(long)]
        seed: u64,
        #[arg(long)]
        record: String,
    },
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    match cli.command {
        Commands::Run { seed, meta_levels } => {
            print_json(&run_one(seed, parse_meta(meta_levels)?, None)?)?;
        }
        Commands::Bench {
            seeds,
            threads,
            meta_levels,
        } => {
            let threads = threads.unwrap_or_else(num_cpus::get).max(1);
            let meta = parse_meta(meta_levels)?;
            let reports = run_many(parse_seed_range(&seeds)?, threads, meta)?;
            print_json(&aggregate(&reports))?;
        }
        Commands::Campaign {
            seeds,
            target_kills,
        } => {
            let report = run_campaign(parse_seed_range(&seeds)?, target_kills)?;
            print_json(&report)?;
        }
        Commands::Replay { seed, record } => {
            let file =
                File::create(&record).with_context(|| format!("failed to create {record}"))?;
            let report = run_one(seed, MetaLevels::default(), Some(file))?;
            print_json(&report)?;
        }
    }
    Ok(())
}

fn run_one(seed: u64, meta_levels: MetaLevels, mut replay: Option<File>) -> Result<RunReport> {
    let started = Instant::now();
    let champion = Champion;
    let mut host = Host::spawn(seed)?;
    let mut snapshot = host.init(seed, &meta_levels)?;
    let mut picks = Vec::new();
    let mut ticks = 0_u32;
    let mut boss10_killed = false;

    while ticks < 60 * 900 {
        match snapshot.mode.as_str() {
            "playing" => {
                let decision = champion.decide(&snapshot);
                if let Some(file) = replay.as_mut() {
                    if ticks % 6 == 0 {
                        writeln!(
                            file,
                            "{}",
                            serde_json::to_string(&serde_json::json!({
                                "tick": ticks,
                                "snapshot": snapshot,
                                "decision": {
                                    "pointerX": decision.pointer_x,
                                    "pointerY": decision.pointer_y,
                                    "dx": decision.dx,
                                    "dy": decision.dy
                                }
                            }))?
                        )?;
                    }
                }
                snapshot = host.tick(1.0 / 60.0, decision.pointer_x, decision.pointer_y)?;
                ticks += 1;
            }
            "shop" => {
                if snapshot.wave >= 10 {
                    boss10_killed = true;
                    break;
                }
                handle_shop(&mut host, &mut snapshot, &mut picks)?;
            }
            "gameover" => break,
            other => return Err(anyhow::anyhow!("unexpected mode from host: {other}")),
        }
    }

    let summary = host.gameover_summary()?;
    let waves_cleared = if boss10_killed {
        10
    } else if snapshot.mode == "shop" {
        snapshot.wave
    } else {
        snapshot.wave.saturating_sub(1)
    };
    let deaths = (snapshot.mode == "gameover").then(|| DeathReport {
        wave: snapshot.wave,
        hp_when_died: snapshot.hp,
        killer: snapshot
            .enemies
            .iter()
            .min_by(|a, b| {
                let da = (a.x - snapshot.player.x).powi(2) + (a.y - snapshot.player.y).powi(2);
                let db = (b.x - snapshot.player.x).powi(2) + (b.y - snapshot.player.y).powi(2);
                da.total_cmp(&db)
            })
            .map(|enemy| enemy.kind.clone()),
    });

    Ok(RunReport {
        seed,
        waves_cleared,
        boss10_killed,
        score: summary.score,
        runtime_ms: started.elapsed().as_millis(),
        picks,
        deaths,
        crystals_gained: summary.crystals_gained,
    })
}

fn run_many(seeds: Vec<u64>, threads: usize, meta: MetaLevels) -> Result<Vec<RunReport>> {
    if seeds.is_empty() {
        return Ok(Vec::new());
    }
    let queue = Arc::new(Mutex::new(VecDeque::from(seeds)));
    let (tx, rx) = mpsc::channel();
    let worker_count = threads.min(queue.lock().expect("seed queue poisoned").len());

    for _ in 0..worker_count {
        let queue = Arc::clone(&queue);
        let tx = tx.clone();
        let meta = meta.clone();
        thread::spawn(move || loop {
            let seed = {
                let mut queue = queue.lock().expect("seed queue poisoned");
                queue.pop_front()
            };
            let Some(seed) = seed else {
                break;
            };
            let result = run_one(seed, meta.clone(), None);
            if tx.send((seed, result)).is_err() {
                break;
            }
        });
    }
    drop(tx);

    let mut reports = Vec::new();
    for (seed, result) in rx {
        reports.push(result.with_context(|| format!("bench run failed for seed {seed}"))?);
    }
    reports.sort_by_key(|report| report.seed);
    Ok(reports)
}

fn handle_shop(host: &mut Host, snapshot: &mut Snapshot, picks: &mut Vec<Pick>) -> Result<()> {
    let mut guard = 0;
    loop {
        guard += 1;
        if guard > 12 {
            *snapshot = host.next_wave()?;
            return Ok(());
        }
        let shop = host.shop_state()?;
        match choose_shop_action(snapshot, &shop) {
            ShopAction::Buy(idx) => {
                let id = shop
                    .offers
                    .get(idx)
                    .map(|offer| offer.id.clone())
                    .unwrap_or_else(|| "unknown".to_string());
                if host.buy(idx)? {
                    picks.push(Pick {
                        wave: snapshot.wave,
                        upgrade_id: id,
                    });
                } else {
                    *snapshot = host.next_wave()?;
                    return Ok(());
                }
            }
            ShopAction::Reroll => {
                if !host.reroll()? {
                    *snapshot = host.next_wave()?;
                    return Ok(());
                }
            }
            ShopAction::NextWave => {
                *snapshot = host.next_wave()?;
                return Ok(());
            }
        }
    }
}

#[derive(Debug, Serialize)]
struct CampaignReport {
    attempts: Vec<CampaignAttempt>,
    boss10_killed_attempts: usize,
    target_kills: usize,
    verdict: bool,
}

#[derive(Debug, Serialize)]
struct CampaignAttempt {
    attempt: usize,
    seed: u64,
    wave_reached: u32,
    boss10_killed: bool,
    crystals_total: i64,
    meta_levels: BTreeMap<String, u32>,
}

fn run_campaign(seeds: Vec<u64>, target_kills: usize) -> Result<CampaignReport> {
    let mut attempts = Vec::new();
    let mut crystals = 0_i64;
    let mut spent = 0_i64;
    let mut levels = MetaLevels::default();

    for (idx, seed) in seeds.into_iter().enumerate() {
        let report = run_one(seed, levels.clone(), None)?;
        crystals += report.crystals_gained;
        while let Some(id) = next_meta_purchase(crystals, spent, &levels) {
            let current = levels.0.get(&id).copied().unwrap_or(0);
            let cost = meta_cost(&id, current);
            if cost > crystals {
                break;
            }
            crystals -= cost;
            spent += cost;
            levels.0.insert(id, current + 1);
        }
        attempts.push(CampaignAttempt {
            attempt: idx + 1,
            seed,
            wave_reached: report.waves_cleared,
            boss10_killed: report.boss10_killed,
            crystals_total: crystals,
            meta_levels: levels.0.clone(),
        });
    }
    let boss10_killed_attempts = attempts
        .iter()
        .filter(|attempt| attempt.boss10_killed)
        .count();
    Ok(CampaignReport {
        attempts,
        boss10_killed_attempts,
        target_kills,
        verdict: boss10_killed_attempts >= target_kills,
    })
}

fn parse_meta(raw: Option<String>) -> Result<MetaLevels> {
    match raw {
        Some(raw) => {
            let levels: BTreeMap<String, u32> =
                serde_json::from_str(&raw).context("invalid --meta-levels JSON")?;
            for (id, level) in &levels {
                if meta_cost(id, 0) == i64::MAX {
                    return Err(anyhow::anyhow!(
                        "unknown meta upgrade in --meta-levels: {id}"
                    ));
                }
                if *level > 5 {
                    return Err(anyhow::anyhow!(
                        "meta upgrade level exceeds max 5 in --meta-levels: {id}={level}"
                    ));
                }
            }
            Ok(MetaLevels(levels))
        }
        None => Ok(MetaLevels::default()),
    }
}

fn parse_seed_range(raw: &str) -> Result<Vec<u64>> {
    if let Some((start, end)) = raw.split_once("..") {
        let start: u64 = start.parse().context("invalid seed range start")?;
        let end: u64 = end.parse().context("invalid seed range end")?;
        return Ok((start..end).collect());
    }
    Ok(vec![raw.parse().context("invalid seed")?])
}

fn meta_cost(id: &str, level: u32) -> i64 {
    match id {
        "meta:max-hp" => 30 + level as i64 * 25,
        "meta:damage" => 30 + level as i64 * 30,
        "meta:fire-rate" => 30 + level as i64 * 35,
        "meta:speed" => 25 + level as i64 * 25,
        "meta:crystal-yield" => 40 + level as i64 * 40,
        _ => i64::MAX,
    }
}

fn print_json<T: Serialize>(value: &T) -> Result<()> {
    println!("{}", serde_json::to_string_pretty(value)?);
    Ok(())
}

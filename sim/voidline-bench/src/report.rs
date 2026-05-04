use serde::Serialize;
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize)]
pub struct Pick {
    pub wave: u32,
    pub upgrade_id: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct RunReport {
    pub seed: u64,
    pub waves_cleared: u32,
    pub boss10_killed: bool,
    pub score: i64,
    pub runtime_ms: u128,
    pub picks: Vec<Pick>,
    pub deaths: Option<DeathReport>,
    pub crystals_gained: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct DeathReport {
    pub wave: u32,
    pub hp_when_died: f64,
    pub killer: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct BenchReport {
    pub runs: usize,
    pub success_by_wave: BTreeMap<u32, f64>,
    pub boss10_kill_rate: f64,
    pub per_upgrade: BTreeMap<String, UpgradeStats>,
    pub build_histogram: BTreeMap<String, usize>,
}

#[derive(Debug, Clone, Serialize)]
pub struct UpgradeStats {
    pub picked_runs: usize,
    pub success_with_pick: f64,
    pub success_without_pick: f64,
    pub point_biserial: f64,
}

pub fn aggregate(reports: &[RunReport]) -> BenchReport {
    let runs = reports.len();
    let mut success_by_wave = BTreeMap::new();
    for wave in 1..=10 {
        let count = reports
            .iter()
            .filter(|report| report.waves_cleared >= wave)
            .count();
        success_by_wave.insert(wave, count as f64 / runs.max(1) as f64);
    }
    let boss10 = reports.iter().filter(|report| report.boss10_killed).count();

    let mut upgrades = BTreeMap::<String, Vec<bool>>::new();
    let mut build_histogram = BTreeMap::<String, usize>::new();
    for report in reports {
        let mut picked: Vec<_> = report
            .picks
            .iter()
            .map(|pick| pick.upgrade_id.clone())
            .collect();
        picked.sort();
        picked.dedup();
        *build_histogram.entry(picked.join("+")).or_insert(0) += 1;
        for id in &picked {
            upgrades.entry(id.clone()).or_default();
        }
    }

    let mut per_upgrade = BTreeMap::new();
    for id in upgrades.keys() {
        let mut with = Vec::new();
        let mut without = Vec::new();
        for report in reports {
            let picked = report.picks.iter().any(|pick| &pick.upgrade_id == id);
            if picked {
                with.push(report.boss10_killed);
            } else {
                without.push(report.boss10_killed);
            }
        }
        per_upgrade.insert(
            id.clone(),
            UpgradeStats {
                picked_runs: with.len(),
                success_with_pick: rate(&with),
                success_without_pick: rate(&without),
                point_biserial: point_biserial(&with, &without),
            },
        );
    }

    BenchReport {
        runs,
        success_by_wave,
        boss10_kill_rate: boss10 as f64 / runs.max(1) as f64,
        per_upgrade,
        build_histogram,
    }
}

fn rate(values: &[bool]) -> f64 {
    if values.is_empty() {
        0.0
    } else {
        values.iter().filter(|value| **value).count() as f64 / values.len() as f64
    }
}

fn point_biserial(with: &[bool], without: &[bool]) -> f64 {
    let n1 = with.len() as f64;
    let n0 = without.len() as f64;
    let n = n1 + n0;
    if n1 == 0.0 || n0 == 0.0 {
        return 0.0;
    }
    let all_successes = with
        .iter()
        .chain(without.iter())
        .filter(|value| **value)
        .count() as f64;
    let p = all_successes / n;
    let sd = (p * (1.0 - p)).sqrt();
    if sd == 0.0 {
        return 0.0;
    }
    (rate(with) - rate(without)) * ((n1 * n0) / (n * n)).sqrt() / sd
}

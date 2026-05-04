use serde::Serialize;
use std::collections::{BTreeMap, HashSet};
use voidline_bot::Snapshot;

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
    pub waves: Vec<WaveSummary>,
}

#[derive(Debug, Clone, Serialize)]
pub struct WaveSummary {
    pub wave: u32,
    pub is_boss: bool,
    pub duration_s: f64,
    pub boss_kill_time_s: Option<f64>,
    pub damage_taken: f64,
    pub hp_end_ratio: f64,
    pub enemies_peak: u32,
    pub kills: u32,
}

/// Per-wave running accumulator. Construct on the first playing-mode snapshot
/// of a wave, call `observe()` on every subsequent playing-mode snapshot of
/// the same wave, then call `finalize()` once we leave the wave (shop,
/// gameover, or detected wave change).
pub struct WaveTracker {
    pub wave: u32,
    pub is_boss: bool,
    wave_start_elapsed: f64,
    last_elapsed: f64,
    end_hp: f64,
    end_max_hp: f64,
    damage_taken: f64,
    enemies_peak: u32,
    kills: u32,
    boss_seen_elapsed: Option<f64>,
    boss_kill_elapsed: Option<f64>,
    prev_enemy_ids: HashSet<u32>,
    prev_hp: f64,
    has_prev: bool,
}

impl WaveTracker {
    pub fn new(snapshot: &Snapshot) -> Self {
        let mut tracker = Self {
            wave: snapshot.wave,
            is_boss: snapshot.wave > 0 && snapshot.wave % 5 == 0,
            wave_start_elapsed: snapshot.run_elapsed,
            last_elapsed: snapshot.run_elapsed,
            end_hp: snapshot.hp,
            end_max_hp: snapshot.max_hp,
            damage_taken: 0.0,
            enemies_peak: snapshot.enemies.len() as u32,
            kills: 0,
            boss_seen_elapsed: None,
            boss_kill_elapsed: None,
            prev_enemy_ids: HashSet::new(),
            prev_hp: snapshot.hp,
            has_prev: false,
        };
        tracker.observe_state(snapshot);
        tracker.has_prev = true;
        tracker
    }

    pub fn observe(&mut self, snapshot: &Snapshot) {
        if self.has_prev {
            // Damage = drops in player HP between consecutive playing snapshots.
            let dmg = self.prev_hp - snapshot.hp;
            if dmg > 0.0 {
                self.damage_taken += dmg;
            }
            // Kills = enemy IDs present last tick that are no longer present.
            let cur_ids: HashSet<u32> = snapshot.enemies.iter().map(|e| e.id).collect();
            self.kills += self
                .prev_enemy_ids
                .iter()
                .filter(|id| !cur_ids.contains(id))
                .count() as u32;
        }
        self.observe_state(snapshot);
        self.has_prev = true;
    }

    fn observe_state(&mut self, snapshot: &Snapshot) {
        let count = snapshot.enemies.len() as u32;
        if count > self.enemies_peak {
            self.enemies_peak = count;
        }
        let has_boss = snapshot.enemies.iter().any(|e| e.is_boss);
        if has_boss && self.boss_seen_elapsed.is_none() {
            self.boss_seen_elapsed = Some(snapshot.run_elapsed);
        }
        if !has_boss && self.boss_seen_elapsed.is_some() && self.boss_kill_elapsed.is_none() {
            self.boss_kill_elapsed = Some(snapshot.run_elapsed);
        }
        self.last_elapsed = snapshot.run_elapsed;
        self.end_hp = snapshot.hp;
        self.end_max_hp = snapshot.max_hp;
        self.prev_enemy_ids = snapshot.enemies.iter().map(|e| e.id).collect();
        self.prev_hp = snapshot.hp;
    }

    /// Call when the wave ends via transition to shop. Boss kill and
    /// final-tick state can collapse into the same step in `wave-loop.ts`,
    /// so `observe()` may never see a playing snapshot without the boss.
    /// Reaching the shop on a boss wave implies the boss was killed.
    pub fn note_wave_end_via_shop(&mut self, snapshot: &Snapshot) {
        self.last_elapsed = self.last_elapsed.max(snapshot.run_elapsed);
        if self.is_boss && self.boss_seen_elapsed.is_some() && self.boss_kill_elapsed.is_none() {
            self.boss_kill_elapsed = Some(self.last_elapsed);
        }
    }

    pub fn finalize(self) -> WaveSummary {
        let boss_kill_time_s = match (self.boss_seen_elapsed, self.boss_kill_elapsed) {
            (Some(seen), Some(killed)) => Some((killed - seen).max(0.0)),
            _ => None,
        };
        let hp_end_ratio = if self.end_max_hp > 0.0 {
            (self.end_hp / self.end_max_hp).clamp(0.0, 1.0)
        } else {
            0.0
        };
        WaveSummary {
            wave: self.wave,
            is_boss: self.is_boss,
            duration_s: (self.last_elapsed - self.wave_start_elapsed).max(0.0),
            boss_kill_time_s,
            damage_taken: self.damage_taken,
            hp_end_ratio,
            enemies_peak: self.enemies_peak,
            kills: self.kills,
        }
    }
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
    pub difficulty: DifficultyReport,
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct DifficultyReport {
    /// Boss fight duration (boss_seen → boss_kill) per boss wave, with kill rate.
    pub boss_fight: BTreeMap<u32, BossFightStats>,
    /// Per-wave damage / hp / kill stats across all runs that reached this wave.
    pub per_wave: BTreeMap<u32, WaveStats>,
    /// Fraction of runs that died at each wave (0 if nobody died there).
    pub wave_failure_rate: BTreeMap<u32, f64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct BossFightStats {
    pub kill_rate: f64,
    pub kill_time_p50: Option<f64>,
    pub kill_time_p90: Option<f64>,
    pub damage_taken_p50: f64,
    pub damage_taken_p90: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct WaveStats {
    pub runs_reached: usize,
    pub damage_taken_mean: f64,
    pub damage_taken_p90: f64,
    pub kills_mean: f64,
    pub enemies_peak_mean: f64,
    pub hp_end_ratio_mean: f64,
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
        difficulty: aggregate_difficulty(reports),
    }
}

pub fn aggregate_difficulty(reports: &[RunReport]) -> DifficultyReport {
    if reports.is_empty() {
        return DifficultyReport::default();
    }
    // Collect every WaveSummary by wave number.
    let mut by_wave: BTreeMap<u32, Vec<&WaveSummary>> = BTreeMap::new();
    for report in reports {
        for summary in &report.waves {
            by_wave.entry(summary.wave).or_default().push(summary);
        }
    }

    // Per-wave stats for any wave that was reached at least once.
    let mut per_wave = BTreeMap::new();
    for (&wave, summaries) in &by_wave {
        let damage: Vec<f64> = summaries.iter().map(|s| s.damage_taken).collect();
        let kills: Vec<f64> = summaries.iter().map(|s| s.kills as f64).collect();
        let peaks: Vec<f64> = summaries.iter().map(|s| s.enemies_peak as f64).collect();
        let hp: Vec<f64> = summaries.iter().map(|s| s.hp_end_ratio).collect();
        per_wave.insert(
            wave,
            WaveStats {
                runs_reached: summaries.len(),
                damage_taken_mean: mean(&damage),
                damage_taken_p90: percentile(&damage, 90.0).unwrap_or(0.0),
                kills_mean: mean(&kills),
                enemies_peak_mean: mean(&peaks),
                hp_end_ratio_mean: mean(&hp),
            },
        );
    }

    // Boss fight stats only on boss waves (wave % 5 == 0).
    let mut boss_fight = BTreeMap::new();
    for (&wave, summaries) in &by_wave {
        if !summaries.first().map(|s| s.is_boss).unwrap_or(false) {
            continue;
        }
        let kill_times: Vec<f64> = summaries.iter().filter_map(|s| s.boss_kill_time_s).collect();
        let damages: Vec<f64> = summaries.iter().map(|s| s.damage_taken).collect();
        let kill_rate = if summaries.is_empty() {
            0.0
        } else {
            kill_times.len() as f64 / summaries.len() as f64
        };
        boss_fight.insert(
            wave,
            BossFightStats {
                kill_rate,
                kill_time_p50: percentile(&kill_times, 50.0),
                kill_time_p90: percentile(&kill_times, 90.0),
                damage_taken_p50: percentile(&damages, 50.0).unwrap_or(0.0),
                damage_taken_p90: percentile(&damages, 90.0).unwrap_or(0.0),
            },
        );
    }

    // Wave-of-death distribution (fraction of runs that died at each wave).
    let total_runs = reports.len() as f64;
    let mut wave_failure_rate = BTreeMap::new();
    for report in reports {
        if let Some(death) = &report.deaths {
            *wave_failure_rate.entry(death.wave).or_insert(0.0_f64) += 1.0;
        }
    }
    for value in wave_failure_rate.values_mut() {
        *value /= total_runs.max(1.0);
    }

    DifficultyReport {
        boss_fight,
        per_wave,
        wave_failure_rate,
    }
}

pub fn mean(values: &[f64]) -> f64 {
    if values.is_empty() {
        return 0.0;
    }
    values.iter().sum::<f64>() / values.len() as f64
}

/// Linear-interpolated percentile (p in [0, 100]). Returns None on empty input.
pub fn percentile(values: &[f64], p: f64) -> Option<f64> {
    if values.is_empty() {
        return None;
    }
    let mut sorted: Vec<f64> = values.to_vec();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let p = p.clamp(0.0, 100.0);
    if sorted.len() == 1 {
        return Some(sorted[0]);
    }
    let rank = (p / 100.0) * (sorted.len() - 1) as f64;
    let lo = rank.floor() as usize;
    let hi = rank.ceil() as usize;
    if lo == hi {
        return Some(sorted[lo]);
    }
    let frac = rank - lo as f64;
    Some(sorted[lo] + (sorted[hi] - sorted[lo]) * frac)
}

pub fn render_difficulty_summary(report: &DifficultyReport) -> String {
    let mut out = String::new();
    out.push_str("=== Difficulty report ===\n");
    if report.boss_fight.is_empty() && report.per_wave.is_empty() {
        out.push_str("(no waves observed)\n");
        return out;
    }
    for (wave, stats) in &report.boss_fight {
        let p50 = stats
            .kill_time_p50
            .map(|v| format!("{:.1}s", v))
            .unwrap_or_else(|| "n/a".into());
        let p90 = stats
            .kill_time_p90
            .map(|v| format!("{:.1}s", v))
            .unwrap_or_else(|| "n/a".into());
        out.push_str(&format!(
            "Boss W{wave:<2} kill: p50={p50} p90={p90}  (kill rate {:.0}%)  dmg p50={:.0} p90={:.0}\n",
            stats.kill_rate * 100.0,
            stats.damage_taken_p50,
            stats.damage_taken_p90
        ));
    }
    out.push('\n');
    for (wave, stats) in &report.per_wave {
        out.push_str(&format!(
            "Wave {wave:<2} ({} runs): dmg mean={:.0} p90={:.0} | kills mean={:.0} | peak enemies≈{:.1} | hp end≈{:.0}%\n",
            stats.runs_reached,
            stats.damage_taken_mean,
            stats.damage_taken_p90,
            stats.kills_mean,
            stats.enemies_peak_mean,
            stats.hp_end_ratio_mean * 100.0
        ));
    }
    if !report.wave_failure_rate.is_empty() {
        out.push_str("\nDeath waves: ");
        let parts: Vec<String> = report
            .wave_failure_rate
            .iter()
            .map(|(w, r)| format!("W{w} {:.0}%", r * 100.0))
            .collect();
        out.push_str(&parts.join(" | "));
        out.push('\n');
    }
    out
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

#[cfg(test)]
mod difficulty_tests {
    use super::*;

    fn run_with_waves(seed: u64, waves: Vec<WaveSummary>, deaths: Option<DeathReport>) -> RunReport {
        RunReport {
            seed,
            waves_cleared: waves.last().map(|w| w.wave).unwrap_or(0),
            boss10_killed: waves.iter().any(|w| w.wave == 10 && w.boss_kill_time_s.is_some()),
            score: 0,
            runtime_ms: 0,
            picks: Vec::new(),
            deaths,
            crystals_gained: 0,
            waves,
        }
    }

    fn wave(wave: u32, dmg: f64, kill_time: Option<f64>, kills: u32) -> WaveSummary {
        WaveSummary {
            wave,
            is_boss: wave > 0 && wave % 5 == 0,
            duration_s: 30.0,
            boss_kill_time_s: kill_time,
            damage_taken: dmg,
            hp_end_ratio: 0.5,
            enemies_peak: 12,
            kills,
        }
    }

    #[test]
    fn percentile_handles_basic_distribution() {
        let v = vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0];
        assert_eq!(percentile(&v, 0.0), Some(1.0));
        assert_eq!(percentile(&v, 100.0), Some(10.0));
        // p50 of 1..=10 with linear interp = 5.5
        assert!((percentile(&v, 50.0).unwrap() - 5.5).abs() < 1e-9);
    }

    #[test]
    fn percentile_empty_returns_none() {
        let v: Vec<f64> = Vec::new();
        assert_eq!(percentile(&v, 50.0), None);
    }

    #[test]
    fn aggregates_boss_kill_time_p50() {
        let reports = vec![
            run_with_waves(1, vec![wave(5, 30.0, Some(20.0), 25)], None),
            run_with_waves(2, vec![wave(5, 50.0, Some(25.0), 30)], None),
            run_with_waves(3, vec![wave(5, 80.0, Some(40.0), 22)], None),
        ];
        let diff = aggregate_difficulty(&reports);
        let boss5 = diff.boss_fight.get(&5).expect("boss5 stats");
        assert_eq!(boss5.kill_rate, 1.0);
        assert!((boss5.kill_time_p50.unwrap() - 25.0).abs() < 1e-9);
        assert!((boss5.damage_taken_p50 - 50.0).abs() < 1e-9);
    }

    #[test]
    fn aggregates_partial_kill_rate() {
        let reports = vec![
            run_with_waves(1, vec![wave(5, 30.0, Some(20.0), 25)], None),
            run_with_waves(2, vec![wave(5, 100.0, None, 8)], Some(DeathReport {
                wave: 5,
                hp_when_died: 0.0,
                killer: Some("scout".into()),
            })),
        ];
        let diff = aggregate_difficulty(&reports);
        let boss5 = diff.boss_fight.get(&5).expect("boss5 stats");
        assert_eq!(boss5.kill_rate, 0.5);
        assert!(boss5.kill_time_p90.is_some());
        // Failure at wave 5 = 50% of runs.
        assert_eq!(diff.wave_failure_rate.get(&5).copied(), Some(0.5));
    }

    #[test]
    fn per_wave_stats_count_runs_reached() {
        let reports = vec![
            run_with_waves(1, vec![wave(1, 5.0, None, 10), wave(2, 10.0, None, 12)], None),
            run_with_waves(2, vec![wave(1, 8.0, None, 11)], None),
        ];
        let diff = aggregate_difficulty(&reports);
        assert_eq!(diff.per_wave.get(&1).unwrap().runs_reached, 2);
        assert_eq!(diff.per_wave.get(&2).unwrap().runs_reached, 1);
    }

    fn snap(wave: u32, elapsed: f64, hp: f64, enemies: Vec<(u32, bool)>) -> Snapshot {
        use voidline_bot::{EnemySnapshot, OrbSnapshot, PlayerSnapshot};
        Snapshot {
            schema_version: 1,
            mode: "playing".into(),
            wave,
            wave_timer: 0.0,
            run_elapsed: elapsed,
            score: 0,
            currency: 0,
            hp,
            max_hp: 100.0,
            player: PlayerSnapshot {
                x: 0.0,
                y: 0.0,
                speed: 0.0,
                damage: 0.0,
                fire_rate: 0.0,
                range: 0.0,
                projectile_count: 0.0,
                pierce: 0.0,
                crit_chance: 0.0,
            },
            enemies: enemies
                .into_iter()
                .map(|(id, is_boss)| EnemySnapshot {
                    id,
                    kind: if is_boss { "brute".into() } else { "scout".into() },
                    x: 0.0,
                    y: 0.0,
                    radius: 1.0,
                    hp: 1.0,
                    max_hp: 1.0,
                    speed: 0.0,
                    damage: 0.0,
                    is_boss,
                    attack_state: "idle".into(),
                    attack_progress: 0.0,
                    attack_target_x: 0.0,
                    attack_target_y: 0.0,
                    boss_shot_timer: None,
                    boss_spawn_timer: None,
                })
                .collect(),
            orbs: Vec::<OrbSnapshot>::new(),
            enemy_bullets: Vec::new(),
            weapons: Vec::new(),
            attack_telegraphs: Vec::new(),
            spawn_indicators: Vec::new(),
        }
    }

    #[test]
    fn tracker_measures_boss_kill_time_from_appearance() {
        // Wave 5 starts at t=100. Boss appears at t=103 (after warmup).
        // Boss disappears at t=125 → kill time = 22.0.
        let s0 = snap(5, 100.0, 100.0, vec![(1, false)]);
        let mut tr = WaveTracker::new(&s0);
        tr.observe(&snap(5, 103.0, 100.0, vec![(1, false), (2, true)]));
        tr.observe(&snap(5, 110.0, 90.0, vec![(2, true)]));
        tr.observe(&snap(5, 125.0, 80.0, vec![]));
        let summary = tr.finalize();
        assert!((summary.boss_kill_time_s.unwrap() - 22.0).abs() < 1e-9);
        assert!(summary.is_boss);
    }

    #[test]
    fn tracker_accumulates_damage_and_kills() {
        // Three enemies appear, two die, player loses 30 hp total.
        let s0 = snap(3, 50.0, 100.0, vec![(1, false), (2, false), (3, false)]);
        let mut tr = WaveTracker::new(&s0);
        tr.observe(&snap(3, 51.0, 90.0, vec![(1, false), (2, false), (3, false)]));
        tr.observe(&snap(3, 52.0, 80.0, vec![(2, false)])); // 1 and 3 died
        tr.observe(&snap(3, 53.0, 80.0, vec![])); // 2 died, no damage taken
        tr.observe(&snap(3, 54.0, 70.0, vec![(4, false)])); // hp went up? (refused) only count drops
        let summary = tr.finalize();
        assert!((summary.damage_taken - 30.0).abs() < 1e-9);
        assert_eq!(summary.kills, 3);
        assert_eq!(summary.enemies_peak, 3);
    }

    #[test]
    fn tracker_infers_boss_kill_on_shop_transition() {
        // Boss is alive in last playing snapshot at t=120, then mode flips to
        // shop on the same tick — we never observe a playing snapshot without
        // the boss. The shop transition should still register a kill.
        let s0 = snap(5, 100.0, 100.0, vec![]);
        let mut tr = WaveTracker::new(&s0);
        tr.observe(&snap(5, 105.0, 100.0, vec![(7, true)]));
        tr.observe(&snap(5, 120.0, 60.0, vec![(7, true)]));
        let mut shop_snap = snap(5, 120.5, 60.0, vec![]);
        shop_snap.mode = "shop".into();
        tr.note_wave_end_via_shop(&shop_snap);
        let summary = tr.finalize();
        assert!(summary.boss_kill_time_s.is_some(), "boss kill should be inferred");
        // Killed at >= 15s after first seen (105.0).
        assert!((summary.boss_kill_time_s.unwrap() - 15.5).abs() < 1.0);
    }

    #[test]
    fn tracker_no_boss_when_none_seen() {
        let s0 = snap(4, 0.0, 100.0, vec![]);
        let mut tr = WaveTracker::new(&s0);
        tr.observe(&snap(4, 1.0, 100.0, vec![(1, false)]));
        let summary = tr.finalize();
        assert_eq!(summary.boss_kill_time_s, None);
        assert!(!summary.is_boss);
    }
}

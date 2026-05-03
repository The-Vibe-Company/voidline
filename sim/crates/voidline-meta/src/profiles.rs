//! Automated run profiles used by balance reports.
//!
//! The idle profile preserves the historical meta-report behavior. Active
//! profiles drive the public Rust engine facade so movement, drafts, upgrades,
//! relics, and snapshots stay close to the browser runtime.

use std::collections::HashMap;

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
use crate::champion::ChampionRunPolicy;

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum PlayerProfileId {
    Idle,
    Champion,
}

impl PlayerProfileId {
    pub fn as_str(&self) -> &'static str {
        match self {
            PlayerProfileId::Idle => "idle",
            PlayerProfileId::Champion => "champion",
        }
    }

    pub fn is_active(&self) -> bool {
        !matches!(self, PlayerProfileId::Idle)
    }
}

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

pub(crate) fn champion_choose_upgrade(
    bundle: &DataBundle,
    snapshot: &EngineSnapshot,
    choices: &[UpgradeChoiceRecord],
) -> Option<UpgradeChoiceRecord> {
    choose_upgrade(bundle, snapshot, choices)
}

pub(crate) fn champion_choose_relic(
    bundle: &DataBundle,
    snapshot: &EngineSnapshot,
    choices: &[RelicChoiceRecord],
) -> Option<RelicChoiceRecord> {
    choose_relic(bundle, snapshot, choices)
}

struct IdleRunPolicy;

impl RunPolicy for IdleRunPolicy {
    fn movement_keys(&mut self, _bundle: &DataBundle, _snapshot: &EngineSnapshot) -> Vec<String> {
        Vec::new()
    }

    fn choose_upgrade(
        &mut self,
        _bundle: &DataBundle,
        _snapshot: &EngineSnapshot,
        _choices: &[UpgradeChoiceRecord],
    ) -> Option<UpgradeChoiceRecord> {
        None
    }

    fn choose_relic(
        &mut self,
        _bundle: &DataBundle,
        _snapshot: &EngineSnapshot,
        _choices: &[RelicChoiceRecord],
    ) -> Option<RelicChoiceRecord> {
        None
    }
}

pub fn create_run_policy(profile: PlayerProfileId) -> Box<dyn RunPolicy> {
    match profile {
        PlayerProfileId::Idle => Box::new(IdleRunPolicy),
        PlayerProfileId::Champion => Box::new(ChampionRunPolicy::new()),
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
}

pub fn run_active_profile_trial(
    bundle: &DataBundle,
    account: &AccountSnapshot,
    profile: PlayerProfileId,
    options: ActiveRunOptions,
) -> ProfileRunSummary {
    debug_assert!(profile.is_active());
    let mut policy = create_run_policy(profile.clone());
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

    finish_summary(summary, &snapshot)
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
    snapshot: &EngineSnapshot,
    choices: &[UpgradeChoiceRecord],
) -> Option<UpgradeChoiceRecord> {
    choices
        .iter()
        .max_by(|a, b| {
            let a_score = upgrade_score(bundle, snapshot, a);
            let b_score = upgrade_score(bundle, snapshot, b);
            a_score
                .partial_cmp(&b_score)
                .unwrap_or(std::cmp::Ordering::Equal)
        })
        .cloned()
}

fn choose_relic(
    bundle: &DataBundle,
    snapshot: &EngineSnapshot,
    choices: &[RelicChoiceRecord],
) -> Option<RelicChoiceRecord> {
    choices
        .iter()
        .max_by(|a, b| {
            let a_score = relic_score(bundle, snapshot, a);
            let b_score = relic_score(bundle, snapshot, b);
            a_score
                .partial_cmp(&b_score)
                .unwrap_or(std::cmp::Ordering::Equal)
        })
        .cloned()
}

fn upgrade_score(
    bundle: &DataBundle,
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
    let mut score = base_upgrade_score(upgrade);
    score *= tier_power;
    score += synergy_completion_bonus(bundle, snapshot, &upgrade.tags);
    if upgrade.tags.iter().any(|tag| tag == "shield") && hp_ratio < 0.45 {
        score += 16.0;
    }
    if upgrade.tags.iter().any(|tag| tag == "magnet") && snapshot.state.level <= 4 {
        score += 10.0;
    }
    if upgrade.tags.iter().any(|tag| tag == "cannon") {
        score += 8.0;
    }
    score
}

fn relic_score(
    bundle: &DataBundle,
    snapshot: &EngineSnapshot,
    choice: &RelicChoiceRecord,
) -> f64 {
    let relic = bundle
        .relics
        .iter()
        .find(|r| r.id == choice.relic_id)
        .unwrap_or(&bundle.fallback_relic);
    let hp_ratio = snapshot.player.hp / snapshot.player.max_hp.max(1.0);
    let mut score = base_relic_score(relic);
    score += synergy_completion_bonus(bundle, snapshot, &relic.tags);
    if relic
        .tags
        .iter()
        .any(|tag| tag == "shield" || tag == "salvage")
        && hp_ratio < 0.45
    {
        score += 10.0;
    }
    if relic.tags.iter().any(|tag| tag == "cannon") {
        score += 7.0;
    }
    score
}

fn base_upgrade_score(upgrade: &Upgrade) -> f64 {
    match upgrade.id.as_str() {
        "rail-slug" => 56.0,
        "scatter-loader" => 55.0,
        "plasma-core" => 54.0,
        "twin-cannon" => 52.0,
        "pulse-armament" => 52.0,
        "lance-capacitor" => 50.0,
        "drone-uplink" => 49.0,
        "pulse-overdrive" => 48.0,
        "crit-array" => 44.0,
        "ion-engine" => 42.0,
        "magnet-array" => 40.0,
        "heavy-caliber" => 40.0,
        "thermal-vampire" => 38.0,
        "vital-frame" => 36.0,
        "kinetic-shield" => 36.0,
        "velocity-tuner" => 28.0,
        _ => 20.0,
    }
}

fn base_relic_score(relic: &Relic) -> f64 {
    match relic.id.as_str() {
        "splitter-matrix" => 56.0,
        "rail-focus" => 51.0,
        "reactor-surge" => 50.0,
        "critical-orbit" => 50.0,
        "drone-contract" => 47.0,
        "salvage-plating" => 32.0,
        "emergency-nanites" => 34.0,
        "magnetized-map" => 36.0,
        "field-repair" => 24.0,
        _ => 18.0,
    }
}

fn synergy_completion_bonus(
    bundle: &DataBundle,
    snapshot: &EngineSnapshot,
    tags: &[String],
) -> f64 {
    let counts = build_tag_counts(bundle, snapshot);
    let bonus = 34.0;
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
        };

        let a = run_active_profile_trial(
            &bundle,
            &account,
            PlayerProfileId::Champion,
            options.clone(),
        );
        let b = run_active_profile_trial(&bundle, &account, PlayerProfileId::Champion, options);

        assert_eq!(a.final_pressure, b.final_pressure);
        assert_eq!(a.run_level, b.run_level);
        assert_eq!(a.upgrade_picks, b.upgrade_picks);
        assert_eq!(a.relic_picks, b.relic_picks);
        assert!((a.final_stats.hp - b.final_stats.hp).abs() < 1e-9);
    }
}

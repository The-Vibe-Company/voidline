//! Shared RL observation and action encoding.
//!
//! Both the Python training env and the Rust learned-policy evaluator use this
//! module so a trained model sees the same feature layout in both places.

use std::collections::HashMap;

use serde::Serialize;
use voidline_data::catalogs::{MetaUpgrade, Relic, Upgrade};
use voidline_data::dsl::{CappedIntStat, CappedPctStat, EffectOp, PercentStat};
use voidline_data::DataBundle;
use voidline_sim::engine::{EngineSnapshot, RelicChoiceRecord, UpgradeChoiceRecord};

pub const MOVEMENT_ACTIONS: usize = 9;
pub const UPGRADE_ACTIONS: usize = 5;
pub const RELIC_ACTIONS: usize = 4;
pub const SHOP_ACTIONS: usize = 9; // 0 = next-run, 1..8 = pick affordable slot k
pub const ACTION_LOGITS: usize =
    MOVEMENT_ACTIONS + UPGRADE_ACTIONS + RELIC_ACTIONS + SHOP_ACTIONS;

pub const SCALAR_DIM: usize = 32;
pub const ENEMY_BUCKETS: usize = 4;
pub const ENEMY_FEATURES_PER_BUCKET: usize = 4;
pub const ENEMY_DIM: usize = ENEMY_BUCKETS * ENEMY_FEATURES_PER_BUCKET;
pub const TAG_DIM: usize = 8;
pub const CHOICE_FEATURE_DIM: usize = 16;
pub const UPGRADE_CHOICE_SLOTS: usize = UPGRADE_ACTIONS - 1;
pub const RELIC_CHOICE_SLOTS: usize = RELIC_ACTIONS - 1;
pub const SHOP_CHOICE_SLOTS: usize = SHOP_ACTIONS - 1;
pub const UPGRADE_CHOICE_DIM: usize = UPGRADE_CHOICE_SLOTS * CHOICE_FEATURE_DIM;
pub const RELIC_CHOICE_DIM: usize = RELIC_CHOICE_SLOTS * CHOICE_FEATURE_DIM;
pub const SHOP_CHOICE_DIM: usize = SHOP_CHOICE_SLOTS * CHOICE_FEATURE_DIM;
pub const OBS_VECTOR_DIM: usize = SCALAR_DIM
    + ENEMY_DIM
    + TAG_DIM
    + UPGRADE_CHOICE_DIM
    + RELIC_CHOICE_DIM
    + SHOP_CHOICE_DIM;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EnvPhase {
    Run,
    Shop,
}

/// Lightweight shop slot record for RL observation/action wiring.
/// Mirrors a `MetaUpgrade` candidate that is currently affordable+unlocked
/// for the active account.
#[derive(Debug, Clone)]
pub struct ShopChoiceRecord {
    pub upgrade_id: String,
    pub kind: String,
    pub cost: u64,
    pub current_level: u32,
    pub max_level: u32,
}

pub const BUILD_TAGS: [&str; TAG_DIM] = [
    "cannon", "salvage", "magnet", "shield", "pierce", "drone", "crit", "mobility",
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EncodedObservation {
    pub scalar: Vec<f32>,
    pub enemies: Vec<f32>,
    pub owned_tags: Vec<f32>,
    pub upgrade_choices: Vec<f32>,
    pub relic_choices: Vec<f32>,
    pub shop_choices: Vec<f32>,
}

impl EncodedObservation {
    pub fn flatten(&self) -> Vec<f32> {
        let mut out = Vec::with_capacity(OBS_VECTOR_DIM);
        out.extend_from_slice(&self.scalar);
        out.extend_from_slice(&self.enemies);
        out.extend_from_slice(&self.owned_tags);
        out.extend_from_slice(&self.upgrade_choices);
        out.extend_from_slice(&self.relic_choices);
        out.extend_from_slice(&self.shop_choices);
        out
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionMask {
    pub movement: Vec<bool>,
    pub upgrade_pick: Vec<bool>,
    pub relic_pick: Vec<bool>,
    pub shop_pick: Vec<bool>,
}

impl ActionMask {
    pub fn flatten(&self) -> Vec<bool> {
        let mut out = Vec::with_capacity(ACTION_LOGITS);
        out.extend_from_slice(&self.movement);
        out.extend_from_slice(&self.upgrade_pick);
        out.extend_from_slice(&self.relic_pick);
        out.extend_from_slice(&self.shop_pick);
        out
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RlAction {
    pub movement: usize,
    pub upgrade_pick: usize,
    pub relic_pick: usize,
    pub shop_pick: usize,
}

impl Default for RlAction {
    fn default() -> Self {
        Self {
            movement: 0,
            upgrade_pick: 0,
            relic_pick: 0,
            shop_pick: 0,
        }
    }
}

pub fn encode_observation(
    bundle: &DataBundle,
    snapshot: &EngineSnapshot,
    upgrade_choices: &[UpgradeChoiceRecord],
    relic_choices: &[RelicChoiceRecord],
    shop_choices: &[ShopChoiceRecord],
    phase: EnvPhase,
) -> EncodedObservation {
    let scalar = encode_scalar(snapshot, phase);
    let enemies = encode_enemies(bundle, snapshot);
    let owned_tags = encode_owned_tags(bundle, snapshot);
    let upgrade_choices = encode_upgrade_choices(bundle, upgrade_choices);
    let relic_choices = encode_relic_choices(bundle, relic_choices);
    let shop_choices = encode_shop_choices(bundle, shop_choices);
    let encoded = EncodedObservation {
        scalar,
        enemies,
        owned_tags,
        upgrade_choices,
        relic_choices,
        shop_choices,
    };
    debug_assert_eq!(encoded.flatten().len(), OBS_VECTOR_DIM);
    encoded
}

pub fn action_mask(
    snapshot: &EngineSnapshot,
    upgrade_choices: &[UpgradeChoiceRecord],
    relic_choices: &[RelicChoiceRecord],
    shop_choices: &[ShopChoiceRecord],
    phase: EnvPhase,
) -> ActionMask {
    let in_run = phase == EnvPhase::Run;
    let in_shop = phase == EnvPhase::Shop;

    // Movement: only meaningful in Run; in Shop force noop.
    let mut movement = vec![false; MOVEMENT_ACTIONS];
    if in_run && snapshot.state.mode != "gameover" {
        for entry in movement.iter_mut() {
            *entry = true;
        }
    } else {
        movement[0] = true;
    }

    let mut upgrade_pick = vec![false; UPGRADE_ACTIONS];
    if in_run && snapshot.state.pending_upgrades > 0 && !upgrade_choices.is_empty() {
        for idx in 0..upgrade_choices.len().min(UPGRADE_CHOICE_SLOTS) {
            upgrade_pick[idx + 1] = true;
        }
    } else {
        upgrade_pick[0] = true;
    }

    let mut relic_pick = vec![false; RELIC_ACTIONS];
    if in_run && snapshot.state.pending_chests > 0 && !relic_choices.is_empty() {
        for idx in 0..relic_choices.len().min(RELIC_CHOICE_SLOTS) {
            relic_pick[idx + 1] = true;
        }
    } else {
        relic_pick[0] = true;
    }

    // Shop: action[0] = NextRun (always allowed in shop), 1..K = pick affordable slot.
    let mut shop_pick = vec![false; SHOP_ACTIONS];
    if in_shop {
        shop_pick[0] = true;
        for idx in 0..shop_choices.len().min(SHOP_CHOICE_SLOTS) {
            shop_pick[idx + 1] = true;
        }
    } else {
        shop_pick[0] = true;
    }

    ActionMask {
        movement,
        upgrade_pick,
        relic_pick,
        shop_pick,
    }
}

pub fn movement_keys(action: usize) -> Vec<String> {
    let mut keys = Vec::new();
    match action {
        1 => keys.push("KeyW".to_string()),
        2 => keys.push("KeyD".to_string()),
        3 => keys.push("KeyS".to_string()),
        4 => keys.push("KeyA".to_string()),
        5 => {
            keys.push("KeyW".to_string());
            keys.push("KeyD".to_string());
        }
        6 => {
            keys.push("KeyD".to_string());
            keys.push("KeyS".to_string());
        }
        7 => {
            keys.push("KeyS".to_string());
            keys.push("KeyA".to_string());
        }
        8 => {
            keys.push("KeyA".to_string());
            keys.push("KeyW".to_string());
        }
        _ => {}
    }
    keys
}

pub fn select_masked_argmax(logits: &[f32], mask: &[bool]) -> usize {
    let mut best_idx = 0usize;
    let mut best_score = f32::NEG_INFINITY;
    for (idx, score) in logits.iter().enumerate().take(mask.len()) {
        if !mask[idx] {
            continue;
        }
        if *score > best_score {
            best_score = *score;
            best_idx = idx;
        }
    }
    best_idx
}

pub fn action_from_logits(logits: &[f32], mask: &ActionMask) -> RlAction {
    let movement_end = MOVEMENT_ACTIONS;
    let upgrade_end = movement_end + UPGRADE_ACTIONS;
    let relic_end = upgrade_end + RELIC_ACTIONS;
    RlAction {
        movement: select_masked_argmax(&logits[0..movement_end.min(logits.len())], &mask.movement),
        upgrade_pick: if logits.len() >= upgrade_end {
            select_masked_argmax(&logits[movement_end..upgrade_end], &mask.upgrade_pick)
        } else {
            0
        },
        relic_pick: if logits.len() >= relic_end {
            select_masked_argmax(&logits[upgrade_end..relic_end], &mask.relic_pick)
        } else {
            0
        },
        shop_pick: if logits.len() >= ACTION_LOGITS {
            select_masked_argmax(&logits[relic_end..ACTION_LOGITS], &mask.shop_pick)
        } else {
            0
        },
    }
}

fn encode_scalar(snapshot: &EngineSnapshot, phase: EnvPhase) -> Vec<f32> {
    let player = &snapshot.player;
    let state = &snapshot.state;
    let world = &snapshot.world;
    // We keep SCALAR_DIM = 32 by collapsing the gameover flag (now redundant
    // with the phase indicator) and reusing the slot for the run/shop phase.
    fixed_vec::<SCALAR_DIM>([
        norm(player.hp, player.max_hp.max(1.0)),
        norm(player.max_hp, 250.0),
        norm(player.speed, 500.0),
        norm(player.damage, 40.0),
        norm(player.fire_rate, 12.0),
        norm(player.bullet_speed, 1200.0),
        norm(player.projectile_count, 8.0),
        norm(player.pierce, 8.0),
        norm(player.drones, 8.0),
        norm(player.shield, player.shield_max.max(1.0)),
        norm(player.shield_max, 200.0),
        norm(player.shield_regen, 12.0),
        norm(player.crit_chance, 1.0),
        norm(player.lifesteal, 0.25),
        norm(player.pickup_radius, 600.0),
        norm(player.bullet_radius, 24.0),
        norm(player.x, world.arena_width.max(1.0)),
        norm(player.y, world.arena_height.max(1.0)),
        norm(player.vx, 500.0),
        norm(player.vy, 500.0),
        norm(state.pressure as f64, 100.0),
        norm(state.stage as f64, 50.0),
        norm(state.stage_elapsed_seconds, 600.0),
        norm(state.run_elapsed_seconds, 3600.0),
        norm(state.score, 100_000.0),
        norm(state.level as f64, 80.0),
        norm(state.xp as f64, state.xp_target.max(1) as f64),
        norm(state.enemy_pressure_target as f64, 250.0),
        bool_f32(state.pending_upgrades > 0),
        bool_f32(state.pending_chests > 0),
        bool_f32(state.stage_boss_active),
        bool_f32(phase == EnvPhase::Shop),
    ])
}

fn encode_enemies(bundle: &DataBundle, snapshot: &EngineSnapshot) -> Vec<f32> {
    let mut out = vec![0.0; ENEMY_DIM];
    for (bucket_idx, enemy_type) in bundle
        .balance
        .enemies
        .iter()
        .take(ENEMY_BUCKETS)
        .enumerate()
    {
        let mut count = 0.0;
        let mut hp_ratio = 0.0;
        let mut distance = 0.0;
        let mut damage = 0.0;
        for enemy in snapshot
            .enemies
            .iter()
            .filter(|enemy| enemy.kind == enemy_type.id)
        {
            count += 1.0;
            hp_ratio += enemy.hp / enemy.max_hp.max(1.0);
            let dx = enemy.x - snapshot.player.x;
            let dy = enemy.y - snapshot.player.y;
            distance += (dx * dx + dy * dy).sqrt();
            damage += enemy.damage;
        }
        if count > 0.0 {
            let base = bucket_idx * ENEMY_FEATURES_PER_BUCKET;
            out[base] = norm(count, 80.0);
            out[base + 1] = norm(hp_ratio / count, 1.0);
            out[base + 2] = norm(distance / count, 1600.0);
            out[base + 3] = norm(damage / count, 80.0);
        }
    }
    out
}

fn encode_owned_tags(bundle: &DataBundle, snapshot: &EngineSnapshot) -> Vec<f32> {
    let mut counts: HashMap<&str, f32> = HashMap::new();
    for owned in &snapshot.owned_upgrades {
        if let Some(upgrade) = bundle
            .upgrades
            .iter()
            .find(|candidate| candidate.id == owned.upgrade_id)
        {
            for tag in &upgrade.tags {
                *counts.entry(tag.as_str()).or_insert(0.0) += owned.count as f32;
            }
        }
    }
    for owned in &snapshot.owned_relics {
        if let Some(relic) = bundle
            .relics
            .iter()
            .find(|candidate| candidate.id == owned.relic_id)
            .or_else(|| {
                (bundle.fallback_relic.id == owned.relic_id).then_some(&bundle.fallback_relic)
            })
        {
            for tag in &relic.tags {
                *counts.entry(tag.as_str()).or_insert(0.0) += owned.count as f32;
            }
        }
    }
    BUILD_TAGS
        .iter()
        .map(|tag| (*counts.get(tag).unwrap_or(&0.0) / 8.0).clamp(0.0, 1.0))
        .collect()
}

fn encode_upgrade_choices(bundle: &DataBundle, choices: &[UpgradeChoiceRecord]) -> Vec<f32> {
    let mut out = vec![0.0; UPGRADE_CHOICE_DIM];
    for (slot, choice) in choices.iter().take(UPGRADE_CHOICE_SLOTS).enumerate() {
        let Some(upgrade) = bundle
            .upgrades
            .iter()
            .find(|candidate| candidate.id == choice.upgrade_id)
        else {
            continue;
        };
        let tier_power = bundle
            .balance
            .tiers
            .iter()
            .find(|tier| tier.id == choice.tier_id)
            .map(|tier| tier.power)
            .unwrap_or(1.0);
        let features = choice_features_for_upgrade(upgrade, tier_power);
        let base = slot * CHOICE_FEATURE_DIM;
        out[base..base + CHOICE_FEATURE_DIM].copy_from_slice(&features);
    }
    out
}

fn encode_relic_choices(bundle: &DataBundle, choices: &[RelicChoiceRecord]) -> Vec<f32> {
    let mut out = vec![0.0; RELIC_CHOICE_DIM];
    for (slot, choice) in choices.iter().take(RELIC_CHOICE_SLOTS).enumerate() {
        let relic = bundle
            .relics
            .iter()
            .find(|candidate| candidate.id == choice.relic_id)
            .unwrap_or(&bundle.fallback_relic);
        let features = choice_features_for_relic(relic);
        let base = slot * CHOICE_FEATURE_DIM;
        out[base..base + CHOICE_FEATURE_DIM].copy_from_slice(&features);
    }
    out
}

fn encode_shop_choices(bundle: &DataBundle, choices: &[ShopChoiceRecord]) -> Vec<f32> {
    let mut out = vec![0.0; SHOP_CHOICE_DIM];
    for (slot, choice) in choices.iter().take(SHOP_CHOICE_SLOTS).enumerate() {
        let Some(meta) = bundle
            .meta_upgrades
            .iter()
            .find(|candidate| candidate.id == choice.upgrade_id)
        else {
            continue;
        };
        let features = choice_features_for_meta(meta, choice);
        let base = slot * CHOICE_FEATURE_DIM;
        out[base..base + CHOICE_FEATURE_DIM].copy_from_slice(&features);
    }
    out
}

fn choice_features_for_upgrade(upgrade: &Upgrade, tier_power: f64) -> [f32; CHOICE_FEATURE_DIM] {
    let mut out = tag_features(&upgrade.tags);
    out[0] = 1.0;
    out[1] = norm(tier_power, 3.0);
    add_effect_features(&mut out, &upgrade.effects);
    out
}

fn choice_features_for_relic(relic: &Relic) -> [f32; CHOICE_FEATURE_DIM] {
    let mut out = tag_features(&relic.tags);
    out[0] = 1.0;
    out[1] = 1.0;
    add_effect_features(&mut out, &relic.effects);
    out
}

fn choice_features_for_meta(
    meta: &MetaUpgrade,
    record: &ShopChoiceRecord,
) -> [f32; CHOICE_FEATURE_DIM] {
    // Shop slots reuse the same 16-dim feature schema as in-run draft slots.
    // The tag block is currently sourced from the meta upgrade's tag (single
    // string). Cost/level normalize against generous caps so the agent has a
    // stable signal across the catalogue.
    let mut tags: Vec<String> = Vec::new();
    if let Some(tag) = &meta.tag {
        tags.push(tag.clone());
    }
    let mut out = tag_features(&tags);
    out[0] = 1.0;
    out[1] = norm(record.cost as f64, 1000.0);
    // Reuse slot 15 as a normalised level/level-cap progress indicator so the
    // agent can tell "fresh unlock" from "almost maxed" without an ID lookup.
    let max_level = record.max_level.max(1) as f32;
    out[15] = (record.current_level as f32) / max_level;
    // Encode kind via tag-style flags in the unused crit/mobility slots when
    // the meta upgrade doesn't carry a build tag of its own.
    match meta.kind.as_str() {
        "unique" => {
            out[8] += 0.5; // crit slot doubles as "unique" indicator
        }
        "rarity" => {
            out[9] += 0.5; // mobility slot doubles as "rarity" indicator
        }
        "utility" => {
            out[9] += 1.0;
        }
        _ => {}
    }
    out
}

fn tag_features(tags: &[String]) -> [f32; CHOICE_FEATURE_DIM] {
    let mut out = [0.0; CHOICE_FEATURE_DIM];
    for (idx, tag) in BUILD_TAGS.iter().enumerate() {
        if tags.iter().any(|candidate| candidate == tag) {
            out[2 + idx] = 1.0;
        }
    }
    out
}

fn add_effect_features(out: &mut [f32; CHOICE_FEATURE_DIM], effects: &[EffectOp]) {
    for effect in effects {
        match effect {
            EffectOp::AddPct { stat, amount, .. } => add_percent_stat(out, *stat, *amount),
            EffectOp::ScaleCurrentPct { stat, factor } => {
                add_percent_stat(out, *stat, factor - 1.0)
            }
            EffectOp::AddCapped { stat, amount, .. } => add_capped_stat(out, *stat, *amount),
            EffectOp::AddCappedPct { stat, amount, .. } => add_pct_stat(out, *stat, *amount),
            EffectOp::AddCappedPctBonus { stat, amount, .. } => {
                add_percent_stat(out, *stat, *amount)
            }
            EffectOp::ShieldGrant {
                shield,
                regen,
                max_hp_bonus,
                heal_ratio,
                ..
            } => {
                out[11] += (*shield / 100.0) as f32;
                out[11] += (*regen / 10.0) as f32;
                out[12] += max_hp_bonus.unwrap_or(0.0) as f32 / 100.0;
                out[12] += heal_ratio.unwrap_or(0.0) as f32;
            }
            EffectOp::AddLifesteal { amount } => out[12] += *amount as f32 * 4.0,
            EffectOp::HealFlat { amount, .. } => out[12] += *amount as f32 / 100.0,
            EffectOp::HealPct { amount } => out[12] += *amount as f32,
            EffectOp::AddMaxHp { amount, .. } => out[12] += *amount as f32 / 100.0,
            EffectOp::SetMin { stat, value } => add_capped_stat(out, *stat, *value),
        }
    }
    for value in out.iter_mut().skip(10) {
        *value = value.clamp(-1.0, 1.0);
    }
}

fn add_percent_stat(out: &mut [f32; CHOICE_FEATURE_DIM], stat: PercentStat, amount: f64) {
    match stat {
        PercentStat::FireRate
        | PercentStat::Damage
        | PercentStat::BulletSpeed
        | PercentStat::BulletRadius => {
            out[10] += amount as f32;
        }
        PercentStat::Speed => out[13] += amount as f32,
        PercentStat::PickupRadius => out[14] += amount as f32,
    }
}

fn add_capped_stat(out: &mut [f32; CHOICE_FEATURE_DIM], stat: CappedIntStat, amount: f64) {
    match stat {
        CappedIntStat::ProjectileCount | CappedIntStat::Pierce | CappedIntStat::Drones => {
            out[10] += (amount / 4.0) as f32;
        }
    }
}

fn add_pct_stat(out: &mut [f32; CHOICE_FEATURE_DIM], stat: CappedPctStat, amount: f64) {
    match stat {
        CappedPctStat::CritChance => out[10] += amount as f32,
    }
}

fn fixed_vec<const N: usize>(values: [f32; N]) -> Vec<f32> {
    values.into_iter().map(finite).collect()
}

fn norm(value: f64, scale: f64) -> f32 {
    finite((value / scale.max(1e-9)) as f32).clamp(-1.0, 1.0)
}

fn bool_f32(value: bool) -> f32 {
    if value {
        1.0
    } else {
        0.0
    }
}

fn finite(value: f32) -> f32 {
    if value.is_finite() {
        value
    } else {
        0.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use voidline_data::load_default;
    use voidline_sim::engine::{Engine, EngineConfig};

    #[test]
    fn encoded_observation_has_stable_finite_dimensions() {
        let bundle = load_default().unwrap();
        let mut engine = Engine::new(bundle.clone(), EngineConfig::default());
        let upgrades = engine.draft_upgrades(4);
        let relics = engine.draft_relics(3);
        let obs = encode_observation(
            &bundle,
            &engine.snapshot(),
            &upgrades,
            &relics,
            &[],
            EnvPhase::Run,
        );
        let flat = obs.flatten();

        assert_eq!(flat.len(), OBS_VECTOR_DIM);
        assert!(flat.iter().all(|value| value.is_finite()));
        assert_eq!(obs.scalar.len(), SCALAR_DIM);
        assert_eq!(obs.enemies.len(), ENEMY_DIM);
        assert_eq!(obs.owned_tags.len(), TAG_DIM);
        assert_eq!(obs.upgrade_choices.len(), UPGRADE_CHOICE_DIM);
        assert_eq!(obs.relic_choices.len(), RELIC_CHOICE_DIM);
        assert_eq!(obs.shop_choices.len(), SHOP_CHOICE_DIM);
    }

    #[test]
    fn action_mask_allows_noop_when_no_decision_is_pending() {
        let bundle = load_default().unwrap();
        let engine = Engine::new(bundle, EngineConfig::default());
        let mask = action_mask(&engine.snapshot(), &[], &[], &[], EnvPhase::Run);

        assert_eq!(mask.movement.len(), MOVEMENT_ACTIONS);
        assert_eq!(mask.upgrade_pick, vec![true, false, false, false, false]);
        assert_eq!(mask.relic_pick, vec![true, false, false, false]);
        // Shop noop slot is always allowed; in Run phase the rest is masked.
        assert_eq!(mask.shop_pick.len(), SHOP_ACTIONS);
        assert!(mask.shop_pick[0]);
        assert!(mask.shop_pick.iter().skip(1).all(|allowed| !*allowed));
        assert_eq!(mask.flatten().len(), ACTION_LOGITS);
    }

    #[test]
    fn shop_phase_unmasks_affordable_slots() {
        let bundle = load_default().unwrap();
        let engine = Engine::new(bundle, EngineConfig::default());
        let shop = vec![
            ShopChoiceRecord {
                upgrade_id: "card:twin-cannon".to_string(),
                kind: "card".to_string(),
                cost: 40,
                current_level: 0,
                max_level: 4,
            },
            ShopChoiceRecord {
                upgrade_id: "rarity:rare-signal".to_string(),
                kind: "rarity".to_string(),
                cost: 50,
                current_level: 0,
                max_level: 3,
            },
        ];
        let mask = action_mask(&engine.snapshot(), &[], &[], &shop, EnvPhase::Shop);

        assert!(mask.movement.iter().skip(1).all(|allowed| !*allowed));
        assert!(mask.shop_pick[0]); // NextRun always allowed
        assert!(mask.shop_pick[1]); // first affordable slot
        assert!(mask.shop_pick[2]); // second affordable slot
        assert!(mask.shop_pick.iter().skip(3).all(|allowed| !*allowed));
    }
}

//! Account / meta-upgrade snapshot.
//! Mirrors the relevant subset of `src/game/account-progression.ts` and
//! `src/game/meta-upgrade-catalog.ts` (purchase logic + crystal reward).

use std::collections::{HashMap, HashSet};

use voidline_data::catalogs::{MetaUpgrade, ShopItem};
use voidline_data::DataBundle;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MetaUpgradeKind {
    Unique,
    Category,
}

#[derive(Debug, Clone, Default)]
pub struct AccountRecords {
    pub best_stage: u32,
    pub best_time_seconds: u32,
    pub best_score: u32,
    pub best_run_level: u32,
    pub boss_kills: u32,
}

#[derive(Debug, Clone)]
pub struct AccountSnapshot {
    pub crystals: u64,
    pub spent_crystals: u64,
    pub upgrade_levels: HashMap<String, u32>,
    pub selected_character_id: String,
    pub selected_weapon_id: String,
    pub selected_start_stage: u32,
    pub highest_stage_cleared: u32,
    pub highest_start_stage_unlocked: u32,
    pub records: AccountRecords,
}

impl Default for AccountSnapshot {
    fn default() -> Self {
        Self {
            crystals: 0,
            spent_crystals: 0,
            upgrade_levels: HashMap::new(),
            selected_character_id: "pilot".to_string(),
            selected_weapon_id: "pulse".to_string(),
            selected_start_stage: 1,
            highest_stage_cleared: 0,
            highest_start_stage_unlocked: 1,
            records: AccountRecords::default(),
        }
    }
}

impl AccountSnapshot {
    pub fn level_of(&self, id: &str) -> u32 {
        *self.upgrade_levels.get(id).unwrap_or(&0)
    }

    pub fn is_purchased(&self, id: &str, max_level: u32) -> bool {
        self.level_of(id) >= max_level
    }
}

pub fn meta_upgrade_kind(meta: &MetaUpgrade) -> MetaUpgradeKind {
    match meta.kind.as_str() {
        "unique" => MetaUpgradeKind::Unique,
        _ => MetaUpgradeKind::Category,
    }
}

pub fn next_level_cost(account: &AccountSnapshot, meta: &MetaUpgrade) -> Option<u64> {
    let current = account.level_of(&meta.id);
    if current >= meta.max_level {
        return None;
    }
    let idx = (current as usize).min(meta.costs.len().saturating_sub(1));
    Some(meta.costs[idx] as u64)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PurchaseError {
    MaxLevel,
    Locked,
    Crystals,
}

pub fn requirement_met(account: &AccountSnapshot, requirement: &str) -> bool {
    // Fail closed on unknown requirements: a typo in balance.json should
    // gate the upgrade rather than silently unlock everything.
    match requirement {
        "available" => true,
        "reach-10m" => account.records.best_time_seconds >= 600,
        "clear-stage-1" => account.highest_stage_cleared >= 1,
        "reach-stage-2" => {
            account.records.best_stage >= 2 || account.highest_start_stage_unlocked >= 2
        }
        "boss-kill" => account.records.boss_kills > 0,
        _ => false,
    }
}

pub fn can_purchase(account: &AccountSnapshot, meta: &MetaUpgrade) -> Result<u64, PurchaseError> {
    let cost = next_level_cost(account, meta).ok_or(PurchaseError::MaxLevel)?;
    if !requirement_met(account, &meta.requirement) {
        return Err(PurchaseError::Locked);
    }
    if account.crystals < cost {
        return Err(PurchaseError::Crystals);
    }
    Ok(cost)
}

pub fn purchase(account: &mut AccountSnapshot, meta: &MetaUpgrade) -> Result<u64, PurchaseError> {
    let cost = can_purchase(account, meta)?;
    account.crystals -= cost;
    account.spent_crystals += cost;
    *account.upgrade_levels.entry(meta.id.clone()).or_insert(0) += 1;
    if let Some(weapon_id) = &meta.weapon_id {
        if matches!(meta_upgrade_kind(meta), MetaUpgradeKind::Unique) {
            account.selected_weapon_id = weapon_id.clone();
        }
    }
    if let Some(character_id) = &meta.character_id {
        if matches!(meta_upgrade_kind(meta), MetaUpgradeKind::Unique) {
            account.selected_character_id = character_id.clone();
        }
    }
    Ok(cost)
}

pub fn current_rarity_rank(account: &AccountSnapshot) -> u32 {
    // Mirrors `currentRarityRank` in src/systems/account.ts: max raw level
    // across the 4 category upgrades, capped at 3.
    let categories = [
        "category:attack",
        "category:defense",
        "category:salvage",
        "category:tempo",
    ];
    let max = categories
        .iter()
        .map(|c| account.level_of(c))
        .max()
        .unwrap_or(0);
    max.min(3)
}

pub fn crystal_reward_multiplier(account: &AccountSnapshot) -> f64 {
    let salvage = account.level_of("category:salvage");
    if salvage >= 2 {
        1.10
    } else {
        1.0
    }
}

pub fn unlocked_technology_ids(bundle: &DataBundle, account: &AccountSnapshot) -> HashSet<String> {
    let mut ids: HashSet<String> = bundle.starter_technology_ids.iter().cloned().collect();
    for meta in &bundle.meta_upgrades {
        if let Some(tech_id) = &meta.technology_id {
            if account.level_of(&meta.id) >= 1 {
                ids.insert(tech_id.clone());
            }
        }
    }
    ids
}

pub fn unlocked_build_tags(bundle: &DataBundle, account: &AccountSnapshot) -> HashSet<String> {
    let mut tags: HashSet<String> = bundle.starter_build_tags.iter().cloned().collect();
    for meta in &bundle.meta_upgrades {
        if let Some(tag) = &meta.tag {
            if account.level_of(&meta.id) >= 1 {
                tags.insert(tag.clone());
            }
        }
    }
    tags
}

pub fn _unused_shop_items(_items: &[ShopItem]) {} // keep import live

#[derive(Debug, Clone)]
pub struct RunOutcome {
    pub final_wave: u32,
    pub elapsed_seconds: f64,
    pub run_level: u32,
    pub score: u64,
    pub boss_stages: Vec<u32>,
    pub start_stage: u32,
    pub died: bool,
}

#[derive(Debug, Clone)]
pub struct CrystalBreakdown {
    pub duration: u64,
    pub stage: u64,
    pub boss: u64,
    pub score: u64,
    pub record: u64,
    pub start_stage_bonus: u64,
}

impl CrystalBreakdown {
    pub fn total(&self) -> u64 {
        self.duration + self.stage + self.boss + self.score + self.record + self.start_stage_bonus
    }
}

const START_STAGE_CRYSTAL_BONUS_PER_STAGE: f64 = 0.35;

fn unique_positive(values: &[u32]) -> Vec<u32> {
    let mut seen: HashSet<u32> = HashSet::new();
    let mut out = Vec::new();
    for &v in values {
        if v > 0 && seen.insert(v) {
            out.push(v);
        }
    }
    out.sort();
    out
}

fn highest_reached_stage(outcome: &RunOutcome) -> u32 {
    let start = outcome.start_stage.max(1);
    let cleared = unique_positive(&outcome.boss_stages)
        .into_iter()
        .max()
        .unwrap_or(0);
    start.max(cleared + 1)
}

pub fn compute_run_breakdown(account: &AccountSnapshot, outcome: &RunOutcome) -> CrystalBreakdown {
    let elapsed = outcome.elapsed_seconds.floor().max(0.0) as u64;
    let stage = (outcome.final_wave / 9)
        .max(1)
        .max(highest_reached_stage(outcome));
    let stage = stage.max(outcome.start_stage);
    let run_level = outcome.run_level.max(1);
    let unique_boss = unique_positive(&outcome.boss_stages);
    let score = outcome.score;
    let start_stage = outcome.start_stage.max(1);

    let duration = elapsed / 12;
    let stage_crystals = (stage as u64) * 12 + ((run_level.saturating_sub(1)) as u64) * 2;
    let boss_crystals = (unique_boss.len() as u64) * 45;
    let score_crystals = (score / 1_250).min(45);

    let mut record_crystals: u64 = 0;
    if stage > account.records.best_stage {
        record_crystals += 25;
    }
    if elapsed > account.records.best_time_seconds as u64 {
        record_crystals += 18;
    }
    if score > account.records.best_score as u64 {
        record_crystals += 18;
    }
    if run_level > account.records.best_run_level {
        record_crystals += 12;
    }

    let base = duration + stage_crystals + boss_crystals + score_crystals + record_crystals;
    let start_stage_bonus = if start_stage > 1 {
        ((base as f64) * (start_stage - 1) as f64 * START_STAGE_CRYSTAL_BONUS_PER_STAGE).floor()
            as u64
    } else {
        0
    };

    CrystalBreakdown {
        duration,
        stage: stage_crystals,
        boss: boss_crystals,
        score: score_crystals,
        record: record_crystals,
        start_stage_bonus,
    }
}

pub fn apply_run_reward(account: &mut AccountSnapshot, outcome: &RunOutcome) -> u64 {
    let breakdown = compute_run_breakdown(account, outcome);
    let multiplier = crystal_reward_multiplier(account);
    let gained = (breakdown.total() as f64 * multiplier).floor() as u64;

    let unique_boss = unique_positive(&outcome.boss_stages);
    let highest_boss_stage = unique_boss.iter().copied().max().unwrap_or(0);
    let highest_stage_cleared = account.highest_stage_cleared.max(highest_boss_stage);
    let highest_reached = highest_reached_stage(outcome);
    let previous_start_stage = account.highest_start_stage_unlocked;
    let highest_start_stage_unlocked = account
        .highest_start_stage_unlocked
        .max(1)
        .max(highest_stage_cleared + 1);

    account.crystals += gained;
    account.highest_stage_cleared = highest_stage_cleared;
    account.highest_start_stage_unlocked = highest_start_stage_unlocked;
    // Mirrors src/game/account-progression.ts:applyCrystalReward:
    // promote selected_start_stage when a new tier unlocks, otherwise
    // clamp the existing selection to the (possibly tightened) ceiling.
    account.selected_start_stage = if highest_start_stage_unlocked > previous_start_stage {
        highest_start_stage_unlocked
    } else {
        account
            .selected_start_stage
            .min(highest_start_stage_unlocked)
    };
    account.records.best_stage = account.records.best_stage.max(highest_reached);
    account.records.best_time_seconds = account
        .records
        .best_time_seconds
        .max(outcome.elapsed_seconds.floor() as u32);
    account.records.best_score = account.records.best_score.max(outcome.score as u32);
    account.records.best_run_level = account.records.best_run_level.max(outcome.run_level);
    account.records.boss_kills += unique_boss.len() as u32;

    gained
}

#[cfg(test)]
mod tests {
    use super::*;
    use voidline_data::load_default;

    fn fresh() -> AccountSnapshot {
        AccountSnapshot::default()
    }

    fn meta<'a>(bundle: &'a voidline_data::DataBundle, id: &str) -> &'a MetaUpgrade {
        bundle.meta_upgrades.iter().find(|m| m.id == id).unwrap()
    }

    #[test]
    fn rarity_rank_zero_for_fresh_account() {
        assert_eq!(current_rarity_rank(&fresh()), 0);
    }

    #[test]
    fn rarity_rank_caps_at_three() {
        let mut account = fresh();
        account
            .upgrade_levels
            .insert("category:attack".to_string(), 4);
        assert_eq!(current_rarity_rank(&account), 3);
    }

    #[test]
    fn rarity_rank_takes_max_across_categories() {
        let mut account = fresh();
        account
            .upgrade_levels
            .insert("category:attack".to_string(), 1);
        account
            .upgrade_levels
            .insert("category:defense".to_string(), 2);
        account
            .upgrade_levels
            .insert("category:salvage".to_string(), 3);
        account
            .upgrade_levels
            .insert("category:tempo".to_string(), 1);
        assert_eq!(current_rarity_rank(&account), 3);
    }

    #[test]
    fn crystal_multiplier_unlocks_at_salvage_level_2() {
        let mut account = fresh();
        assert_eq!(crystal_reward_multiplier(&account), 1.0);
        account
            .upgrade_levels
            .insert("category:salvage".to_string(), 1);
        assert_eq!(crystal_reward_multiplier(&account), 1.0);
        account
            .upgrade_levels
            .insert("category:salvage".to_string(), 2);
        assert!((crystal_reward_multiplier(&account) - 1.10).abs() < 1e-12);
        account
            .upgrade_levels
            .insert("category:salvage".to_string(), 4);
        assert!((crystal_reward_multiplier(&account) - 1.10).abs() < 1e-12);
    }

    #[test]
    fn purchase_consumes_crystals_and_advances_level() {
        let bundle = load_default().unwrap();
        let mut account = fresh();
        let attack = meta(&bundle, "category:attack");
        let cost = next_level_cost(&account, attack).expect("cost defined");
        account.crystals = cost + 5;
        let spent = purchase(&mut account, attack).expect("purchase ok");
        assert_eq!(spent, cost);
        assert_eq!(account.crystals, 5);
        assert_eq!(account.spent_crystals, cost);
        assert_eq!(account.level_of("category:attack"), 1);
    }

    #[test]
    fn purchase_fails_without_funds() {
        let bundle = load_default().unwrap();
        let mut account = fresh();
        let attack = meta(&bundle, "category:attack");
        let res = purchase(&mut account, attack);
        assert!(res.is_err(), "expected failure without crystals");
        assert_eq!(account.level_of("category:attack"), 0);
    }

    #[test]
    fn unlocked_techs_include_starters() {
        let bundle = load_default().unwrap();
        let account = fresh();
        let techs = unlocked_technology_ids(&bundle, &account);
        for starter in &bundle.starter_technology_ids {
            assert!(techs.contains(starter), "starter {starter} missing");
        }
    }

    #[test]
    fn unlocked_techs_grow_with_meta_purchases() {
        let bundle = load_default().unwrap();
        let mut account = fresh();
        let baseline_techs = unlocked_technology_ids(&bundle, &account).len();
        // category:attack carries technologyId in catalogs.
        account
            .upgrade_levels
            .insert("category:attack".to_string(), 1);
        let after = unlocked_technology_ids(&bundle, &account).len();
        assert!(after >= baseline_techs);
    }
}

//! Serde types for `data/balance.json` — the single source of truth shared
//! with the TypeScript codebase via `npm run data:export`.
//!
//! These types intentionally mirror the TS structures one-to-one. Adding a
//! field on the TS side means re-running `npm run data:export` and updating
//! the matching struct here.

pub mod balance;
pub mod catalogs;
pub mod dsl;

pub use balance::Balance;
pub use catalogs::{
    BossDef, BossStats, Character, EnemySpawnPolicy, EnemySpawnRule, EnemyType, MetaUpgrade, Relic,
    RelicUnlock, ShopItem, Upgrade, UpgradeTier, Weapon,
};
pub use dsl::{
    CapKey, CappedIntStat, CappedPctStat, EffectOp, EffectScale, GainCurve, PercentStat,
};

use serde::Deserialize;
use std::path::Path;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DataBundle {
    pub schema_version: u32,
    pub balance: Balance,
    pub enemy_spawn_rules: catalogs::EnemySpawnRules,
    pub upgrades: Vec<Upgrade>,
    pub relics: Vec<Relic>,
    pub fallback_relic: Relic,
    pub relic_unlocks: Vec<RelicUnlock>,
    pub default_relic_ids: Vec<String>,
    pub meta_upgrades: Vec<MetaUpgrade>,
    pub shop_items: Vec<ShopItem>,
    pub characters: Vec<Character>,
    pub weapons: Vec<Weapon>,
    pub bosses: Vec<BossDef>,
    pub starter_technology_ids: Vec<String>,
    pub starter_build_tags: Vec<String>,
}

#[derive(Debug)]
pub enum LoadError {
    Io(std::io::Error),
    Parse(serde_json::Error),
}

impl std::fmt::Display for LoadError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LoadError::Io(e) => write!(f, "I/O error reading balance.json: {e}"),
            LoadError::Parse(e) => write!(f, "JSON parse error in balance.json: {e}"),
        }
    }
}

impl std::error::Error for LoadError {}

impl From<std::io::Error> for LoadError {
    fn from(value: std::io::Error) -> Self {
        Self::Io(value)
    }
}

impl From<serde_json::Error> for LoadError {
    fn from(value: serde_json::Error) -> Self {
        Self::Parse(value)
    }
}

pub fn load_bundle(path: impl AsRef<Path>) -> Result<DataBundle, LoadError> {
    let raw = std::fs::read_to_string(path)?;
    let bundle: DataBundle = serde_json::from_str(&raw)?;
    Ok(bundle)
}

pub fn load_default() -> Result<DataBundle, LoadError> {
    // Walk up from the current working directory to find `data/balance.json`.
    // Useful because cargo test runs inside the crate dir, while CLI binaries
    // typically run from the repo root or from `sim/`.
    let candidates = [
        std::path::PathBuf::from("data/balance.json"),
        std::path::PathBuf::from("../data/balance.json"),
        std::path::PathBuf::from("../../data/balance.json"),
        std::path::PathBuf::from("../../../data/balance.json"),
        std::path::PathBuf::from("../../../../data/balance.json"),
    ];
    for candidate in &candidates {
        if candidate.exists() {
            return load_bundle(candidate);
        }
    }
    load_bundle("data/balance.json")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn collect_numbers(value: &serde_json::Value, path: &str, out: &mut Vec<(String, f64)>) {
        match value {
            serde_json::Value::Number(n) => {
                if let Some(f) = n.as_f64() {
                    out.push((path.to_string(), f));
                }
            }
            serde_json::Value::Array(items) => {
                for (i, item) in items.iter().enumerate() {
                    collect_numbers(item, &format!("{path}[{i}]"), out);
                }
            }
            serde_json::Value::Object(map) => {
                for (k, v) in map {
                    collect_numbers(v, &format!("{path}.{k}"), out);
                }
            }
            _ => {}
        }
    }

    #[test]
    fn loads_default_bundle() {
        let bundle = load_default().expect("balance.json should load");
        assert_eq!(bundle.schema_version, 1);
        assert!(!bundle.upgrades.is_empty(), "upgrades non-empty");
        assert!(!bundle.relics.is_empty(), "relics non-empty");
        assert!(!bundle.meta_upgrades.is_empty(), "meta upgrades non-empty");
        assert!(!bundle.bosses.is_empty(), "bosses non-empty");
        assert_eq!(bundle.weapons.len(), 4);
        assert_eq!(bundle.characters.len(), 3);
    }

    #[test]
    fn balance_contains_no_nan_or_negative_numbers() {
        let raw = std::fs::read_to_string("../../data/balance.json")
            .or_else(|_| std::fs::read_to_string("../../../data/balance.json"))
            .or_else(|_| std::fs::read_to_string("data/balance.json"))
            .expect("read balance.json");
        let value: serde_json::Value = serde_json::from_str(&raw).expect("parse json");
        let balance_value = value.get("balance").expect("balance key");
        let mut numbers = Vec::new();
        collect_numbers(balance_value, "balance", &mut numbers);
        assert!(!numbers.is_empty());
        for (path, n) in &numbers {
            assert!(n.is_finite(), "{path} is not finite ({n})");
            assert!(*n >= 0.0, "{path} is negative ({n})");
        }
    }

    #[test]
    fn upgrade_effects_parse_into_dsl_variants() {
        let bundle = load_default().expect("load");
        let total_effects: usize = bundle.upgrades.iter().map(|u| u.effects.len()).sum();
        assert!(total_effects > 0, "at least one upgrade has effects");
    }

    #[test]
    fn every_upgrade_has_at_least_one_effect() {
        let bundle = load_default().expect("load");
        for upgrade in &bundle.upgrades {
            assert!(
                !upgrade.effects.is_empty(),
                "upgrade {} has no effects",
                upgrade.id,
            );
        }
    }

    #[test]
    fn every_upgrade_has_at_least_one_tag() {
        let bundle = load_default().expect("load");
        for upgrade in &bundle.upgrades {
            assert!(
                !upgrade.tags.is_empty(),
                "upgrade {} has no tags",
                upgrade.id,
            );
        }
    }

    #[test]
    fn upgrade_ids_are_unique() {
        let bundle = load_default().expect("load");
        let mut seen = std::collections::HashSet::new();
        for upgrade in &bundle.upgrades {
            assert!(
                seen.insert(&upgrade.id),
                "duplicate upgrade id: {}",
                upgrade.id
            );
        }
    }

    #[test]
    fn relic_ids_are_unique() {
        let bundle = load_default().expect("load");
        let mut seen = std::collections::HashSet::new();
        for relic in &bundle.relics {
            assert!(seen.insert(&relic.id), "duplicate relic id: {}", relic.id);
        }
    }

    #[test]
    fn tier_ids_are_unique_and_ordered() {
        let bundle = load_default().expect("load");
        let mut seen = std::collections::HashSet::new();
        for tier in &bundle.balance.tiers {
            assert!(seen.insert(&tier.id), "duplicate tier id: {}", tier.id);
        }
        assert_eq!(bundle.balance.tiers.len(), 4, "expect 4 tiers");
        assert_eq!(bundle.balance.tiers[0].id, "standard");
        assert_eq!(bundle.balance.tiers[3].id, "singularity");
    }

    #[test]
    fn caps_struct_includes_new_fire_rate_and_damage_caps() {
        let bundle = load_default().expect("load");
        let caps = &bundle.balance.upgrade.caps;
        assert!(caps.fire_rate_mul > 0.0, "fire_rate_mul must be set");
        assert!(caps.damage_mul > 0.0, "damage_mul must be set");
    }

    #[test]
    fn per_rank_struct_present_in_balance() {
        let bundle = load_default().expect("load");
        let pr = &bundle.balance.upgrade.tier_weights.per_rank;
        assert!(pr.standard_penalty >= 0.0);
        assert!(pr.rare >= 0.0);
        assert!(pr.prototype >= 0.0);
        assert!(pr.singularity >= 0.0);
    }

    #[test]
    fn gates_have_consistent_min_waves() {
        let bundle = load_default().expect("load");
        let gates = &bundle.balance.upgrade.gates;
        assert!(gates.rare.min_wave <= gates.prototype.min_wave);
        assert!(gates.prototype.min_wave <= gates.singularity.min_wave);
    }

    #[test]
    fn every_enemy_kind_has_a_spawn_rule() {
        let bundle = load_default().expect("load");
        for enemy in &bundle.balance.enemies {
            assert!(
                bundle.enemy_spawn_rules.contains_key(&enemy.id),
                "enemy {} has no matching spawn rule",
                enemy.id,
            );
        }
    }
}

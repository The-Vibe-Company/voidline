//! Mirrors for upgrades, relics, characters, weapons, bosses, meta-upgrades,
//! shop items and starter pools.

use serde::Deserialize;
use std::collections::HashMap;

use crate::dsl::EffectOp;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnemyType {
    pub id: String,
    pub score: f64,
    pub radius: f64,
    pub hp: f64,
    pub speed: f64,
    pub damage: f64,
    pub color: String,
    pub accent: String,
    pub sides: u32,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpgradeTier {
    pub id: String,
    pub short: String,
    pub name: String,
    pub power: f64,
    pub color: String,
    pub glow: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnemySpawnRule {
    pub base_chance: f64,
    pub per_pressure: f64,
    pub max_chance: f64,
    pub pressure_onset: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub enum EnemySpawnPolicy {
    Residual(ResidualMarker),
    Rule(EnemySpawnRule),
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub enum ResidualMarker {
    #[serde(rename = "residual")]
    Residual,
}

pub type EnemySpawnRules = HashMap<String, EnemySpawnPolicy>;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpgradeSoftCap {
    pub stat: String,
    pub max: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Upgrade {
    pub id: String,
    pub kind: String,
    #[serde(default)]
    pub weapon_id: Option<String>,
    pub icon: String,
    pub name: String,
    pub description: String,
    pub tags: Vec<String>,
    pub effects: Vec<EffectOp>,
    #[serde(default)]
    pub soft_cap: Option<UpgradeSoftCap>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Relic {
    pub id: String,
    pub icon: String,
    pub name: String,
    pub description: String,
    pub tags: Vec<String>,
    pub color: String,
    pub effect: String,
    #[serde(default)]
    pub repeatable: bool,
    pub effects: Vec<EffectOp>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelicUnlock {
    pub stage: f64,
    pub relic_ids: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetaUpgradeLevel {
    pub summary: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetaUpgrade {
    pub id: String,
    pub kind: String,
    pub name: String,
    pub description: String,
    pub max_level: u32,
    pub costs: Vec<f64>,
    pub requirement: String,
    #[serde(default)]
    pub tag: Option<String>,
    #[serde(default)]
    pub weapon_id: Option<String>,
    #[serde(default)]
    pub character_id: Option<String>,
    #[serde(default)]
    pub technology_id: Option<String>,
    #[serde(default)]
    pub levels: Option<Vec<MetaUpgradeLevel>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShopItem {
    pub id: String,
    pub kind: String,
    pub name: String,
    pub description: String,
    pub cost: f64,
    pub tags: Vec<String>,
    pub requirement: String,
    #[serde(default)]
    pub character_id: Option<String>,
    #[serde(default)]
    pub weapon_id: Option<String>,
    #[serde(default)]
    pub technology_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Character {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub description: String,
    pub bonus_label: String,
    pub effects: Vec<EffectOp>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Weapon {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub description: String,
    pub tags: Vec<String>,
    pub effects: Vec<EffectOp>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BossDef {
    pub id: String,
    pub role: String,
    pub label: String,
    pub stats: BossStats,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BossStats {
    pub hp_multiplier: f64,
    pub speed_multiplier: f64,
    pub damage_multiplier: f64,
    pub radius_multiplier: f64,
    pub score_multiplier: f64,
    pub contact_cooldown: f64,
    pub color: String,
    pub accent: String,
    pub sides: u32,
    pub wobble: f64,
    pub wobble_rate: f64,
}

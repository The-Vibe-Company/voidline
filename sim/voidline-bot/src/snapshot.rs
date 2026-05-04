use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub const SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Snapshot {
    pub schema_version: u32,
    pub mode: String,
    pub wave: u32,
    #[serde(rename = "waveTimer")]
    pub wave_timer: f64,
    #[serde(rename = "runElapsed")]
    pub run_elapsed: f64,
    pub score: i64,
    pub currency: i64,
    pub hp: f64,
    #[serde(rename = "maxHp")]
    pub max_hp: f64,
    pub player: PlayerSnapshot,
    pub enemies: Vec<EnemySnapshot>,
    pub orbs: Vec<OrbSnapshot>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PlayerSnapshot {
    pub x: f64,
    pub y: f64,
    pub speed: f64,
    pub damage: f64,
    pub fire_rate: f64,
    pub range: f64,
    pub projectile_count: f64,
    pub pierce: f64,
    pub crit_chance: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EnemySnapshot {
    pub id: u32,
    pub kind: String,
    pub x: f64,
    pub y: f64,
    pub radius: f64,
    pub hp: f64,
    pub max_hp: f64,
    pub speed: f64,
    pub damage: f64,
    pub is_boss: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct OrbSnapshot {
    pub id: u32,
    pub x: f64,
    pub y: f64,
    pub value: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShopState {
    pub schema_version: u32,
    pub offers: Vec<ShopOffer>,
    #[serde(rename = "rerollCost")]
    pub reroll_cost: i64,
    pub currency: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShopOffer {
    pub id: String,
    pub cost: i64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct MetaLevels(pub BTreeMap<String, u32>);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameoverSummary {
    pub schema_version: u32,
    pub wave: u32,
    pub score: i64,
    pub elapsed: f64,
    #[serde(rename = "crystalsGained")]
    pub crystals_gained: i64,
    #[serde(rename = "totalCrystals")]
    pub total_crystals: i64,
}

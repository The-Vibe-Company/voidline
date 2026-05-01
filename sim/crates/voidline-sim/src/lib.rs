//! Headless Voidline gameplay simulation, ported from the TypeScript core.
//! Designed for parity with the TS sim (deterministic with the same seed).

pub mod balance_curves;
pub mod bullets;
pub mod chests;
pub mod effects;
pub mod enemies;
pub mod engine;
pub mod entities;
pub mod experience;
pub mod input;
pub mod math;
pub mod player;
pub mod player_update;
pub mod pools;
pub mod powerups;
pub mod progression;
pub mod rng;
pub mod roguelike;
pub mod simulation;
pub mod spatial_grid;
pub mod spawn;
pub mod state;
pub mod synergies;
pub mod world;

pub use balance_curves::{
    experience_drop_total, experience_orb_radius, experience_shard_count, late_pressure,
    pressure_target, scaled_enemy_stats, score_award, select_upgrade_tier, spawn_gap,
    spawn_pack_chance, stepped_upgrade_gain, upgrade_tier_weights, xp_to_next_level,
    ScaledEnemyStats, WeightedTier,
};
pub use math::{circle_hit, clamp, distance, distance_sq};
pub use rng::Mulberry32;

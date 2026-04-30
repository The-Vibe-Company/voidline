//! Headless Voidline gameplay simulation, ported from the TypeScript core.
//! Designed for parity with the TS sim (deterministic with the same seed).

pub mod balance_curves;
pub mod effects;
pub mod math;
pub mod player;
pub mod rng;

pub use balance_curves::{
    experience_drop_total, experience_orb_radius, experience_shard_count,
    late_wave_pressure, scaled_enemy_stats, score_award, select_upgrade_tier,
    spawn_gap, spawn_pack_chance, stepped_upgrade_gain, upgrade_tier_weights, wave_target,
    xp_to_next_level, ScaledEnemyStats, WeightedTier,
};
pub use math::{circle_hit, clamp, distance, distance_sq};
pub use rng::Mulberry32;

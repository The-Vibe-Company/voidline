//! Mirror of the `balance` namespace in `src/game/balance.ts`.

use serde::Deserialize;
use std::collections::HashMap;

use crate::catalogs::{EnemyType, UpgradeTier};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Balance {
    pub player: PlayerBalance,
    pub pressure: PressureBalance,
    pub xp: XpBalance,
    pub late_pressure: LatePressureBalance,
    pub enemy: EnemyBalance,
    pub enemies: Vec<EnemyType>,
    pub upgrade: UpgradeBalance,
    pub tiers: Vec<UpgradeTier>,
    pub bosses: BossBalance,
    pub hordes: HordeBalance,
    pub synergies: SynergyBalance,
    pub powerups: PowerupBalance,
    pub progression: ProgressionBalance,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerBalance {
    pub stats: PlayerStats,
    pub reset_invulnerability: f64,
    pub weapon_spread: WeaponSpread,
    pub drone: DroneBalance,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerStats {
    pub radius: f64,
    pub hp: f64,
    pub max_hp: f64,
    pub speed: f64,
    pub damage: f64,
    pub fire_rate: f64,
    pub bullet_speed: f64,
    pub projectile_count: f64,
    pub pierce: f64,
    pub drones: f64,
    pub shield: f64,
    pub shield_max: f64,
    pub shield_regen: f64,
    pub crit_chance: f64,
    pub lifesteal: f64,
    pub pickup_radius: f64,
    pub bullet_radius: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WeaponSpread {
    pub max: f64,
    pub per_extra_projectile: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DroneBalance {
    pub bullet_speed_mul: f64,
    pub damage_mul: f64,
    pub damage_mul_swarm: f64,
    pub bullet_life: f64,
    pub bullet_radius: f64,
    pub orbit_radius: f64,
    pub orbit_angular_velocity: f64,
    pub fire_interval: DroneFireInterval,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DroneFireInterval {
    pub base: f64,
    pub swarm: f64,
    pub reduce_per_drone: f64,
    pub reduce_per_drone_swarm: f64,
    pub min: f64,
    pub min_swarm: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PressureBalance {
    pub target_base: f64,
    pub target_linear: f64,
    pub target_exponent: f64,
    pub spawn_gap_start: f64,
    pub spawn_gap_per_pressure: f64,
    pub spawn_gap_min: f64,
    pub spawn_timer_start: f64,
    pub pack_chance_per_pressure: f64,
    pub pack_chance_max: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LatePressureBalance {
    pub start_pressure: f64,
    pub target_linear: f64,
    pub target_exponent: f64,
    pub target_exponent_scale: f64,
    pub spawn_gap_per_pressure: f64,
    pub spawn_gap_min: f64,
    pub pack_chance_per_pressure: f64,
    pub pack_chance_max: f64,
    pub hp_scale_per_pressure: f64,
    pub speed_scale_per_pressure: f64,
    pub speed_scale_max: f64,
    pub damage_scale_per_pressure: f64,
    pub damage_scale_max: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct XpBalance {
    pub level_base: f64,
    pub level_linear: f64,
    pub level_exponent: f64,
    pub level_exponent_scale: f64,
    pub drop_score_divisor: f64,
    pub drop_pressure_scale: f64,
    pub shard_count: HashMap<String, u32>,
    pub orb_radius_base: f64,
    pub orb_radius_value_scale: f64,
    pub orb_radius_bonus_max: f64,
    pub pickup_base_radius: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnemyBalance {
    pub hp_scale_per_pressure: f64,
    pub speed_scale_per_pressure: f64,
    pub speed_scale_max: f64,
    pub hunter_chance_per_pressure: f64,
    pub hunter_chance_max: f64,
    pub brute_chance_offset_pressure: f64,
    pub brute_chance_per_pressure: f64,
    pub brute_chance_max: f64,
    pub wobble: EnemyWobble,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnemyWobble {
    pub scout: f64,
    pub hunter: f64,
    pub brute: f64,
    pub rate_base: f64,
    pub rate_random: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpgradeBalance {
    pub caps: UpgradeCaps,
    pub stepped_gain: SteppedGain,
    pub tier_weights: TierWeights,
    pub gates: TierGates,
    pub effects: UpgradeEffects,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpgradeCaps {
    pub drones: f64,
    pub projectiles: f64,
    pub pierce: f64,
    pub crit_chance: f64,
    pub fire_rate_mul: f64,
    pub damage_mul: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SteppedGain {
    pub rare_threshold: f64,
    pub singularity_threshold: f64,
    pub standard: f64,
    pub rare: f64,
    pub singularity: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TierWeights {
    pub standard_min: f64,
    pub standard_base: f64,
    pub standard_per_pressure: f64,
    pub rare_base: f64,
    pub rare_per_pressure: f64,
    pub prototype_base: f64,
    pub prototype_per_pressure: f64,
    pub singularity_per_pressure: f64,
    pub per_rank: PerRankWeights,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PerRankWeights {
    pub standard_penalty: f64,
    pub rare: f64,
    pub prototype: f64,
    pub singularity: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TierGates {
    pub rare: TierGate,
    pub prototype: TierGate,
    pub singularity: TierGate,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TierGate {
    pub min_pressure: f64,
    pub ramp_pressures: f64,
    #[serde(default)]
    pub locked_weight: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpgradeEffects {
    pub fire_rate: f64,
    pub damage: f64,
    pub bullet_speed: f64,
    pub speed: f64,
    pub shield: f64,
    pub shield_regen: f64,
    pub max_hp: f64,
    pub heal: f64,
    pub pierce_damage: f64,
    pub crit_chance: f64,
    pub lifesteal: f64,
    pub pickup_radius: f64,
    pub bullet_radius: f64,
    pub drone_extra_threshold: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BossBalance {
    pub stage_duration_seconds: f64,
    pub pressure_offset_per_stage: f64,
    pub contact_backoff: f64,
    pub stage_scaling: BossStageScaling,
    pub wobble: BossWobbleMap,
    pub spawn_offsets: BossSpawnOffsets,
    pub boss: BossTuning,
    pub mini_boss: MiniBossTuning,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BossStageScaling {
    pub hp_per_stage: f64,
    pub damage_per_stage: f64,
    pub speed_per_stage: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BossWobbleMap {
    pub boss: BossWobble,
    pub mini_boss: BossWobble,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BossWobble {
    pub value: f64,
    pub rate: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BossSpawnOffsets {
    pub mini_boss: MiniBossSpawnOffset,
    pub stage_boss: StageBossSpawnOffset,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MiniBossSpawnOffset {
    pub eligible_from_pressure: f64,
    pub offset: f64,
    pub fallback_pressure: f64,
    pub fallback_roll: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StageBossSpawnOffset {
    pub offset: f64,
    pub stage_multiplier: f64,
    pub roll: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BossTuning {
    pub hp_multiplier: f64,
    pub speed_multiplier: f64,
    pub damage_multiplier: f64,
    pub radius_multiplier: f64,
    pub score_multiplier: f64,
    pub contact_cooldown: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MiniBossTuning {
    pub start_pressure: f64,
    pub spawn_chance: f64,
    pub guarantee_after_eligible_pressures: f64,
    pub hp_multiplier: f64,
    pub speed_multiplier: f64,
    pub damage_multiplier: f64,
    pub radius_multiplier: f64,
    pub score_multiplier: f64,
    pub contact_cooldown: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SynergyBalance {
    pub kinetic_ram: KineticRamSynergy,
    pub magnet_storm: MagnetStormSynergy,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KineticRamSynergy {
    pub min_speed: f64,
    pub min_shield_ratio: f64,
    pub cooldown: f64,
    pub hit_duration: f64,
    pub knockback: f64,
    pub damage: KineticRamDamage,
    pub shield_cost: KineticRamShieldCost,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KineticRamDamage {
    pub vs_damage: f64,
    pub vs_shield: f64,
    pub vs_speed: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KineticRamShieldCost {
    pub flat: f64,
    pub per_radius: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MagnetStormSynergy {
    pub threshold: f64,
    pub cooldown: f64,
    pub hit_duration: f64,
    pub knockback: f64,
    pub radius: MagnetStormRadius,
    pub damage: MagnetStormDamage,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MagnetStormRadius {
    pub base: f64,
    pub pickup_factor: f64,
    pub max_bonus: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MagnetStormDamage {
    pub vs_damage: f64,
    pub vs_charge: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PowerupBalance {
    pub heart_heal_ratio: f64,
    pub pull_radius: f64,
    pub pull_strength: f64,
    pub velocity_damping: f64,
    pub drop_chance: HashMap<String, f64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HordeBalance {
    pub starts_seconds: Vec<f64>,
    pub duration_seconds: f64,
    pub spawn_gap_multiplier: f64,
    pub pressure_target_multiplier: f64,
    pub pack_bonus: u32,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressionBalance {
    pub relic_unlock_stages: Vec<f64>,
}

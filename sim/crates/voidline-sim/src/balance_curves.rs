//! Pure functions ported from `src/game/balance.ts` and `balance-curves.ts`.
//!
//! All formulas mirror the TS reference exactly; floating-point results
//! match Node V8 to within IEEE-754 precision. Verified by comparing
//! known constants from `balance.test.ts`.

use voidline_data::balance::Balance;
use voidline_data::catalogs::EnemyType;

pub fn wave_target(balance: &Balance, wave: u32) -> i64 {
    let w = wave as f64;
    let base = balance.wave.target_base
        + w * balance.wave.target_linear
        + w.powf(balance.wave.target_exponent)
        + late_wave_target_bonus(balance, wave);
    base.round() as i64
}

pub fn spawn_gap(balance: &Balance, wave: u32) -> f64 {
    let late_pressure = late_wave_pressure(balance, wave) as f64;
    let min = if late_pressure > 0.0 {
        balance.late_wave.spawn_gap_min
    } else {
        balance.wave.spawn_gap_min
    };
    let raw = balance.wave.spawn_gap_start
        - (wave as f64) * balance.wave.spawn_gap_per_wave
        - late_pressure * balance.late_wave.spawn_gap_per_wave;
    raw.max(min)
}

pub fn spawn_pack_chance(balance: &Balance, wave: u32) -> f64 {
    let late_pressure = late_wave_pressure(balance, wave) as f64;
    let cap = if late_pressure > 0.0 {
        balance
            .late_wave
            .pack_chance_max
            .min(balance.wave.pack_chance_max + late_pressure * balance.late_wave.pack_chance_per_wave)
    } else {
        balance.wave.pack_chance_max
    };
    let value = (wave as f64) * balance.wave.pack_chance_per_wave
        + late_pressure * balance.late_wave.pack_chance_per_wave;
    value.min(cap)
}

pub fn score_award(enemy_score: f64, wave: u32) -> i64 {
    (enemy_score * (1.25 + (wave as f64) * 0.1)).round() as i64
}

pub fn xp_to_next_level(balance: &Balance, level: u32) -> i64 {
    let l = level as f64;
    let raw = balance.xp.level_base
        + l * balance.xp.level_linear
        + l.powf(balance.xp.level_exponent) * balance.xp.level_exponent_scale;
    raw.round() as i64
}

pub fn experience_drop_total(balance: &Balance, enemy_score: f64, wave: u32) -> i64 {
    let raw = (enemy_score / balance.xp.drop_score_divisor)
        * (1.0 + (wave as f64) * balance.xp.drop_wave_scale);
    raw.round() as i64
}

pub fn experience_orb_radius(balance: &Balance, value: f64) -> f64 {
    balance.xp.orb_radius_base
        + balance
            .xp
            .orb_radius_bonus_max
            .min(value * balance.xp.orb_radius_value_scale)
}

pub fn experience_shard_count(balance: &Balance, kind: &str) -> u32 {
    *balance
        .xp
        .shard_count
        .get(kind)
        .unwrap_or_else(|| panic!("Unknown enemy kind for shard count: {kind}"))
}

pub fn late_wave_pressure(balance: &Balance, wave: u32) -> i64 {
    let p = (wave as i64) - (balance.late_wave.start_wave as i64) + 1;
    p.max(0)
}

fn late_wave_target_bonus(balance: &Balance, wave: u32) -> f64 {
    let pressure = late_wave_pressure(balance, wave);
    if pressure <= 0 {
        return 0.0;
    }
    let p = pressure as f64;
    let raw = p * balance.late_wave.target_linear
        + p.powf(balance.late_wave.target_exponent) * balance.late_wave.target_exponent_scale;
    raw.round()
}

#[derive(Debug, Clone, Copy)]
pub struct ScaledEnemyStats {
    pub hp: f64,
    pub speed: f64,
    pub damage: f64,
}

pub fn scaled_enemy_stats(balance: &Balance, ty: &EnemyType, wave: u32) -> ScaledEnemyStats {
    let w = wave as f64;
    let late = late_wave_pressure(balance, wave) as f64;
    let speed_extra = (w * balance.enemy.speed_scale_per_wave).min(balance.enemy.speed_scale_max);
    let speed_extra_late = (late * balance.late_wave.speed_scale_per_wave).min(balance.late_wave.speed_scale_max);
    let damage_extra = (late * balance.late_wave.damage_scale_per_wave).min(balance.late_wave.damage_scale_max);
    ScaledEnemyStats {
        hp: ty.hp
            * (1.0 + w * balance.enemy.hp_scale_per_wave + late * balance.late_wave.hp_scale_per_wave),
        speed: ty.speed * (1.0 + speed_extra + speed_extra_late),
        damage: ty.damage * (1.0 + damage_extra),
    }
}

#[derive(Debug, Clone)]
pub struct WeightedTier<'a> {
    pub tier: &'a voidline_data::catalogs::UpgradeTier,
    pub weight: f64,
}

pub fn upgrade_tier_weights<'a>(balance: &'a Balance, wave: u32, rarity_rank: u32) -> Vec<WeightedTier<'a>> {
    let weights = &balance.upgrade.tier_weights;
    let gates = &balance.upgrade.gates;
    let rank = rarity_rank.min(3) as f64;
    let w = wave as f64;

    let proto_ramp = gate_ramp_multiplier(w, gates.prototype.min_wave, gates.prototype.ramp_waves);
    let sing_ramp = gate_ramp_multiplier(w, gates.singularity.min_wave, gates.singularity.ramp_waves);

    vec![
        WeightedTier {
            tier: &balance.tiers[0],
            weight: weights
                .standard_min
                .max(weights.standard_base - w * weights.standard_per_wave - rank * 8.0),
        },
        WeightedTier {
            tier: &balance.tiers[1],
            weight: weights.rare_base + w * weights.rare_per_wave + rank * 6.0,
        },
        WeightedTier {
            tier: &balance.tiers[2],
            weight: if proto_ramp > 0.0 {
                (weights.prototype_base + w * weights.prototype_per_wave + rank * 3.0) * proto_ramp
            } else {
                gates.prototype.locked_weight
            },
        },
        WeightedTier {
            tier: &balance.tiers[3],
            weight: if sing_ramp > 0.0 {
                (w * weights.singularity_per_wave + rank * 1.5) * sing_ramp
            } else {
                gates.singularity.locked_weight
            },
        },
    ]
}

pub fn select_upgrade_tier<'a>(
    balance: &'a Balance,
    wave: u32,
    roll: f64,
    rarity_rank: u32,
) -> &'a voidline_data::catalogs::UpgradeTier {
    let weights = upgrade_tier_weights(balance, wave, rarity_rank);
    let total: f64 = weights.iter().map(|w| w.weight.max(0.0)).sum();
    let mut target = roll.clamp(0.0, 0.999_999_999) * total;
    for item in &weights {
        if item.weight <= 0.0 {
            continue;
        }
        target -= item.weight;
        if target < 0.0 {
            return item.tier;
        }
    }
    &balance.tiers[0]
}

pub fn stepped_upgrade_gain(balance: &Balance, tier_power: f64) -> f64 {
    let stepped = &balance.upgrade.stepped_gain;
    if tier_power >= stepped.singularity_threshold {
        stepped.singularity
    } else if tier_power >= stepped.rare_threshold {
        stepped.rare
    } else {
        stepped.standard
    }
}

fn gate_ramp_multiplier(wave: f64, min_wave: f64, ramp_waves: f64) -> f64 {
    if wave < min_wave {
        return 0.0;
    }
    if ramp_waves <= 0.0 {
        return 1.0;
    }
    ((wave - min_wave + 1.0) / ramp_waves).min(1.0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use voidline_data::load_default;

    fn balance() -> Balance {
        load_default().expect("balance.json").balance
    }

    #[test]
    fn wave_target_matches_ts_baseline() {
        let b = balance();
        assert_eq!(wave_target(&b, 1), 27);
        assert_eq!(wave_target(&b, 9), 83);
        assert_eq!(wave_target(&b, 10), 96);
        assert_eq!(wave_target(&b, 20), 243);
    }

    #[test]
    fn spawn_gap_matches_ts_baseline() {
        let b = balance();
        let g1 = spawn_gap(&b, 1);
        let g10 = spawn_gap(&b, 10);
        assert!((g1 - 0.385).abs() < 1e-9, "spawn_gap(1) = {g1}");
        assert!((g10 - 0.197).abs() < 1e-9, "spawn_gap(10) = {g10}");
        assert_eq!(spawn_gap(&b, 20), b.late_wave.spawn_gap_min);
    }

    #[test]
    fn spawn_pack_chance_matches_ts_baseline() {
        let b = balance();
        let p1 = spawn_pack_chance(&b, 1);
        let p10 = spawn_pack_chance(&b, 10);
        assert!((p1 - 0.12).abs() < 1e-9, "pack(1) = {p1}");
        assert!((p10 - 0.64).abs() < 1e-9, "pack(10) = {p10}");
    }

    #[test]
    fn enemy_stats_scale_correctly_at_late_boundary() {
        let b = balance();
        let scout = b.enemies.iter().find(|e| e.id == "scout").unwrap().clone();
        let stats = scaled_enemy_stats(&b, &scout, 10);
        assert!((stats.hp - 69.51).abs() < 1e-9, "hp = {}", stats.hp);
        assert!((stats.speed - 163.416).abs() < 1e-9, "speed = {}", stats.speed);
        assert!((stats.damage - 26.0).abs() < 1e-9, "damage = {}", stats.damage);
    }

    #[test]
    fn enemy_damage_unchanged_before_late_wave() {
        let b = balance();
        let scout = b.enemies.iter().find(|e| e.id == "scout").unwrap().clone();
        let stats = scaled_enemy_stats(&b, &scout, 9);
        assert_eq!(stats.damage, scout.damage);
    }

    #[test]
    fn singularity_unlocks_at_configured_gate() {
        let b = balance();
        let gate = b.upgrade.gates.singularity.min_wave as u32;
        let before = upgrade_tier_weights(&b, gate - 1, 0);
        let at_gate = upgrade_tier_weights(&b, gate, 0);
        assert_eq!(before[3].weight, 0.0);
        assert!(at_gate[3].weight > 0.0);
    }

    #[test]
    fn xp_to_next_level_strictly_increasing() {
        let b = balance();
        let mut prev = xp_to_next_level(&b, 1);
        for level in 2..=40 {
            let curr = xp_to_next_level(&b, level);
            assert!(curr > prev, "level {level}: prev={prev}, curr={curr}");
            prev = curr;
        }
    }

    #[test]
    fn rarity_probabilities_sum_to_one() {
        let b = balance();
        for &wave in &[1, 5, 10, 20, 40] {
            for rank in 0..=3 {
                let weights = upgrade_tier_weights(&b, wave, rank);
                let total: f64 = weights.iter().map(|w| w.weight.max(0.0)).sum();
                assert!(total > 0.0);
                let probs: f64 = weights.iter().map(|w| w.weight.max(0.0) / total).sum();
                assert!((probs - 1.0).abs() < 1e-9);
            }
        }
    }
}

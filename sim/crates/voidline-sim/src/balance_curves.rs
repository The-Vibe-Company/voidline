//! Pure functions ported from `src/game/balance.ts` and `balance-curves.ts`.
//!
//! All formulas mirror the TS reference exactly; floating-point results
//! match Node V8 to within IEEE-754 precision. Verified by comparing
//! known constants from `balance.test.ts`.

use voidline_data::balance::Balance;
use voidline_data::catalogs::EnemyType;

pub fn pressure_target(balance: &Balance, pressure: u32) -> i64 {
    let w = pressure as f64;
    let base = balance.pressure.target_base
        + w * balance.pressure.target_linear
        + w.powf(balance.pressure.target_exponent)
        + late_pressure_target_bonus(balance, pressure);
    (base * balance.enemy_density_multiplier).round() as i64
}

pub fn spawn_gap(balance: &Balance, pressure: u32) -> f64 {
    let late_pressure = late_pressure(balance, pressure) as f64;
    let min = if late_pressure > 0.0 {
        balance.late_pressure.spawn_gap_min
    } else {
        balance.pressure.spawn_gap_min
    };
    let raw = balance.pressure.spawn_gap_start
        - (pressure as f64) * balance.pressure.spawn_gap_per_pressure
        - late_pressure * balance.late_pressure.spawn_gap_per_pressure;
    (raw / balance.enemy_density_multiplier).max(min / balance.enemy_density_multiplier)
}

pub fn spawn_pack_chance(balance: &Balance, pressure: u32) -> f64 {
    let late_pressure = late_pressure(balance, pressure) as f64;
    let cap = if late_pressure > 0.0 {
        balance.late_pressure.pack_chance_max.min(
            balance.pressure.pack_chance_max
                + late_pressure * balance.late_pressure.pack_chance_per_pressure,
        )
    } else {
        balance.pressure.pack_chance_max
    };
    let value = (pressure as f64) * balance.pressure.pack_chance_per_pressure
        + late_pressure * balance.late_pressure.pack_chance_per_pressure;
    value.min(cap)
}

pub fn score_award(balance: &Balance, enemy_score: f64, pressure: u32) -> i64 {
    ((enemy_score * (1.25 + (pressure as f64) * 0.1)) / balance.enemy_density_multiplier)
        .round()
        .max(1.0) as i64
}

pub fn xp_to_next_level(balance: &Balance, level: u32) -> i64 {
    let l = level as f64;
    let raw = balance.xp.level_base
        + l * balance.xp.level_linear
        + l.powf(balance.xp.level_exponent) * balance.xp.level_exponent_scale;
    raw.round() as i64
}

pub fn experience_drop_total(balance: &Balance, enemy_score: f64, pressure: u32) -> i64 {
    let raw = (enemy_score / balance.xp.drop_score_divisor)
        * (1.0 + (pressure as f64) * balance.xp.drop_pressure_scale);
    (raw / balance.enemy_density_multiplier).round().max(1.0) as i64
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

pub fn late_pressure(balance: &Balance, pressure: u32) -> i64 {
    let p = (pressure as i64) - (balance.late_pressure.start_pressure as i64) + 1;
    p.max(0)
}

fn late_pressure_target_bonus(balance: &Balance, pressure: u32) -> f64 {
    let pressure = late_pressure(balance, pressure);
    if pressure <= 0 {
        return 0.0;
    }
    let p = pressure as f64;
    let raw = p * balance.late_pressure.target_linear
        + p.powf(balance.late_pressure.target_exponent)
            * balance.late_pressure.target_exponent_scale;
    raw.round()
}

#[derive(Debug, Clone, Copy)]
pub struct ScaledEnemyStats {
    pub hp: f64,
    pub speed: f64,
    pub damage: f64,
}

pub fn scaled_enemy_stats(balance: &Balance, ty: &EnemyType, pressure: u32) -> ScaledEnemyStats {
    let stats = scaled_elite_enemy_stats(balance, ty, pressure);
    ScaledEnemyStats {
        hp: stats.hp * balance.enemy.swarm_hp_scale,
        speed: stats.speed * balance.enemy.swarm_speed_scale,
        damage: stats.damage * balance.enemy.swarm_damage_scale,
    }
}

pub fn scaled_elite_enemy_stats(
    balance: &Balance,
    ty: &EnemyType,
    pressure: u32,
) -> ScaledEnemyStats {
    let w = pressure as f64;
    let late = late_pressure(balance, pressure) as f64;
    let speed_extra =
        (w * balance.enemy.speed_scale_per_pressure).min(balance.enemy.speed_scale_max);
    let speed_extra_late = (late * balance.late_pressure.speed_scale_per_pressure)
        .min(balance.late_pressure.speed_scale_max);
    let damage_extra = (late * balance.late_pressure.damage_scale_per_pressure)
        .min(balance.late_pressure.damage_scale_max);
    ScaledEnemyStats {
        hp: ty.hp
            * (1.0
                + w * balance.enemy.hp_scale_per_pressure
                + late * balance.late_pressure.hp_scale_per_pressure),
        speed: ty.speed * (1.0 + speed_extra + speed_extra_late),
        damage: ty.damage * (1.0 + damage_extra),
    }
}

#[derive(Debug, Clone)]
pub struct WeightedTier<'a> {
    pub tier: &'a voidline_data::catalogs::UpgradeTier,
    pub weight: f64,
}

pub fn upgrade_tier_weights<'a>(
    balance: &'a Balance,
    pressure: u32,
    rare_level: u32,
    prototype_level: u32,
    singularity_level: u32,
    max_tier_id: Option<&str>,
) -> Vec<WeightedTier<'a>> {
    let weights = &balance.upgrade.tier_weights;
    let gates = &balance.upgrade.gates;
    let per_rank = &weights.per_rank;
    let rare_level = rare_level.min(3);
    let prototype_level = prototype_level.min(3);
    let singularity_level = singularity_level.min(3);
    let rank = rare_level.max(prototype_level).max(singularity_level) as f64;
    let w = pressure as f64;
    let max_tier_index = max_tier_id
        .and_then(|id| balance.tiers.iter().position(|tier| tier.id == id))
        .unwrap_or_else(|| balance.tiers.len().saturating_sub(1));

    let proto_ramp = gate_ramp_multiplier(
        w,
        gates.prototype.min_pressure,
        gates.prototype.ramp_pressures,
    );
    let sing_ramp = gate_ramp_multiplier(
        w,
        gates.singularity.min_pressure,
        gates.singularity.ramp_pressures,
    );

    let rare_unlocked = rare_level > 0 && max_tier_index >= 1;
    let prototype_unlocked = prototype_level > 0 && max_tier_index >= 2;
    let singularity_unlocked = singularity_level > 0 && max_tier_index >= 3;

    vec![
        WeightedTier {
            tier: &balance.tiers[0],
            weight: weights.standard_min.max(
                weights.standard_base
                    - w * weights.standard_per_pressure
                    - rank * per_rank.standard_penalty,
            ),
        },
        WeightedTier {
            tier: &balance.tiers[1],
            weight: if rare_unlocked {
                weights.rare_base
                    + w * weights.rare_per_pressure
                    + rare_level as f64 * per_rank.rare
            } else {
                0.0
            },
        },
        WeightedTier {
            tier: &balance.tiers[2],
            weight: if !prototype_unlocked {
                0.0
            } else if proto_ramp > 0.0 {
                (weights.prototype_base
                    + w * weights.prototype_per_pressure
                    + prototype_level as f64 * per_rank.prototype)
                    * proto_ramp
            } else {
                gates.prototype.locked_weight
            },
        },
        WeightedTier {
            tier: &balance.tiers[3],
            weight: if !singularity_unlocked {
                0.0
            } else if sing_ramp > 0.0 {
                (w * weights.singularity_per_pressure
                    + singularity_level as f64 * per_rank.singularity)
                    * sing_ramp
            } else {
                gates.singularity.locked_weight
            },
        },
    ]
}

pub fn select_upgrade_tier<'a>(
    balance: &'a Balance,
    pressure: u32,
    roll: f64,
    rare_level: u32,
    prototype_level: u32,
    singularity_level: u32,
    max_tier_id: Option<&str>,
) -> &'a voidline_data::catalogs::UpgradeTier {
    let weights = upgrade_tier_weights(
        balance,
        pressure,
        rare_level,
        prototype_level,
        singularity_level,
        max_tier_id,
    );
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

fn gate_ramp_multiplier(pressure: f64, min_pressure: f64, ramp_pressures: f64) -> f64 {
    if pressure < min_pressure {
        return 0.0;
    }
    if ramp_pressures <= 0.0 {
        return 1.0;
    }
    ((pressure - min_pressure + 1.0) / ramp_pressures).min(1.0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use voidline_data::load_default;

    fn balance() -> Balance {
        load_default().expect("balance.json").balance
    }

    fn weights_for_rank<'a>(b: &'a Balance, pressure: u32, rank: u32) -> Vec<WeightedTier<'a>> {
        upgrade_tier_weights(
            b,
            pressure,
            if rank >= 1 { rank } else { 0 },
            if rank >= 2 { rank } else { 0 },
            if rank >= 3 { rank } else { 0 },
            None,
        )
    }

    #[test]
    fn pressure_target_matches_ts_baseline() {
        let b = balance();
        assert_eq!(pressure_target(&b, 1), 81);
        assert_eq!(pressure_target(&b, 9), 308);
        assert_eq!(pressure_target(&b, 10), 351);
    }

    #[test]
    fn spawn_gap_matches_ts_baseline() {
        let b = balance();
        let g1 = spawn_gap(&b, 1);
        let g10 = spawn_gap(&b, 10);
        assert!(
            (g1 - 0.12833333333333333).abs() < 1e-9,
            "spawn_gap(1) = {g1}"
        );
        assert!(
            (g10 - 0.05766666666666667).abs() < 1e-9,
            "spawn_gap(10) = {g10}"
        );
        assert_eq!(
            spawn_gap(&b, 40),
            b.late_pressure.spawn_gap_min / b.enemy_density_multiplier,
        );
    }

    #[test]
    fn spawn_pack_chance_matches_ts_baseline() {
        let b = balance();
        let p1 = spawn_pack_chance(&b, 1);
        let p10 = spawn_pack_chance(&b, 10);
        assert!((p1 - 0.12).abs() < 1e-9, "pack(1) = {p1}");
        assert!((p10 - 0.7).abs() < 1e-9, "pack(10) = {p10}");
    }

    #[test]
    fn enemy_stats_scale_correctly_at_late_boundary() {
        let b = balance();
        let scout = b.enemies.iter().find(|e| e.id == "scout").unwrap().clone();
        let stats = scaled_enemy_stats(&b, &scout, 10);
        assert!((stats.hp - 19.635).abs() < 1e-9, "hp = {}", stats.hp);
        assert!(
            (stats.speed - 156.90048).abs() < 1e-9,
            "speed = {}",
            stats.speed
        );
        assert!(
            (stats.damage - 7.83).abs() < 1e-9,
            "damage = {}",
            stats.damage
        );
    }

    #[test]
    fn enemy_damage_unchanged_before_late_pressure() {
        let b = balance();
        let scout = b.enemies.iter().find(|e| e.id == "scout").unwrap().clone();
        let stats = scaled_enemy_stats(&b, &scout, 4);
        assert_eq!(stats.damage, scout.damage * b.enemy.swarm_damage_scale);
    }

    #[test]
    fn singularity_unlocks_at_configured_gate() {
        let b = balance();
        let gate = b.upgrade.gates.singularity.min_pressure as u32;
        let rank = b.upgrade.gates.singularity.min_rank;
        let before = weights_for_rank(&b, gate - 1, rank);
        let at_gate = weights_for_rank(&b, gate, rank);
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
        for &pressure in &[1, 5, 10, 20, 40] {
            for rank in 0..=3 {
                let weights = weights_for_rank(&b, pressure, rank);
                let total: f64 = weights.iter().map(|w| w.weight.max(0.0)).sum();
                assert!(total > 0.0);
                let probs: f64 = weights.iter().map(|w| w.weight.max(0.0) / total).sum();
                assert!((probs - 1.0).abs() < 1e-9);
            }
        }
    }

    fn tier_weight(weights: &[WeightedTier], id: &str) -> f64 {
        weights.iter().find(|t| t.tier.id == id).unwrap().weight
    }

    #[test]
    fn max_tier_cap_blocks_card_locked_tiers() {
        let b = balance();
        let weights = upgrade_tier_weights(&b, 20, 3, 3, 3, Some("rare"));

        assert!(tier_weight(&weights, "rare") > 0.0);
        assert_eq!(tier_weight(&weights, "prototype"), 0.0);
        assert_eq!(tier_weight(&weights, "singularity"), 0.0);
    }

    #[test]
    fn prototype_locked_until_gate() {
        let b = balance();
        let gate = b.upgrade.gates.prototype.min_pressure as u32;
        let min_rank = b.upgrade.gates.prototype.min_rank;
        for w in 1..gate {
            let weights = weights_for_rank(&b, w, min_rank);
            assert_eq!(
                tier_weight(&weights, "prototype"),
                b.upgrade.gates.prototype.locked_weight,
                "prototype must show locked weight before gate (pressure {w})",
            );
        }
        for rank in min_rank..=3 {
            let weights = weights_for_rank(&b, gate, rank);
            assert!(
                tier_weight(&weights, "prototype") > 0.0,
                "prototype must unlock at its gate (rank {rank})",
            );
        }
    }

    #[test]
    fn higher_tiers_locked_below_min_rank() {
        let b = balance();
        for pressure in 1..=40 {
            for rank in 0..=3 {
                let weights = weights_for_rank(&b, pressure, rank);
                if rank < b.upgrade.gates.rare.min_rank {
                    assert_eq!(
                        tier_weight(&weights, "rare"),
                        0.0,
                        "rare must be 0 below its min_rank (pressure={pressure}, rank={rank})",
                    );
                }
                if rank < b.upgrade.gates.prototype.min_rank {
                    assert_eq!(
                        tier_weight(&weights, "prototype"),
                        0.0,
                        "prototype must be 0 below its min_rank (pressure={pressure}, rank={rank})",
                    );
                }
                if rank < b.upgrade.gates.singularity.min_rank {
                    assert_eq!(
                        tier_weight(&weights, "singularity"),
                        0.0,
                        "singularity must be 0 below its min_rank (pressure={pressure}, rank={rank})",
                    );
                }
            }
        }
    }

    #[test]
    fn rank_zero_yields_only_standard() {
        let b = balance();
        for pressure in 1..=40 {
            let weights = weights_for_rank(&b, pressure, 0);
            assert!(tier_weight(&weights, "standard") > 0.0);
            assert_eq!(tier_weight(&weights, "rare"), 0.0);
            assert_eq!(tier_weight(&weights, "prototype"), 0.0);
            assert_eq!(tier_weight(&weights, "singularity"), 0.0);
        }
    }

    #[test]
    fn singularity_locked_until_gate_for_all_ranks() {
        let b = balance();
        let gate = b.upgrade.gates.singularity.min_pressure as u32;
        for w in 1..gate {
            for rank in 0..=3 {
                let weights = weights_for_rank(&b, w, rank);
                assert_eq!(
                    tier_weight(&weights, "singularity"),
                    0.0,
                    "singularity must remain 0 before gate (pressure {w}, rank {rank})",
                );
            }
        }
    }

    #[test]
    fn gate_ramp_smooths_introduction() {
        let b = balance();
        let proto_gate = b.upgrade.gates.prototype.min_pressure as u32;
        let ramp = b.upgrade.gates.prototype.ramp_pressures;
        let rank = b.upgrade.gates.prototype.min_rank;
        if ramp > 0.0 {
            let at_gate = tier_weight(&weights_for_rank(&b, proto_gate, rank), "prototype");
            let after_ramp = tier_weight(
                &weights_for_rank(&b, proto_gate + ramp as u32 + 2, rank),
                "prototype",
            );
            assert!(at_gate > 0.0);
            assert!(
                after_ramp > at_gate,
                "prototype weight must keep growing past the ramp window",
            );
        }
    }

    #[test]
    fn higher_rank_increases_rare_and_decreases_standard() {
        let b = balance();
        for &pressure in &[1, 5, 10, 15] {
            let r0 = weights_for_rank(&b, pressure, 0);
            let r3 = weights_for_rank(&b, pressure, 3);
            assert!(
                tier_weight(&r3, "rare") >= tier_weight(&r0, "rare"),
                "rare weight must grow with rarity rank (pressure {pressure})",
            );
            assert!(
                tier_weight(&r3, "standard") <= tier_weight(&r0, "standard"),
                "standard weight must shrink with rarity rank (pressure {pressure})",
            );
        }
    }

    #[test]
    fn standard_tier_respects_minimum_floor() {
        let b = balance();
        let floor = b.upgrade.tier_weights.standard_min;
        for pressure in 1..=80 {
            for rank in 0..=3 {
                let weights = weights_for_rank(&b, pressure, rank);
                assert!(
                    tier_weight(&weights, "standard") >= floor - 1e-9,
                    "standard floor breached: pressure={pressure} rank={rank}",
                );
            }
        }
    }

    #[test]
    fn rarity_weights_never_negative() {
        let b = balance();
        for pressure in 1..=80 {
            for rank in 0..=3 {
                for entry in weights_for_rank(&b, pressure, rank) {
                    assert!(
                        entry.weight >= 0.0,
                        "negative weight at pressure={pressure} rank={rank} tier={}",
                        entry.tier.id,
                    );
                }
            }
        }
    }

    #[test]
    fn singularity_zero_at_phase1_unranked() {
        // Phase 1 boss = pressure 10. A fresh player (rank 0) must never see singularity.
        let b = balance();
        let weights = weights_for_rank(&b, 10, 0);
        assert_eq!(
            tier_weight(&weights, "singularity"),
            0.0,
            "singularity must be hard-gated at rank 0",
        );
    }

    #[test]
    fn enemy_hp_strictly_increases_per_pressure() {
        let b = balance();
        for kind in ["scout", "hunter", "brute"] {
            let ty = b.enemies.iter().find(|e| e.id == kind).unwrap().clone();
            let mut prev = scaled_enemy_stats(&b, &ty, 1).hp;
            for pressure in 2..=30 {
                let curr = scaled_enemy_stats(&b, &ty, pressure).hp;
                assert!(
                    curr > prev,
                    "hp must strictly grow ({kind}, pressure {pressure})"
                );
                prev = curr;
            }
        }
    }

    #[test]
    fn enemy_speed_caps_at_combined_max() {
        let b = balance();
        for kind in ["scout", "hunter", "brute"] {
            let ty = b.enemies.iter().find(|e| e.id == kind).unwrap().clone();
            let cap_factor = 1.0 + b.enemy.speed_scale_max + b.late_pressure.speed_scale_max;
            let speed_far = scaled_enemy_stats(&b, &ty, 200).speed;
            assert!(
                speed_far <= ty.speed * cap_factor + 1e-9,
                "speed must respect cap ({kind})",
            );
        }
    }

    #[test]
    fn enemy_damage_caps_at_late_max() {
        let b = balance();
        let scout = b.enemies.iter().find(|e| e.id == "scout").unwrap().clone();
        let cap_factor = 1.0 + b.late_pressure.damage_scale_max;
        let damage_far = scaled_enemy_stats(&b, &scout, 200).damage;
        assert!(
            (damage_far - scout.damage * cap_factor * b.enemy.swarm_damage_scale).abs() < 1e-9,
            "damage cap not respected at far pressure",
        );
    }

    #[test]
    fn enemy_damage_steps_up_exactly_at_late_pressure_boundary() {
        let b = balance();
        let scout = b.enemies.iter().find(|e| e.id == "scout").unwrap().clone();
        let start = b.late_pressure.start_pressure as u32;
        let before = scaled_enemy_stats(&b, &scout, start - 1).damage;
        let at = scaled_enemy_stats(&b, &scout, start).damage;
        assert_eq!(
            before,
            scout.damage * b.enemy.swarm_damage_scale,
            "damage must be base swarm damage before late pressure"
        );
        assert!(at > before, "damage must lift at start_pressure");
    }

    #[test]
    fn miniboss_starts_at_configured_pressure() {
        let b = balance();
        let start = b.bosses.mini_boss.start_pressure as u32;
        assert!(start >= 4, "miniBoss start pressure should be at least 4");
    }

    #[test]
    fn boss_hp_strictly_above_miniboss_strictly_above_scout() {
        let b = balance();
        let scout = b.enemies.iter().find(|e| e.id == "scout").unwrap();
        let scout_hp = scout.hp;
        let mini = scout_hp * b.bosses.mini_boss.hp_multiplier;
        let boss = scout_hp * b.bosses.boss.hp_multiplier;
        assert!(boss > mini && mini > scout_hp);
    }

    #[test]
    fn upgrade_tiers_strictly_increase_in_power() {
        let b = balance();
        let mut prev = b.tiers[0].power;
        for tier in b.tiers.iter().skip(1) {
            assert!(tier.power > prev, "tier power must be strictly increasing");
            prev = tier.power;
        }
    }

    #[test]
    fn singularity_threshold_classifies_singularity_only() {
        let b = balance();
        let stepped = &b.upgrade.stepped_gain;
        for tier in b.tiers.iter() {
            let is_sing = tier.power >= stepped.singularity_threshold;
            assert_eq!(
                is_sing,
                tier.id == "singularity",
                "stepped_gain.singularity_threshold should classify only the singularity tier",
            );
        }
    }

    #[test]
    fn rare_threshold_classifies_rare_and_above() {
        let b = balance();
        let stepped = &b.upgrade.stepped_gain;
        for tier in b.tiers.iter() {
            let is_rare_or_better = tier.power >= stepped.rare_threshold;
            let expected = matches!(tier.id.as_str(), "rare" | "prototype" | "singularity");
            assert_eq!(
                is_rare_or_better, expected,
                "rare_threshold should classify rare/proto/sing only ({})",
                tier.id,
            );
        }
    }

    #[test]
    fn drone_extra_threshold_classifies_high_tiers() {
        let b = balance();
        let threshold = b.upgrade.effects.drone_extra_threshold;
        for tier in b.tiers.iter() {
            let gives_extra = tier.power >= threshold;
            let expected = matches!(tier.id.as_str(), "prototype" | "singularity");
            assert_eq!(
                gives_extra, expected,
                "drone_extra_threshold misclassifies tier {}",
                tier.id,
            );
        }
    }

    #[test]
    fn caps_are_finite_and_positive() {
        let b = balance();
        for (name, value) in [
            ("drones", b.upgrade.caps.drones),
            ("projectiles", b.upgrade.caps.projectiles),
            ("pierce", b.upgrade.caps.pierce),
            ("crit_chance", b.upgrade.caps.crit_chance),
            ("fire_rate_mul", b.upgrade.caps.fire_rate_mul),
            ("damage_mul", b.upgrade.caps.damage_mul),
        ] {
            assert!(value.is_finite() && value > 0.0, "cap {name} = {value}");
        }
    }

    #[test]
    fn fire_rate_cap_below_legacy_uncapped_max() {
        // Pre-calibration: 5× Singularity at 0.22 each = +308% fire rate. New cap forbids that.
        let b = balance();
        assert!(
            b.upgrade.caps.fire_rate_mul < 3.0,
            "fire_rate_mul must constrain stacking below 3.0× bonus",
        );
    }

    #[test]
    fn damage_cap_below_legacy_uncapped_max() {
        let b = balance();
        assert!(
            b.upgrade.caps.damage_mul < 3.6,
            "damage_mul must constrain stacking below 3.6× bonus",
        );
    }

    #[test]
    fn per_rank_weights_are_non_negative() {
        let b = balance();
        let pr = &b.upgrade.tier_weights.per_rank;
        for (n, v) in [
            ("standard_penalty", pr.standard_penalty),
            ("rare", pr.rare),
            ("prototype", pr.prototype),
            ("singularity", pr.singularity),
        ] {
            assert!(v >= 0.0, "per_rank.{n} = {v}");
        }
    }

    #[test]
    fn synergy_damage_multipliers_are_calibrated() {
        let b = balance();
        // Pre-calibration: kineticRam vs_damage was 1.8, magnetStorm was 2.15 — both reduced.
        assert!(
            b.synergies.kinetic_ram.damage.vs_damage <= 1.6,
            "kineticRam.vs_damage must stay ≤1.6 (was 1.8 pre-calibration)",
        );
        assert!(
            b.synergies.magnet_storm.damage.vs_damage <= 1.8,
            "magnetStorm.vs_damage must stay ≤1.8 (was 2.15 pre-calibration)",
        );
    }

    #[test]
    fn xp_to_next_level_scales_super_linearly() {
        let b = balance();
        // diff(level) should grow, signalling exponential ramp.
        let diff = |n| xp_to_next_level(&b, n + 1) - xp_to_next_level(&b, n);
        let early = diff(2);
        let mid = diff(15);
        let late = diff(30);
        assert!(mid > early, "mid diff must exceed early diff");
        assert!(late > mid, "late diff must exceed mid diff");
    }

    #[test]
    fn experience_drop_grows_with_pressure() {
        let b = balance();
        let scout = b.enemies.iter().find(|e| e.id == "scout").unwrap();
        let early = experience_drop_total(&b, scout.score, 1);
        let late = experience_drop_total(&b, scout.score, 25);
        assert!(late > early);
    }

    #[test]
    fn score_award_grows_with_pressure() {
        let b = balance();
        let mut prev = score_award(&b, 35.0, 1);
        for pressure in 2..=30 {
            let curr = score_award(&b, 35.0, pressure);
            assert!(curr >= prev, "score_award must grow with pressure",);
            prev = curr;
        }
        assert!(score_award(&b, 35.0, 30) > score_award(&b, 35.0, 1));
    }

    #[test]
    fn spawn_gap_monotonically_decreases() {
        let b = balance();
        let mut prev = spawn_gap(&b, 1);
        for pressure in 2..=40 {
            let curr = spawn_gap(&b, pressure);
            assert!(
                curr <= prev + 1e-12,
                "spawn_gap must not grow (pressure {pressure}: {curr} > {prev})",
            );
            prev = curr;
        }
    }

    #[test]
    fn spawn_pack_chance_monotonically_grows() {
        let b = balance();
        let mut prev = spawn_pack_chance(&b, 1);
        for pressure in 2..=40 {
            let curr = spawn_pack_chance(&b, pressure);
            assert!(
                curr >= prev - 1e-12,
                "spawn_pack_chance must not shrink (pressure {pressure})",
            );
            prev = curr;
        }
    }

    #[test]
    fn shard_counts_present_for_every_enemy_kind() {
        let b = balance();
        for kind in ["scout", "hunter", "brute"] {
            let count = experience_shard_count(&b, kind);
            assert!(count > 0, "shard count missing for {kind}");
        }
    }

    #[test]
    fn experience_orb_radius_caps() {
        let b = balance();
        let huge = experience_orb_radius(&b, 9999.0);
        let max = b.xp.orb_radius_base + b.xp.orb_radius_bonus_max;
        assert!((huge - max).abs() < 1e-9);
    }

    #[test]
    fn boss_speed_strictly_below_scout_speed() {
        // Boss is meant to be slow but tanky; speedMultiplier <1 enforces that.
        let b = balance();
        let scout = b.enemies.iter().find(|e| e.id == "scout").unwrap();
        let boss_speed_w10 = scout.speed * b.bosses.boss.speed_multiplier;
        assert!(
            boss_speed_w10 < scout.speed,
            "boss must be slower than its scout reference",
        );
    }
}

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
        balance.late_wave.pack_chance_max.min(
            balance.wave.pack_chance_max + late_pressure * balance.late_wave.pack_chance_per_wave,
        )
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
    let speed_extra_late =
        (late * balance.late_wave.speed_scale_per_wave).min(balance.late_wave.speed_scale_max);
    let damage_extra =
        (late * balance.late_wave.damage_scale_per_wave).min(balance.late_wave.damage_scale_max);
    ScaledEnemyStats {
        hp: ty.hp
            * (1.0
                + w * balance.enemy.hp_scale_per_wave
                + late * balance.late_wave.hp_scale_per_wave),
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
    wave: u32,
    rarity_rank: u32,
) -> Vec<WeightedTier<'a>> {
    let weights = &balance.upgrade.tier_weights;
    let gates = &balance.upgrade.gates;
    let per_rank = &weights.per_rank;
    let rank = rarity_rank.min(3) as f64;
    let w = wave as f64;

    let proto_ramp = gate_ramp_multiplier(w, gates.prototype.min_wave, gates.prototype.ramp_waves);
    let sing_ramp =
        gate_ramp_multiplier(w, gates.singularity.min_wave, gates.singularity.ramp_waves);

    vec![
        WeightedTier {
            tier: &balance.tiers[0],
            weight: weights.standard_min.max(
                weights.standard_base
                    - w * weights.standard_per_wave
                    - rank * per_rank.standard_penalty,
            ),
        },
        WeightedTier {
            tier: &balance.tiers[1],
            weight: weights.rare_base + w * weights.rare_per_wave + rank * per_rank.rare,
        },
        WeightedTier {
            tier: &balance.tiers[2],
            weight: if proto_ramp > 0.0 {
                (weights.prototype_base
                    + w * weights.prototype_per_wave
                    + rank * per_rank.prototype)
                    * proto_ramp
            } else {
                gates.prototype.locked_weight
            },
        },
        WeightedTier {
            tier: &balance.tiers[3],
            weight: if sing_ramp > 0.0 {
                (w * weights.singularity_per_wave + rank * per_rank.singularity) * sing_ramp
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
        assert_eq!(wave_target(&b, 9), 103);
        assert_eq!(wave_target(&b, 10), 117);
    }

    #[test]
    fn spawn_gap_matches_ts_baseline() {
        let b = balance();
        let g1 = spawn_gap(&b, 1);
        let g10 = spawn_gap(&b, 10);
        assert!((g1 - 0.385).abs() < 1e-9, "spawn_gap(1) = {g1}");
        assert!((g10 - 0.173).abs() < 1e-9, "spawn_gap(10) = {g10}");
        assert_eq!(spawn_gap(&b, 40), b.late_wave.spawn_gap_min);
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
        assert!((stats.hp - 78.54).abs() < 1e-9, "hp = {}", stats.hp);
        assert!(
            (stats.speed - 170.544).abs() < 1e-9,
            "speed = {}",
            stats.speed
        );
        assert!(
            (stats.damage - 29.0).abs() < 1e-9,
            "damage = {}",
            stats.damage
        );
    }

    #[test]
    fn enemy_damage_unchanged_before_late_wave() {
        let b = balance();
        let scout = b.enemies.iter().find(|e| e.id == "scout").unwrap().clone();
        let stats = scaled_enemy_stats(&b, &scout, 4);
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

    fn tier_weight(weights: &[WeightedTier], id: &str) -> f64 {
        weights.iter().find(|t| t.tier.id == id).unwrap().weight
    }

    #[test]
    fn prototype_locked_until_gate() {
        let b = balance();
        let gate = b.upgrade.gates.prototype.min_wave as u32;
        for w in 1..gate {
            let weights = upgrade_tier_weights(&b, w, 0);
            assert_eq!(
                tier_weight(&weights, "prototype"),
                b.upgrade.gates.prototype.locked_weight,
                "prototype must show locked weight before gate (wave {w})",
            );
        }
        for rank in 0..=3 {
            let weights = upgrade_tier_weights(&b, gate, rank);
            assert!(
                tier_weight(&weights, "prototype") > 0.0,
                "prototype must unlock at its gate (rank {rank})",
            );
        }
    }

    #[test]
    fn singularity_locked_until_gate_for_all_ranks() {
        let b = balance();
        let gate = b.upgrade.gates.singularity.min_wave as u32;
        for w in 1..gate {
            for rank in 0..=3 {
                let weights = upgrade_tier_weights(&b, w, rank);
                assert_eq!(
                    tier_weight(&weights, "singularity"),
                    0.0,
                    "singularity must remain 0 before gate (wave {w}, rank {rank})",
                );
            }
        }
    }

    #[test]
    fn gate_ramp_smooths_introduction() {
        let b = balance();
        let proto_gate = b.upgrade.gates.prototype.min_wave as u32;
        let ramp = b.upgrade.gates.prototype.ramp_waves;
        if ramp > 0.0 {
            let at_gate = tier_weight(&upgrade_tier_weights(&b, proto_gate, 0), "prototype");
            let after_ramp = tier_weight(
                &upgrade_tier_weights(&b, proto_gate + ramp as u32 + 2, 0),
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
        for &wave in &[1, 5, 10, 15] {
            let r0 = upgrade_tier_weights(&b, wave, 0);
            let r3 = upgrade_tier_weights(&b, wave, 3);
            assert!(
                tier_weight(&r3, "rare") >= tier_weight(&r0, "rare"),
                "rare weight must grow with rarity rank (wave {wave})",
            );
            assert!(
                tier_weight(&r3, "standard") <= tier_weight(&r0, "standard"),
                "standard weight must shrink with rarity rank (wave {wave})",
            );
        }
    }

    #[test]
    fn standard_tier_respects_minimum_floor() {
        let b = balance();
        let floor = b.upgrade.tier_weights.standard_min;
        for wave in 1..=80 {
            for rank in 0..=3 {
                let weights = upgrade_tier_weights(&b, wave, rank);
                assert!(
                    tier_weight(&weights, "standard") >= floor - 1e-9,
                    "standard floor breached: wave={wave} rank={rank}",
                );
            }
        }
    }

    #[test]
    fn rarity_weights_never_negative() {
        let b = balance();
        for wave in 1..=80 {
            for rank in 0..=3 {
                for entry in upgrade_tier_weights(&b, wave, rank) {
                    assert!(
                        entry.weight >= 0.0,
                        "negative weight at wave={wave} rank={rank} tier={}",
                        entry.tier.id,
                    );
                }
            }
        }
    }

    #[test]
    fn singularity_share_below_8pct_at_phase1_unranked() {
        // Phase 1 boss = wave 10 boss. Fresh player (rank 0) should rarely see singularity.
        let b = balance();
        let weights = upgrade_tier_weights(&b, 10, 0);
        let total: f64 = weights.iter().map(|w| w.weight.max(0.0)).sum();
        let sing = tier_weight(&weights, "singularity") / total;
        assert!(
            sing < 0.08,
            "singularity probability at wave 10 / rank 0 = {sing}, expected <8%",
        );
    }

    #[test]
    fn enemy_hp_strictly_increases_per_wave() {
        let b = balance();
        for kind in ["scout", "hunter", "brute"] {
            let ty = b.enemies.iter().find(|e| e.id == kind).unwrap().clone();
            let mut prev = scaled_enemy_stats(&b, &ty, 1).hp;
            for wave in 2..=30 {
                let curr = scaled_enemy_stats(&b, &ty, wave).hp;
                assert!(curr > prev, "hp must strictly grow ({kind}, wave {wave})");
                prev = curr;
            }
        }
    }

    #[test]
    fn enemy_speed_caps_at_combined_max() {
        let b = balance();
        for kind in ["scout", "hunter", "brute"] {
            let ty = b.enemies.iter().find(|e| e.id == kind).unwrap().clone();
            let cap_factor = 1.0 + b.enemy.speed_scale_max + b.late_wave.speed_scale_max;
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
        let cap_factor = 1.0 + b.late_wave.damage_scale_max;
        let damage_far = scaled_enemy_stats(&b, &scout, 200).damage;
        assert!(
            (damage_far - scout.damage * cap_factor).abs() < 1e-9,
            "damage cap not respected at far wave",
        );
    }

    #[test]
    fn enemy_damage_steps_up_exactly_at_late_wave_boundary() {
        let b = balance();
        let scout = b.enemies.iter().find(|e| e.id == "scout").unwrap().clone();
        let start = b.late_wave.start_wave as u32;
        let before = scaled_enemy_stats(&b, &scout, start - 1).damage;
        let at = scaled_enemy_stats(&b, &scout, start).damage;
        assert_eq!(before, scout.damage, "damage must be base before late wave");
        assert!(at > scout.damage, "damage must lift at start_wave");
    }

    #[test]
    fn miniboss_starts_at_configured_wave() {
        let b = balance();
        let start = b.bosses.mini_boss.start_wave as u32;
        assert!(start >= 4, "miniBoss start wave should be at least 4");
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
    fn experience_drop_grows_with_wave() {
        let b = balance();
        let scout = b.enemies.iter().find(|e| e.id == "scout").unwrap();
        let early = experience_drop_total(&b, scout.score, 1);
        let late = experience_drop_total(&b, scout.score, 25);
        assert!(late > early);
    }

    #[test]
    fn score_award_grows_with_wave() {
        for wave in 2..=30 {
            assert!(
                score_award(35.0, wave) > score_award(35.0, wave - 1),
                "score_award must grow with wave",
            );
        }
    }

    #[test]
    fn spawn_gap_monotonically_decreases() {
        let b = balance();
        let mut prev = spawn_gap(&b, 1);
        for wave in 2..=40 {
            let curr = spawn_gap(&b, wave);
            assert!(
                curr <= prev + 1e-12,
                "spawn_gap must not grow (wave {wave}: {curr} > {prev})",
            );
            prev = curr;
        }
    }

    #[test]
    fn spawn_pack_chance_monotonically_grows() {
        let b = balance();
        let mut prev = spawn_pack_chance(&b, 1);
        for wave in 2..=40 {
            let curr = spawn_pack_chance(&b, wave);
            assert!(
                curr >= prev - 1e-12,
                "spawn_pack_chance must not shrink (wave {wave})",
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

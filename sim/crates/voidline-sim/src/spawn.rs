//! Enemy spawning logic owned by the Rust runtime engine.

use voidline_data::balance::Balance;
use voidline_data::catalogs::{BossDef, BossStats, EnemySpawnPolicy, EnemyType, ResidualMarker};

use crate::balance_curves::{scaled_elite_enemy_stats, scaled_enemy_stats};
use crate::entities::{Enemy, EnemyKind, EnemyRole};
use crate::math::clamp;
use crate::pools::{acquire_enemy, EntityPools};
use crate::state::EntityCounters;
use crate::world::World;

#[derive(Debug, Clone)]
pub struct WeightedEnemyType<'a> {
    pub ty: &'a EnemyType,
    pub weight: f64,
}

fn apply_spawn_rule(rule: &voidline_data::catalogs::EnemySpawnRule, pressure: u32) -> f64 {
    let w = pressure as f64;
    let raw = rule.base_chance + (w - rule.pressure_onset).max(0.0) * rule.per_pressure;
    rule.max_chance.min(raw.max(0.0))
}

pub fn enemy_type_weights<'a>(
    balance: &'a Balance,
    spawn_rules: &voidline_data::catalogs::EnemySpawnRules,
    pressure: u32,
) -> Vec<WeightedEnemyType<'a>> {
    let mut result = Vec::new();
    let mut residual: Option<&EnemyType> = None;
    let mut non_residual_sum = 0.0;

    for ty in &balance.enemies {
        let policy = spawn_rules
            .get(&ty.id)
            .expect("spawn policy for enemy kind");
        match policy {
            EnemySpawnPolicy::Residual(ResidualMarker::Residual) => {
                residual = Some(ty);
            }
            EnemySpawnPolicy::Rule(rule) => {
                let weight = apply_spawn_rule(rule, pressure);
                result.push(WeightedEnemyType { ty, weight });
                non_residual_sum += weight;
            }
        }
    }

    if let Some(ty) = residual {
        result.push(WeightedEnemyType {
            ty,
            weight: (1.0 - non_residual_sum).max(0.0),
        });
    }

    result
}

pub fn select_enemy_type<'a>(
    balance: &'a Balance,
    spawn_rules: &voidline_data::catalogs::EnemySpawnRules,
    pressure: u32,
    roll: f64,
) -> &'a EnemyType {
    let weights = enemy_type_weights(balance, spawn_rules, pressure);
    let total: f64 = weights.iter().map(|w| w.weight.max(0.0)).sum();
    let mut target = roll.clamp(0.0, 0.999_999_999) * total;
    for item in &weights {
        if item.weight <= 0.0 {
            continue;
        }
        target -= item.weight;
        if target < 0.0 {
            return item.ty;
        }
    }
    weights.last().expect("at least one weighted enemy").ty
}

pub fn spawn_point_for_radius(world: &World, radius: f64, rolls: [f64; 3]) -> (f64, f64) {
    let side = (rolls[0] * 4.0).floor() as u32;
    let pad = (radius + 48.0).max(70.0);
    let view_left = world.camera_x;
    let view_top = world.camera_y;
    let mut x = view_left + rolls[1] * world.width;
    let mut y = view_top + rolls[2] * world.height;

    match side {
        0 => x = view_left - pad,
        1 => x = view_left + world.width + pad,
        2 => y = view_top - pad,
        _ => y = view_top + world.height + pad,
    }

    x = clamp(x, pad, world.arena_width - pad);
    y = clamp(y, pad, world.arena_height - pad);
    (x, y)
}

pub fn enemy_kind_from_id(id: &str) -> EnemyKind {
    EnemyKind::from_str(id).unwrap_or_else(|| panic!("unknown enemy kind: {id}"))
}

pub fn spawn_enemy(
    balance: &Balance,
    spawn_rules: &voidline_data::catalogs::EnemySpawnRules,
    pools: &mut EntityPools,
    counters: &mut EntityCounters,
    enemies: &mut Vec<Enemy>,
    world: &World,
    pressure: u32,
    rolls: SpawnRolls,
) {
    let ty = select_enemy_type(balance, spawn_rules, pressure, rolls.kind_roll);
    let (x, y) = spawn_point_for_radius(world, ty.radius, rolls.position_rolls);
    let scaled = scaled_enemy_stats(balance, ty, pressure);
    let idx = acquire_enemy(
        pools,
        counters,
        enemies,
        enemy_kind_from_id(&ty.id),
        ty.score,
        ty.radius,
        scaled.damage,
        ty.sides,
    );
    let enemy = &mut enemies[idx];
    enemy.x = x;
    enemy.y = y;
    enemy.hp = scaled.hp;
    enemy.max_hp = scaled.hp;
    enemy.speed = scaled.speed;
    enemy.damage = scaled.damage;
    enemy.age = 0.0;
    enemy.seed = rolls.seed_roll * 100.0;
    enemy.wobble = wobble_for(&balance.enemy.wobble, &ty.id);
    enemy.wobble_rate =
        balance.enemy.wobble.rate_base + rolls.wobble_roll * balance.enemy.wobble.rate_random;
    enemy.hit = 0.0;
    enemy.role = EnemyRole::Normal;
}

pub fn spawn_elite(
    balance: &Balance,
    pools: &mut EntityPools,
    counters: &mut EntityCounters,
    enemies: &mut Vec<Enemy>,
    world: &World,
    pressure: u32,
    stage: u32,
    ty: &EnemyType,
    boss: &BossDef,
    rolls: SpawnRolls,
) {
    let tuning = boss_stats_at(balance, &boss.stats, stage);
    let radius = (ty.radius * tuning.radius_multiplier).round();
    let (x, y) = spawn_point_for_radius(world, radius, rolls.position_rolls);
    let scaled = scaled_elite_enemy_stats(balance, ty, pressure);
    let idx = acquire_enemy(
        pools,
        counters,
        enemies,
        enemy_kind_from_id(&ty.id),
        (ty.score * tuning.score_multiplier).round(),
        radius,
        scaled.damage * tuning.damage_multiplier,
        tuning.sides,
    );
    let enemy = &mut enemies[idx];
    enemy.score = (ty.score * tuning.score_multiplier).round();
    enemy.x = x;
    enemy.y = y;
    enemy.hp = scaled.hp * tuning.hp_multiplier;
    enemy.max_hp = enemy.hp;
    enemy.speed = scaled.speed * tuning.speed_multiplier;
    enemy.radius = radius;
    enemy.damage = scaled.damage * tuning.damage_multiplier;
    enemy.sides = tuning.sides;
    enemy.age = 0.0;
    enemy.seed = rolls.seed_roll * 100.0;
    enemy.wobble = tuning.wobble;
    enemy.wobble_rate = tuning.wobble_rate;
    enemy.hit = 0.0;
    enemy.role = match boss.role.as_str() {
        "boss" => EnemyRole::Boss,
        "mini-boss" => EnemyRole::MiniBoss,
        _ => EnemyRole::Normal,
    };
    enemy.contact_timer = 0.0;
    enemy.contact_cooldown = tuning.contact_cooldown;
}

fn wobble_for(wobble: &voidline_data::balance::EnemyWobble, kind: &str) -> f64 {
    match kind {
        "scout" => wobble.scout,
        "hunter" => wobble.hunter,
        "brute" => wobble.brute,
        _ => 0.0,
    }
}

pub fn boss_stats_at(balance: &Balance, stats: &BossStats, stage: u32) -> BossStats {
    let stage_offset = stage.saturating_sub(1) as f64;
    let scaling = &balance.bosses.stage_scaling;
    let hp_offset = boss_stage_hp_scale_offset(
        stage_offset,
        scaling.post_stage2_hp_offset_base,
        scaling.post_stage2_hp_offset_per_stage,
    );
    BossStats {
        hp_multiplier: stats.hp_multiplier * (1.0 + scaling.hp_per_stage * hp_offset),
        speed_multiplier: stats.speed_multiplier * (1.0 + scaling.speed_per_stage * stage_offset),
        damage_multiplier: stats.damage_multiplier
            * (1.0 + scaling.damage_per_stage * stage_offset),
        radius_multiplier: stats.radius_multiplier,
        score_multiplier: stats.score_multiplier,
        contact_cooldown: stats.contact_cooldown,
        color: stats.color.clone(),
        accent: stats.accent.clone(),
        sides: stats.sides,
        wobble: stats.wobble,
        wobble_rate: stats.wobble_rate,
    }
}

fn boss_stage_hp_scale_offset(
    stage_offset: f64,
    post_stage2_base: f64,
    post_stage2_per_stage: f64,
) -> f64 {
    if stage_offset <= 1.0 {
        stage_offset
    } else {
        post_stage2_base + (stage_offset - 2.0) * post_stage2_per_stage
    }
}

#[derive(Debug, Clone, Copy)]
pub struct SpawnRolls {
    pub position_rolls: [f64; 3],
    pub kind_roll: f64,
    pub seed_roll: f64,
    pub wobble_roll: f64,
}

pub fn find_boss_def<'a>(bosses: &'a [BossDef], role: &str) -> &'a BossDef {
    bosses
        .iter()
        .find(|b| b.role == role)
        .unwrap_or_else(|| panic!("no boss def for role: {role}"))
}

#[cfg(test)]
mod tests {
    use voidline_data::load_default;

    use super::{boss_stats_at, find_boss_def};

    #[test]
    fn boss_stage_scaling_uses_post_stage2_knobs() {
        let bundle = load_default().unwrap();
        let boss = find_boss_def(&bundle.bosses, "boss");
        let stage2 = boss_stats_at(&bundle.balance, &boss.stats, 2);
        let stage3 = boss_stats_at(&bundle.balance, &boss.stats, 3);
        let stage4 = boss_stats_at(&bundle.balance, &boss.stats, 4);
        let scaling = &bundle.balance.bosses.stage_scaling;

        assert!(
            (stage2.hp_multiplier - boss.stats.hp_multiplier * (1.0 + scaling.hp_per_stage)).abs()
                < 1e-9
        );
        assert!(
            (stage3.hp_multiplier
                - boss.stats.hp_multiplier
                    * (1.0 + scaling.hp_per_stage * scaling.post_stage2_hp_offset_base))
                .abs()
                < 1e-9
        );
        assert!(
            (stage4.hp_multiplier
                - boss.stats.hp_multiplier
                    * (1.0
                        + scaling.hp_per_stage
                            * (scaling.post_stage2_hp_offset_base
                                + scaling.post_stage2_hp_offset_per_stage)))
                .abs()
                < 1e-9
        );
        assert!(
            (stage4.damage_multiplier
                - boss.stats.damage_multiplier * (1.0 + scaling.damage_per_stage * 3.0))
                .abs()
                < 1e-9
        );
        assert!(
            (stage4.speed_multiplier
                - boss.stats.speed_multiplier * (1.0 + scaling.speed_per_stage * 3.0))
                .abs()
                < 1e-9
        );
    }
}

//! Enemy update + kill_enemy + kineticRam + magnetStorm.
//! Rust owns this gameplay path; the original TS runtime module was removed.

use voidline_data::balance::Balance;

use crate::balance_curves::score_award;
use crate::chests::spawn_chest;
use crate::entities::{ChestEntity, Enemy, EnemyRole, ExperienceOrb, PowerupOrb};
use crate::experience::spawn_experience;
use crate::math::{circle_hit, distance_sq, CircleRef};
use crate::player::Player;
use crate::pools::{release_enemy, EntityPools};
use crate::powerups::maybe_drop_powerup;
use crate::rng::Mulberry32;
use crate::roguelike::base_pressure_for_stage;
use crate::spatial_grid::SpatialGrid;
use crate::state::{EntityCounters, GameMode, GameState};
use crate::world::World;

/// Side-effects emitted while updating enemies that the simulation loop must
/// flush after the borrow on `enemies` ends.
#[derive(Debug, Default)]
pub struct EnemyUpdateOutcome {
    pub player_damage_events: Vec<f64>,
}

pub fn damage_player(player: &mut Player, world: &mut World, amount: f64) -> bool {
    if player.invuln > 0.0 {
        return false;
    }
    let mut incoming = amount;
    if player.shield > 0.0 {
        let absorbed = player.shield.min(incoming);
        player.shield -= absorbed;
        incoming -= absorbed;
    }
    if incoming > 0.0 {
        player.hp -= incoming;
    }
    player.invuln = 0.34;
    world.shake = 14.0_f64.max(world.shake);
    true
}

#[allow(clippy::too_many_arguments)]
pub fn update_enemies(
    balance: &Balance,
    pools: &mut EntityPools,
    counters: &mut EntityCounters,
    state: &mut GameState,
    player: &mut Player,
    world: &mut World,
    enemies: &mut Vec<Enemy>,
    enemy_grid: &mut SpatialGrid,
    bullets: &mut [crate::entities::Bullet], // unused, kept for symmetry
    chests: &mut Vec<ChestEntity>,
    experience_orbs: &mut Vec<ExperienceOrb>,
    powerup_orbs: &mut Vec<PowerupOrb>,
    rng: &mut Mulberry32,
    dt: f64,
    suppress_drops: bool,
) {
    let _ = bullets;
    trigger_magnet_storm(balance, state, player, world, enemies, dt);

    let mut i = enemies.len();
    while i > 0 {
        i -= 1;
        let kill_via_collision = step_enemy(
            balance,
            player,
            world,
            enemies,
            enemy_grid,
            state.stage,
            state.pressure,
            i,
            dt,
        );
        if let Some(killed) = kill_via_collision {
            kill_enemy(
                balance,
                pools,
                counters,
                state,
                player,
                world,
                enemies,
                chests,
                experience_orbs,
                powerup_orbs,
                rng,
                killed,
                suppress_drops,
            );
            enemy_grid.rebuild(enemies);
        }
    }
}

/// Returns Some(index) if the enemy should be released after collision damage.
fn step_enemy(
    balance: &Balance,
    player: &mut Player,
    world: &mut World,
    enemies: &mut Vec<Enemy>,
    enemy_grid: &SpatialGrid,
    stage: u32,
    pressure: u32,
    i: usize,
    dt: f64,
) -> Option<usize> {
    let (angle, speed) = {
        let (dir_x, dir_y) = pursuit_direction(
            balance,
            &enemies[i],
            player,
            enemies,
            enemy_grid,
            stage,
            pressure,
            i,
        );
        let enemy = &mut enemies[i];
        enemy.age += dt;
        enemy.hit = (enemy.hit - dt).max(0.0);
        enemy.contact_timer = (enemy.contact_timer - dt).max(0.0);

        let angle = dir_y.atan2(dir_x);
        let wobble = (enemy.age * enemy.wobble_rate + enemy.seed).sin() * enemy.wobble;
        enemy.x += (angle + wobble).cos() * enemy.speed * dt;
        enemy.y += (angle + wobble).sin() * enemy.speed * dt;
        (angle, enemy.speed)
    };

    let enemy_circle = CircleRef {
        x: enemies[i].x,
        y: enemies[i].y,
        radius: enemies[i].radius,
    };
    let player_circle = CircleRef {
        x: player.x,
        y: player.y,
        radius: player.radius,
    };

    if !circle_hit(enemy_circle, player_circle) {
        return None;
    }

    if try_kinetic_ram(balance, player, world, enemies, i, angle) {
        return None;
    }

    let role = enemies[i].role;
    let damage = enemies[i].damage;
    if matches!(role, EnemyRole::MiniBoss | EnemyRole::Boss) {
        if enemies[i].contact_timer <= 0.0 {
            damage_player(player, world, damage);
            enemies[i].contact_timer = enemies[i].contact_cooldown;
        }
        let backoff = balance.bosses.contact_backoff;
        enemies[i].x -= angle.cos() * speed * dt * backoff;
        enemies[i].y -= angle.sin() * speed * dt * backoff;
        return None;
    }

    if damage_player(player, world, damage) {
        return Some(i);
    }
    let backoff = balance.enemy.contact_backoff;
    enemies[i].x -= angle.cos() * speed * dt * backoff;
    enemies[i].y -= angle.sin() * speed * dt * backoff;
    None
}

fn pursuit_direction(
    balance: &Balance,
    enemy: &Enemy,
    player: &Player,
    enemies: &[Enemy],
    enemy_grid: &SpatialGrid,
    stage: u32,
    pressure: u32,
    self_index: usize,
) -> (f64, f64) {
    let dx = player.x - enemy.x;
    let dy = player.y - enemy.y;
    let distance = (dx * dx + dy * dy).sqrt();
    let (base_x, base_y) = if distance > f64::EPSILON {
        (dx / distance, dy / distance)
    } else {
        (0.0, 0.0)
    };

    if !matches!(enemy.role, EnemyRole::Normal) {
        return (base_x, base_y);
    }

    let mut move_x = base_x;
    let mut move_y = base_y;
    let contact_distance = player.radius + enemy.radius;
    let lane = &balance.enemy.pursuit_lane;
    let pressure_scale = (lane.pressure_scale_base
        + pressure as f64 * lane.pressure_scale_per_pressure)
        .min(lane.pressure_scale_max)
        .max(0.0);
    let stage_scale = 1.0 + stage.saturating_sub(2) as f64 * lane.stage_scale_per_stage_after_two;
    let path_scale = pressure_scale * stage_scale.max(0.0);
    if distance > contact_distance && distance < lane.start_distance {
        let lane_window = (lane.start_distance - contact_distance).max(1.0);
        let strength = ((lane.start_distance - distance) / lane_window).clamp(0.0, 1.0);
        let turn =
            (enemy.seed * lane.golden_angle_turn).sin() * lane.max_turn * strength * path_scale;
        move_x += -base_y * turn;
        move_y += base_x * turn;

        if should_sample_separation(enemy.id, lane.separation_sample_stride) {
            let (separation_x, separation_y) = local_separation(
                enemy,
                enemies,
                enemy_grid,
                self_index,
                lane.separation_radius,
                lane.separation_max_neighbors,
            );
            move_x += separation_x * lane.separation_strength * path_scale;
            move_y += separation_y * lane.separation_strength * path_scale;
        }
    }

    let len = (move_x * move_x + move_y * move_y).sqrt();
    if len > f64::EPSILON {
        (move_x / len, move_y / len)
    } else if distance > f64::EPSILON {
        (base_x, base_y)
    } else {
        (1.0, 0.0)
    }
}

fn should_sample_separation(enemy_id: u32, stride: u32) -> bool {
    stride <= 1 || enemy_id % stride == 0
}

fn local_separation(
    enemy: &Enemy,
    enemies: &[Enemy],
    enemy_grid: &SpatialGrid,
    self_index: usize,
    radius: f64,
    max_neighbors: u32,
) -> (f64, f64) {
    if radius <= 0.0 || max_neighbors == 0 {
        return (0.0, 0.0);
    }

    let mut x = 0.0;
    let mut y = 0.0;
    let mut scanned = 0_u32;
    let mut count = 0_u32;
    let scan_limit = max_neighbors.saturating_mul(4).max(max_neighbors);

    enemy_grid.visit_radius(enemy.x, enemy.y, radius, |idx| {
        if idx == self_index {
            return true;
        }
        if idx >= enemies.len() {
            return true;
        }
        if count >= max_neighbors || scanned >= scan_limit {
            return false;
        }
        scanned += 1;
        let other = &enemies[idx];
        if other.hp <= 0.0 || !matches!(other.role, EnemyRole::Normal) {
            return true;
        }
        let dx = enemy.x - other.x;
        let dy = enemy.y - other.y;
        let dist_sq = dx * dx + dy * dy;
        if dist_sq >= radius * radius {
            return true;
        }

        let (push_x, push_y, distance) = if dist_sq > 0.000_001 {
            let distance = dist_sq.sqrt();
            (dx / distance, dy / distance, distance)
        } else {
            let angle = enemy.seed * std::f64::consts::TAU;
            (angle.cos(), angle.sin(), 0.0)
        };
        let weight = ((radius - distance) / radius).clamp(0.0, 1.0);
        x += push_x * weight;
        y += push_y * weight;
        count += 1;
        true
    });

    if count == 0 {
        return (0.0, 0.0);
    }
    let len = (x * x + y * y).sqrt();
    if len > f64::EPSILON {
        (x / len, y / len)
    } else {
        (0.0, 0.0)
    }
}

fn try_kinetic_ram(
    balance: &Balance,
    player: &mut Player,
    world: &mut World,
    enemies: &mut Vec<Enemy>,
    i: usize,
    angle_to_player: f64,
) -> bool {
    let ram = &balance.synergies.kinetic_ram;
    let speed = (player.vx.powi(2) + player.vy.powi(2)).sqrt();
    let has_shield =
        player.shield_max > 0.0 && player.shield >= player.shield_max * ram.min_shield_ratio;
    if !player.traits.kinetic_ram || !has_shield || speed < ram.min_speed || player.ram_timer > 0.0
    {
        return false;
    }
    let enemy_radius = enemies[i].radius;
    let damage = player.damage * ram.damage.vs_damage
        + player.shield * ram.damage.vs_shield
        + speed * ram.damage.vs_speed;
    {
        let enemy = &mut enemies[i];
        enemy.hp -= damage;
        enemy.hit = ram.hit_duration;
        enemy.x -= angle_to_player.cos() * ram.knockback;
        enemy.y -= angle_to_player.sin() * ram.knockback;
    }
    let cost = ram.shield_cost.flat + enemy_radius * ram.shield_cost.per_radius;
    player.shield = (player.shield - cost).max(0.0);
    player.ram_timer = ram.cooldown;
    world.shake = (world.shake + 8.0).min(18.0);
    // Note: kill is reaped on next tick when enemy.hp <= 0 via bullets/enemies updates.
    true
}

fn trigger_magnet_storm(
    balance: &Balance,
    _state: &mut GameState,
    player: &mut Player,
    world: &mut World,
    enemies: &mut Vec<Enemy>,
    _dt: f64,
) {
    let storm = &balance.synergies.magnet_storm;
    if !player.traits.magnet_storm
        || player.magnet_storm_timer > 0.0
        || player.magnet_storm_charge < storm.threshold
    {
        return;
    }
    let charge = player.magnet_storm_charge;
    let radius_bonus = storm
        .radius
        .max_bonus
        .min(player.pickup_radius * storm.radius.pickup_factor);
    let radius = storm.radius.base + radius_bonus;
    let radius_sq = radius * radius;
    let damage = player.damage * storm.damage.vs_damage + charge * storm.damage.vs_charge;
    let has_target = enemies
        .iter()
        .any(|e| distance_sq(player.x, player.y, e.x, e.y) <= radius_sq);
    if !has_target {
        return;
    }

    player.magnet_storm_charge = 0.0;
    player.magnet_storm_timer = storm.cooldown;
    world.shake = (world.shake + 14.0).min(24.0);

    for e in enemies.iter_mut() {
        if distance_sq(player.x, player.y, e.x, e.y) > radius_sq {
            continue;
        }
        let angle = (e.y - player.y).atan2(e.x - player.x);
        e.hp -= damage;
        e.hit = storm.hit_duration;
        e.x += angle.cos() * storm.knockback;
        e.y += angle.sin() * storm.knockback;
    }
}

#[allow(clippy::too_many_arguments)]
pub fn kill_enemy(
    balance: &Balance,
    pools: &mut EntityPools,
    counters: &mut EntityCounters,
    state: &mut GameState,
    _player: &mut Player,
    _world: &mut World,
    enemies: &mut Vec<Enemy>,
    chests: &mut Vec<ChestEntity>,
    experience_orbs: &mut Vec<ExperienceOrb>,
    powerup_orbs: &mut Vec<PowerupOrb>,
    rng: &mut Mulberry32,
    index: usize,
    suppress_drops: bool,
) {
    let snapshot = enemies[index].clone();
    release_enemy(pools, enemies, index);
    state.phase_kills += 1;
    let kind_key = snapshot.kind.as_str().to_string();
    *state.kills_by_kind.entry(kind_key).or_insert(0) += 1;
    let awarded = score_award(balance, snapshot.score, state.pressure);
    state.score += awarded as f64;
    state.best_combo += 1;
    spawn_experience(
        balance,
        pools,
        counters,
        experience_orbs,
        rng,
        &snapshot,
        state.pressure,
    );
    maybe_drop_powerup(
        balance,
        pools,
        counters,
        powerup_orbs,
        rng,
        &snapshot,
        suppress_drops,
    );

    match snapshot.role {
        EnemyRole::MiniBoss => {
            spawn_chest(pools, counters, chests, rng, snapshot.x, snapshot.y);
        }
        EnemyRole::Boss => {
            if !state.run_boss_stages.contains(&state.stage) {
                state.run_boss_stages.push(state.stage);
            }
            let cleared_stage = state.stage;
            let next_stage = cleared_stage + 1;
            let next_pressure = base_pressure_for_stage(balance, next_stage).max(state.pressure);
            state.stage_boss_active = false;
            state.stage_boss_spawned = false;
            state.stage = next_stage;
            state.highest_stage_reached = state.highest_stage_reached.max(state.stage);
            state.stage_elapsed_seconds = 0.0;
            state.phase_kills = 0;
            state.pressure = next_pressure;
            state.mini_boss_pending = false;
            state.mini_boss_last_pressure = next_pressure.saturating_sub(1);
        }
        EnemyRole::Normal => {}
    }

    if state.mode == GameMode::Playing {
        // markHudDirty in TS — no-op headless.
    }
}

/// Scan enemies for HP<=0 and clean up. Bullets update may have damaged
/// some without triggering kill_enemy directly; this catches them.
#[allow(clippy::too_many_arguments)]
pub fn reap_dead_enemies(
    balance: &Balance,
    pools: &mut EntityPools,
    counters: &mut EntityCounters,
    state: &mut GameState,
    player: &mut Player,
    world: &mut World,
    enemies: &mut Vec<Enemy>,
    chests: &mut Vec<ChestEntity>,
    experience_orbs: &mut Vec<ExperienceOrb>,
    powerup_orbs: &mut Vec<PowerupOrb>,
    rng: &mut Mulberry32,
    suppress_drops: bool,
) {
    let mut i = enemies.len();
    while i > 0 {
        i -= 1;
        if enemies[i].hp <= 0.0 {
            kill_enemy(
                balance,
                pools,
                counters,
                state,
                player,
                world,
                enemies,
                chests,
                experience_orbs,
                powerup_orbs,
                rng,
                i,
                suppress_drops,
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::entities::EnemyKind;
    use voidline_data::load_default;

    fn normal_enemy_at_player(player: &Player) -> Enemy {
        Enemy {
            id: 1,
            kind: EnemyKind::Scout,
            score: 35.0,
            radius: 14.0,
            hp: 10.0,
            max_hp: 10.0,
            speed: 132.0,
            damage: 12.0,
            sides: 3,
            x: player.x,
            y: player.y,
            age: 0.0,
            seed: 7.0,
            wobble: 0.0,
            wobble_rate: 0.0,
            hit: 0.0,
            role: EnemyRole::Normal,
            contact_timer: 0.0,
            contact_cooldown: 0.0,
        }
    }

    fn grid_for(enemies: &[Enemy]) -> SpatialGrid {
        let mut grid = SpatialGrid::new(72.0);
        grid.rebuild(enemies);
        grid
    }

    #[test]
    fn invulnerability_blocks_damage_without_consuming_normal_enemy() {
        let bundle = load_default().expect("balance.json");
        let mut player = Player::new(&bundle.balance.player.stats);
        player.invuln = 0.2;
        let mut world = World::default();
        let mut enemies = vec![normal_enemy_at_player(&player)];
        let grid = grid_for(&enemies);

        let killed = step_enemy(
            &bundle.balance,
            &mut player,
            &mut world,
            &mut enemies,
            &grid,
            1,
            1,
            0,
            1.0 / 60.0,
        );

        assert!(killed.is_none());
        assert_eq!(player.hp, player.max_hp);
        assert_eq!(enemies.len(), 1);
    }

    #[test]
    fn normal_enemy_is_consumed_only_when_contact_damage_lands() {
        let bundle = load_default().expect("balance.json");
        let mut player = Player::new(&bundle.balance.player.stats);
        let mut world = World::default();
        let mut enemies = vec![normal_enemy_at_player(&player)];
        let grid = grid_for(&enemies);

        let killed = step_enemy(
            &bundle.balance,
            &mut player,
            &mut world,
            &mut enemies,
            &grid,
            1,
            1,
            0,
            1.0 / 60.0,
        );

        assert_eq!(killed, Some(0));
        assert!(player.hp < player.max_hp);
    }

    #[test]
    fn normal_enemies_with_different_seeds_take_different_lanes() {
        let bundle = load_default().expect("balance.json");
        let player = Player::new(&bundle.balance.player.stats);
        let mut enemy_a = normal_enemy_at_player(&player);
        enemy_a.x = player.x + player.radius + enemy_a.radius + 96.0;
        enemy_a.y = player.y;
        enemy_a.seed = 1.0;
        let mut enemy_b = enemy_a.clone();
        enemy_b.id = 2;
        enemy_b.seed = 9.0;

        let enemies_a = vec![enemy_a];
        let grid_a = grid_for(&enemies_a);
        let dir_a = pursuit_direction(
            &bundle.balance,
            &enemies_a[0],
            &player,
            &enemies_a,
            &grid_a,
            2,
            10,
            0,
        );
        let enemies_b = vec![enemy_b];
        let grid_b = grid_for(&enemies_b);
        let dir_b = pursuit_direction(
            &bundle.balance,
            &enemies_b[0],
            &player,
            &enemies_b,
            &grid_b,
            2,
            10,
            0,
        );

        assert!(dir_a.0 < 0.0);
        assert!(dir_b.0 < 0.0);
        assert!((dir_a.1 - dir_b.1).abs() > 0.05);
    }

    #[test]
    fn nearby_normal_enemies_push_out_of_the_same_stack() {
        let bundle = load_default().expect("balance.json");
        let player = Player::new(&bundle.balance.player.stats);
        let mut upper = normal_enemy_at_player(&player);
        upper.id = 4;
        upper.x = player.x + player.radius + upper.radius + 128.0;
        upper.y = player.y - 5.0;
        upper.seed = 0.0;
        let mut lower = upper.clone();
        lower.id = 8;
        lower.y = player.y + 5.0;
        let enemies = vec![upper, lower];
        let grid = grid_for(&enemies);

        let upper_dir = pursuit_direction(
            &bundle.balance,
            &enemies[0],
            &player,
            &enemies,
            &grid,
            2,
            10,
            0,
        );
        let lower_dir = pursuit_direction(
            &bundle.balance,
            &enemies[1],
            &player,
            &enemies,
            &grid,
            2,
            10,
            1,
        );

        assert!(upper_dir.1 < 0.0);
        assert!(lower_dir.1 > 0.0);
    }

    #[test]
    fn normal_enemy_lane_steering_still_converges_to_contact() {
        let bundle = load_default().expect("balance.json");
        let mut player = Player::new(&bundle.balance.player.stats);
        let mut world = World::default();
        let mut enemy = normal_enemy_at_player(&player);
        enemy.x = player.x + player.radius + enemy.radius + 64.0;
        enemy.y = player.y;
        enemy.seed = 13.0;
        let mut enemies = vec![enemy];

        let mut killed = None;
        for _ in 0..180 {
            let grid = grid_for(&enemies);
            killed = step_enemy(
                &bundle.balance,
                &mut player,
                &mut world,
                &mut enemies,
                &grid,
                1,
                1,
                0,
                1.0 / 60.0,
            );
            if killed.is_some() {
                break;
            }
        }

        assert_eq!(killed, Some(0));
        assert!(player.hp < player.max_hp);
    }
}

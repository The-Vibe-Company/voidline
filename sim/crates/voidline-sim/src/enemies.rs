//! Enemy update + kill_enemy + kineticRam + magnetStorm.
//! Mirrors `src/entities/enemies.ts`.

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
use crate::roguelike::{boss_unlock_wave_for_stage, starting_wave_for_stage};
use crate::state::{EntityCounters, GameMode, GameState};
use crate::world::World;

/// Side-effects emitted while updating enemies that the simulation loop must
/// flush after the borrow on `enemies` ends.
#[derive(Debug, Default)]
pub struct EnemyUpdateOutcome {
    pub player_damage_events: Vec<f64>,
}

pub fn damage_player(player: &mut Player, world: &mut World, amount: f64) {
    if player.invuln > 0.0 {
        return;
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
        let kill_via_collision = step_enemy(balance, player, world, enemies, i, dt);
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
        }
    }
}

/// Returns Some(index) if the enemy should be released after collision damage.
fn step_enemy(
    balance: &Balance,
    player: &mut Player,
    world: &mut World,
    enemies: &mut Vec<Enemy>,
    i: usize,
    dt: f64,
) -> Option<usize> {
    let enemy = &mut enemies[i];
    enemy.age += dt;
    enemy.hit = (enemy.hit - dt).max(0.0);
    enemy.contact_timer = (enemy.contact_timer - dt).max(0.0);

    let angle = (player.y - enemy.y).atan2(player.x - enemy.x);
    let wobble = (enemy.age * enemy.wobble_rate + enemy.seed).sin() * enemy.wobble;
    enemy.x += (angle + wobble).cos() * enemy.speed * dt;
    enemy.y += (angle + wobble).sin() * enemy.speed * dt;

    let enemy_circle = CircleRef { x: enemy.x, y: enemy.y, radius: enemy.radius };
    let player_circle = CircleRef { x: player.x, y: player.y, radius: player.radius };

    if !circle_hit(enemy_circle, player_circle) {
        return None;
    }

    if try_kinetic_ram(balance, player, world, enemies, i, angle) {
        return None;
    }

    let role = enemies[i].role;
    let damage = enemies[i].damage;
    let speed = enemies[i].speed;
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

    damage_player(player, world, damage);
    Some(i)
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
    let radius_bonus = storm.radius.max_bonus.min(player.pickup_radius * storm.radius.pickup_factor);
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
    state.wave_kills += 1;
    let kind_key = snapshot.kind.as_str().to_string();
    *state.kills_by_kind.entry(kind_key).or_insert(0) += 1;
    let awarded = score_award(snapshot.score, state.wave);
    state.score += awarded as f64;
    state.best_combo += 1;
    spawn_experience(
        balance,
        pools,
        counters,
        experience_orbs,
        rng,
        &snapshot,
        state.wave,
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
            if !state.run_boss_waves.contains(&state.wave) {
                state.run_boss_waves.push(state.wave);
            }
            if !state.run_boss_stages.contains(&state.stage) {
                state.run_boss_stages.push(state.stage);
            }
            let cleared_stage = state.stage;
            let next_stage = cleared_stage + 1;
            let next_wave = (state.wave + 1).max(starting_wave_for_stage(balance, next_stage));
            state.stage_boss_active = false;
            state.stage_boss_spawned = false;
            state.stage = next_stage;
            state.highest_stage_reached = state.highest_stage_reached.max(state.stage);
            state.stage_elapsed_seconds = 0.0;
            state.wave = next_wave - 1;
            state.wave_delay = 0.0;
            let _unlocked = boss_unlock_wave_for_stage(cleared_stage);
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

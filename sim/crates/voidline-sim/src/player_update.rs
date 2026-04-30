//! Player movement and firing tick, mirroring `src/entities/player.ts:updatePlayer`.

use std::collections::HashSet;

use voidline_data::balance::Balance;

use crate::bullets::{fire_drones, fire_volley, nearest_enemy};
use crate::entities::{Bullet, Enemy};
use crate::input::InputState;
use crate::math::clamp;
use crate::player::Player;
use crate::pools::EntityPools;
use crate::rng::Mulberry32;
use crate::spatial_grid::SpatialGrid;
use crate::state::{ControlMode, EntityCounters};
use crate::world::World;

const TARGET_SEARCH_RADIUS: f64 = 980.0;

#[allow(clippy::too_many_arguments)]
pub fn update_player(
    balance: &Balance,
    pools: &mut EntityPools,
    counters: &mut EntityCounters,
    bullets: &mut Vec<Bullet>,
    enemies: &[Enemy],
    grid: &SpatialGrid,
    player: &mut Player,
    world: &World,
    input: &InputState,
    control_mode: ControlMode,
    rng: &mut Mulberry32,
    dt: f64,
) {
    let key_x = bool_to_int(any(&input.keys, &["ArrowRight", "KeyD"]))
        - bool_to_int(any(&input.keys, &["ArrowLeft", "KeyA", "KeyQ"]));
    let key_y = bool_to_int(any(&input.keys, &["ArrowDown", "KeyS"]))
        - bool_to_int(any(&input.keys, &["ArrowUp", "KeyW", "KeyZ"]));
    let key_active = key_x != 0 || key_y != 0;
    let mut input_x = key_x as f64;
    let mut input_y = key_y as f64;
    let mut speed_scale = 1.0_f64;

    if !key_active && control_mode == ControlMode::Trackpad && input.pointer_inside {
        let target_x = world.camera_x + input.pointer_x;
        let target_y = world.camera_y + input.pointer_y;
        let dx = target_x - player.x;
        let dy = target_y - player.y;
        let dist = (dx * dx + dy * dy).sqrt();
        if dist > 14.0 {
            input_x = dx / dist;
            input_y = dy / dist;
            speed_scale = clamp(dist / 210.0, 0.32, 1.0);
        }
    }

    let len = (input_x * input_x + input_y * input_y).sqrt().max(1.0);
    let target_vx = (input_x / len) * player.speed * speed_scale;
    let target_vy = (input_y / len) * player.speed * speed_scale;
    let smoothing = 1.0 - 0.0009_f64.powf(dt);
    player.vx += (target_vx - player.vx) * smoothing;
    player.vy += (target_vy - player.vy) * smoothing;
    player.x = clamp(
        player.x + player.vx * dt,
        player.radius + 8.0,
        world.arena_width - player.radius - 8.0,
    );
    player.y = clamp(
        player.y + player.vy * dt,
        player.radius + 8.0,
        world.arena_height - player.radius - 8.0,
    );

    player.invuln = (player.invuln - dt).max(0.0);
    player.ram_timer = (player.ram_timer - dt).max(0.0);
    player.magnet_storm_timer = (player.magnet_storm_timer - dt).max(0.0);
    if player.shield_max > 0.0 {
        player.shield = player.shield_max.min(player.shield + player.shield_regen * dt);
    }

    let arena_diag = (world.arena_width.powi(2) + world.arena_height.powi(2)).sqrt();
    let target = nearest_enemy(enemies, grid, TARGET_SEARCH_RADIUS, arena_diag, player.x, player.y);
    if let Some(target_idx) = target {
        let e = &enemies[target_idx];
        player.aim_angle = (e.y - player.y).atan2(e.x - player.x);
    } else if (player.vx * player.vx + player.vy * player.vy).sqrt() > 20.0 {
        player.aim_angle = player.vy.atan2(player.vx);
    }

    player.fire_timer -= dt;
    if target.is_some() && player.fire_timer <= 0.0 {
        let aim = player.aim_angle;
        let px = player.x;
        let py = player.y;
        fire_volley(balance, pools, counters, bullets, player, rng, px, py, aim, false);
        player.fire_timer = 1.0 / player.fire_rate;
    }

    if player.drones > 0.0 {
        player.drone_timer -= dt;
        if player.drone_timer <= 0.0 {
            fire_drones(
                balance,
                pools,
                counters,
                bullets,
                enemies,
                grid,
                player,
                rng,
                world,
                TARGET_SEARCH_RADIUS,
            );
            let fi = &balance.player.drone.fire_interval;
            player.drone_timer = if player.traits.drone_swarm {
                fi.min_swarm.max(fi.swarm - player.drones * fi.reduce_per_drone_swarm)
            } else {
                fi.min.max(fi.base - player.drones * fi.reduce_per_drone)
            };
        }
    }
}

fn any(set: &HashSet<String>, keys: &[&str]) -> bool {
    keys.iter().any(|k| set.contains(*k))
}

fn bool_to_int(b: bool) -> i32 {
    if b { 1 } else { 0 }
}

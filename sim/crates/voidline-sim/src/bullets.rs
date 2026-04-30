//! Bullet firing and collision logic, mirroring `src/entities/player.ts`
//! (fireVolley/fireDrones/nearestEnemy) and `src/entities/bullets.ts`
//! (updateBullets/spawnRailChain/findRailChainTarget).

use voidline_data::balance::Balance;

use crate::entities::{Bullet, BulletSource, Enemy};
use crate::math::{circle_hit, distance_sq, CircleRef};
use crate::player::Player;
use crate::pools::{acquire_bullet, release_bullet, EntityPools};
use crate::rng::Mulberry32;
use crate::spatial_grid::SpatialGrid;
use crate::state::EntityCounters;
use crate::world::World;

const RAIL_CHAIN_RADIUS: f64 = 285.0;
const RAIL_CHAIN_DAMAGE_SCALE: f64 = 0.48;

/// Per-volley input — caller pre-rolls crit values for determinism.
pub fn fire_volley(
    balance: &Balance,
    pools: &mut EntityPools,
    counters: &mut EntityCounters,
    bullets: &mut Vec<Bullet>,
    player: &Player,
    rng: &mut Mulberry32,
    x: f64,
    y: f64,
    angle: f64,
    drone: bool,
) {
    let count = if drone { 1.0 } else { player.projectile_count };
    let count_int = count.max(1.0) as u32;
    let spread_cfg = &balance.player.weapon_spread;
    let spread = if drone {
        0.0
    } else {
        spread_cfg.max.min(spread_cfg.per_extra_projectile * (count - 1.0).max(0.0))
    };
    let start = angle - spread / 2.0;
    let step = if count_int > 1 { spread / (count - 1.0) } else { 0.0 };
    let drone_cfg = &balance.player.drone;

    for i in 0..count_int {
        let bullet_angle = start + step * (i as f64);
        let speed = if drone {
            player.bullet_speed * drone_cfg.bullet_speed_mul
        } else {
            player.bullet_speed
        };
        let is_crit = rng.next_f64() < player.crit_chance;
        let base_damage = if drone {
            let mul = if player.traits.drone_swarm {
                drone_cfg.damage_mul_swarm
            } else {
                drone_cfg.damage_mul
            };
            player.damage * mul
        } else {
            player.damage
        };
        let base_radius = if drone { drone_cfg.bullet_radius } else { 5.0 };
        let idx = acquire_bullet(pools, counters, bullets);
        let bullet = &mut bullets[idx];
        bullet.x = x + bullet_angle.cos() * 20.0;
        bullet.y = y + bullet_angle.sin() * 20.0;
        bullet.vx = bullet_angle.cos() * speed;
        bullet.vy = bullet_angle.sin() * speed;
        bullet.radius = base_radius * player.bullet_radius;
        bullet.damage = if is_crit { base_damage * 2.0 } else { base_damage };
        bullet.pierce = if drone && player.traits.drone_swarm {
            (player.pierce / 2.0).floor().max(1.0) as i32
        } else {
            player.pierce as i32
        };
        bullet.life = if drone { drone_cfg.bullet_life } else { 1.15 };
        bullet.trail = 0.0;
        bullet.source = if drone { BulletSource::Drone } else { BulletSource::Player };
        bullet.chain_remaining = if !drone && player.traits.rail_splitter { 1 } else { 0 };
    }
}

/// Returns the index of the closest enemy within the search radius.
pub fn nearest_enemy(
    enemies: &[Enemy],
    grid: &SpatialGrid,
    target_search_radius: f64,
    arena_diag: f64,
    x: f64,
    y: f64,
) -> Option<usize> {
    if enemies.len() > 96 {
        let mut radius = target_search_radius;
        while radius <= arena_diag + target_search_radius {
            if let Some(idx) = grid.nearest(x, y, radius, enemies) {
                return Some(idx);
            }
            radius *= 2.0;
        }
        return None;
    }
    let mut best_idx: Option<usize> = None;
    let mut best = f64::INFINITY;
    for (i, e) in enemies.iter().enumerate() {
        let d = distance_sq(x, y, e.x, e.y);
        if d < best {
            best = d;
            best_idx = Some(i);
        }
    }
    best_idx
}

pub fn fire_drones(
    balance: &Balance,
    pools: &mut EntityPools,
    counters: &mut EntityCounters,
    bullets: &mut Vec<Bullet>,
    enemies: &[Enemy],
    grid: &SpatialGrid,
    player: &Player,
    rng: &mut Mulberry32,
    world: &World,
    target_search_radius: f64,
) {
    if enemies.is_empty() {
        return;
    }
    let drone_cfg = &balance.player.drone;
    let arena_diag = (world.arena_width.powi(2) + world.arena_height.powi(2)).sqrt();
    let drones = player.drones.max(0.0) as u32;
    for i in 0..drones {
        let angle = world.time * drone_cfg.orbit_angular_velocity
            + (std::f64::consts::TAU * (i as f64)) / (player.drones.max(1.0));
        let x = player.x + angle.cos() * drone_cfg.orbit_radius;
        let y = player.y + angle.sin() * drone_cfg.orbit_radius;
        if let Some(target_idx) = nearest_enemy(enemies, grid, target_search_radius, arena_diag, x, y)
        {
            let target = &enemies[target_idx];
            let aim = (target.y - y).atan2(target.x - x);
            fire_volley(balance, pools, counters, bullets, player, rng, x, y, aim, true);
        }
    }
}

/// Spawn a single rail chain bullet from `source` toward the nearest enemy
/// not already hit. Mirrors `spawnRailChain` in TS.
pub fn spawn_rail_chain(
    pools: &mut EntityPools,
    counters: &mut EntityCounters,
    bullets: &mut Vec<Bullet>,
    enemies: &[Enemy],
    player: &Player,
    source_index: usize,
) {
    if !player.traits.rail_splitter {
        return;
    }
    let source = bullets[source_index].clone();
    if source.chain_remaining == 0 {
        return;
    }

    let mut target: Option<usize> = None;
    let mut best = RAIL_CHAIN_RADIUS * RAIL_CHAIN_RADIUS;
    for (i, e) in enemies.iter().enumerate() {
        if e.hp <= 0.0 || source.hit_ids.contains(&e.id) {
            continue;
        }
        let d = distance_sq(source.x, source.y, e.x, e.y);
        if d < best {
            best = d;
            target = Some(i);
        }
    }
    let Some(target_idx) = target else {
        return;
    };
    let target = &enemies[target_idx];

    let angle = (target.y - source.y).atan2(target.x - source.x);
    let speed = (player.bullet_speed * 1.05).max(620.0);
    let chain_idx = acquire_bullet(pools, counters, bullets);
    let chain = &mut bullets[chain_idx];
    chain.x = source.x;
    chain.y = source.y;
    chain.vx = angle.cos() * speed;
    chain.vy = angle.sin() * speed;
    chain.radius = (source.radius * 0.82).max(4.0);
    chain.damage = source.damage * RAIL_CHAIN_DAMAGE_SCALE;
    chain.pierce = 0;
    chain.life = 0.55;
    chain.trail = 0.0;
    chain.source = BulletSource::Chain;
    chain.chain_remaining = source.chain_remaining - 1;
    for &id in &source.hit_ids {
        chain.hit_ids.push(id);
    }
}

#[derive(Debug, Clone, Copy)]
pub struct BulletHit {
    pub bullet_index: usize,
    pub enemy_index: usize,
    pub damage: f64,
    pub killed: bool,
    pub bullet_vx: f64,
    pub bullet_vy: f64,
}

pub fn update_bullets(
    pools: &mut EntityPools,
    bullets: &mut Vec<Bullet>,
    enemies: &mut Vec<Enemy>,
    grid: &mut SpatialGrid,
    player: &mut Player,
    world: &World,
    dt: f64,
    counters: &mut EntityCounters,
    max_enemy_radius: f64,
) -> Vec<usize> {
    grid.rebuild(enemies);
    let mut killed_indices = Vec::new();

    let mut i = bullets.len();
    while i > 0 {
        i -= 1;

        // step bullet
        let (life_expired, bullet_circle, vx, vy) = {
            let b = &mut bullets[i];
            b.life -= dt;
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            b.trail += dt;
            let oob = b.x < -80.0
                || b.x > world.arena_width + 80.0
                || b.y < -80.0
                || b.y > world.arena_height + 80.0;
            (
                b.life <= 0.0 || oob,
                CircleRef { x: b.x, y: b.y, radius: b.radius },
                b.vx,
                b.vy,
            )
        };
        if life_expired {
            release_bullet(pools, bullets, i);
            continue;
        }

        let reach = bullet_circle.radius + max_enemy_radius;

        // Collision via grid
        let mut hit_target: Option<usize> = None;
        grid.visit_radius(bullet_circle.x, bullet_circle.y, reach, |idx| {
            if hit_target.is_some() {
                return false;
            }
            let enemy = &enemies[idx];
            if enemy.hp <= 0.0 || bullets[i].hit_ids.contains(&enemy.id) {
                return true;
            }
            let enemy_circle = enemy.as_circle();
            if !circle_hit(bullet_circle, enemy_circle) {
                return true;
            }
            hit_target = Some(idx);
            false
        });

        if let Some(enemy_idx) = hit_target {
            let damage = bullets[i].damage;
            let enemy_id = enemies[enemy_idx].id;
            bullets[i].hit_ids.push(enemy_id);
            {
                let enemy = &mut enemies[enemy_idx];
                enemy.hp -= damage;
                enemy.hit = 0.12;
                enemy.x += vx * 0.012;
                enemy.y += vy * 0.012;
            }
            let killed = enemies[enemy_idx].hp <= 0.0;
            if killed {
                killed_indices.push(enemy_idx);
                if player.lifesteal > 0.0 {
                    player.hp = player.max_hp.min(player.hp + player.lifesteal);
                }
            }

            spawn_rail_chain(pools, counters, bullets, enemies, player, i);

            bullets[i].pierce -= 1;
            if bullets[i].pierce < 0 {
                release_bullet(pools, bullets, i);
            }
        }
    }

    killed_indices
}

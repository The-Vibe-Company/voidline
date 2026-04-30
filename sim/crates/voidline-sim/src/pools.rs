//! Entity pools for the Rust runtime engine. Pools recycle entities to avoid
//! allocations while keeping release behavior deterministic via swap_remove.

use crate::entities::{
    Bullet, BulletSource, ChestEntity, Enemy, EnemyKind, ExperienceOrb, PowerupKind, PowerupOrb,
};
use crate::state::EntityCounters;

#[derive(Debug, Default)]
pub struct EntityPools {
    pub enemy_pool: Vec<Enemy>,
    pub bullet_pool: Vec<Bullet>,
    pub chest_pool: Vec<ChestEntity>,
    pub experience_pool: Vec<ExperienceOrb>,
    pub powerup_pool: Vec<PowerupOrb>,
}

impl EntityPools {
    pub fn clear(&mut self) {
        self.enemy_pool.clear();
        self.bullet_pool.clear();
        self.chest_pool.clear();
        self.experience_pool.clear();
        self.powerup_pool.clear();
    }
}

pub fn acquire_enemy(
    pools: &mut EntityPools,
    counters: &mut EntityCounters,
    enemies: &mut Vec<Enemy>,
    kind: EnemyKind,
    score: f64,
    radius: f64,
    damage: f64,
    sides: u32,
) -> usize {
    let mut enemy = pools.enemy_pool.pop().unwrap_or(Enemy {
        id: 0,
        kind,
        score: 0.0,
        radius: 0.0,
        hp: 0.0,
        max_hp: 0.0,
        speed: 0.0,
        damage: 0.0,
        sides: 3,
        x: 0.0,
        y: 0.0,
        age: 0.0,
        seed: 0.0,
        wobble: 0.0,
        wobble_rate: 0.0,
        hit: 0.0,
        role: crate::entities::EnemyRole::Normal,
        contact_timer: 0.0,
        contact_cooldown: 0.0,
    });
    enemy.id = counters.next_enemy_id;
    counters.next_enemy_id += 1;
    enemy.kind = kind;
    enemy.score = score;
    enemy.radius = radius;
    enemy.damage = damage;
    enemy.sides = sides;
    enemy.role = crate::entities::EnemyRole::Normal;
    enemy.contact_timer = 0.0;
    enemy.contact_cooldown = 0.0;
    enemies.push(enemy);
    enemies.len() - 1
}

/// Mirrors `swapRemove` semantics: O(1) by swapping with last.
pub fn release_enemy(pools: &mut EntityPools, enemies: &mut Vec<Enemy>, index: usize) -> Enemy {
    let enemy = enemies.swap_remove(index);
    let mut returned = enemy.clone();
    pools.enemy_pool.push(enemy);
    returned.role = crate::entities::EnemyRole::Normal;
    returned
}

pub fn acquire_bullet(
    pools: &mut EntityPools,
    counters: &mut EntityCounters,
    bullets: &mut Vec<Bullet>,
) -> usize {
    let mut bullet = pools.bullet_pool.pop().unwrap_or(Bullet {
        id: 0,
        x: 0.0,
        y: 0.0,
        vx: 0.0,
        vy: 0.0,
        radius: 0.0,
        damage: 0.0,
        pierce: 0,
        life: 0.0,
        trail: 0.0,
        hit_ids: Vec::new(),
        source: BulletSource::Player,
        chain_remaining: 0,
    });
    bullet.id = counters.next_bullet_id;
    counters.next_bullet_id += 1;
    bullet.hit_ids.clear();
    bullet.source = BulletSource::Player;
    bullet.chain_remaining = 0;
    bullets.push(bullet);
    bullets.len() - 1
}

pub fn release_bullet(pools: &mut EntityPools, bullets: &mut Vec<Bullet>, index: usize) {
    let mut bullet = bullets.swap_remove(index);
    bullet.hit_ids.clear();
    pools.bullet_pool.push(bullet);
}

pub fn acquire_chest(
    pools: &mut EntityPools,
    counters: &mut EntityCounters,
    chests: &mut Vec<ChestEntity>,
) -> usize {
    let mut chest = pools.chest_pool.pop().unwrap_or(ChestEntity {
        id: 0,
        x: 0.0,
        y: 0.0,
        vx: 0.0,
        vy: 0.0,
        radius: 0.0,
        age: 0.0,
    });
    chest.id = counters.next_chest_id;
    counters.next_chest_id += 1;
    chests.push(chest);
    chests.len() - 1
}

pub fn release_chest(pools: &mut EntityPools, chests: &mut Vec<ChestEntity>, index: usize) {
    let chest = chests.swap_remove(index);
    pools.chest_pool.push(chest);
}

pub fn acquire_experience_orb(
    pools: &mut EntityPools,
    counters: &mut EntityCounters,
    orbs: &mut Vec<ExperienceOrb>,
) -> usize {
    let mut orb = pools.experience_pool.pop().unwrap_or(ExperienceOrb {
        id: 0,
        x: 0.0,
        y: 0.0,
        vx: 0.0,
        vy: 0.0,
        radius: 0.0,
        value: 0.0,
        age: 0.0,
        magnetized: false,
    });
    orb.id = counters.next_experience_id;
    counters.next_experience_id += 1;
    orbs.push(orb);
    orbs.len() - 1
}

pub fn release_experience_orb(
    pools: &mut EntityPools,
    orbs: &mut Vec<ExperienceOrb>,
    index: usize,
) {
    let orb = orbs.swap_remove(index);
    pools.experience_pool.push(orb);
}

pub fn acquire_powerup_orb(
    pools: &mut EntityPools,
    counters: &mut EntityCounters,
    orbs: &mut Vec<PowerupOrb>,
    kind: PowerupKind,
) -> usize {
    let mut orb = pools.powerup_pool.pop().unwrap_or(PowerupOrb {
        id: 0,
        x: 0.0,
        y: 0.0,
        vx: 0.0,
        vy: 0.0,
        radius: 0.0,
        kind,
        age: 0.0,
        life: 0.0,
    });
    orb.id = counters.next_powerup_id;
    counters.next_powerup_id += 1;
    orb.kind = kind;
    orbs.push(orb);
    orbs.len() - 1
}

pub fn release_powerup_orb(pools: &mut EntityPools, orbs: &mut Vec<PowerupOrb>, index: usize) {
    let orb = orbs.swap_remove(index);
    pools.powerup_pool.push(orb);
}

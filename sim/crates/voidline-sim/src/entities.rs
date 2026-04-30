//! Game entities mirroring `src/types.ts` (Enemy, Bullet, ExperienceOrb,
//! PowerupOrb, ChestEntity). All collections are plain `Vec<T>` for
//! deterministic iteration order; pool recycling matches the TS pattern.

use crate::math::CircleRef;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EnemyRole {
    Normal,
    MiniBoss,
    Boss,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum EnemyKind {
    Scout,
    Hunter,
    Brute,
}

impl EnemyKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            EnemyKind::Scout => "scout",
            EnemyKind::Hunter => "hunter",
            EnemyKind::Brute => "brute",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "scout" => Some(EnemyKind::Scout),
            "hunter" => Some(EnemyKind::Hunter),
            "brute" => Some(EnemyKind::Brute),
            _ => None,
        }
    }
}

#[derive(Debug, Clone)]
pub struct Enemy {
    pub id: u32,
    pub kind: EnemyKind,
    pub score: f64,
    pub radius: f64,
    pub hp: f64,
    pub max_hp: f64,
    pub speed: f64,
    pub damage: f64,
    pub sides: u32,
    pub x: f64,
    pub y: f64,
    pub age: f64,
    pub seed: f64,
    pub wobble: f64,
    pub wobble_rate: f64,
    pub hit: f64,
    pub role: EnemyRole,
    pub contact_timer: f64,
    pub contact_cooldown: f64,
}

impl Enemy {
    pub fn as_circle(&self) -> CircleRef {
        CircleRef { x: self.x, y: self.y, radius: self.radius }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BulletSource {
    Player,
    Drone,
    Chain,
}

#[derive(Debug, Clone)]
pub struct Bullet {
    pub id: u32,
    pub x: f64,
    pub y: f64,
    pub vx: f64,
    pub vy: f64,
    pub radius: f64,
    pub damage: f64,
    pub pierce: i32,
    pub life: f64,
    pub trail: f64,
    pub hit_ids: Vec<u32>,
    pub source: BulletSource,
    pub chain_remaining: u32,
}

impl Bullet {
    pub fn as_circle(&self) -> CircleRef {
        CircleRef { x: self.x, y: self.y, radius: self.radius }
    }

    pub fn has_hit(&self, id: u32) -> bool {
        self.hit_ids.iter().any(|&v| v == id)
    }
}

#[derive(Debug, Clone)]
pub struct ExperienceOrb {
    pub id: u32,
    pub x: f64,
    pub y: f64,
    pub vx: f64,
    pub vy: f64,
    pub radius: f64,
    pub value: f64,
    pub age: f64,
    pub magnetized: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PowerupKind {
    Heart,
    Magnet,
    Bomb,
}

impl PowerupKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            PowerupKind::Heart => "heart",
            PowerupKind::Magnet => "magnet",
            PowerupKind::Bomb => "bomb",
        }
    }
}

#[derive(Debug, Clone)]
pub struct PowerupOrb {
    pub id: u32,
    pub x: f64,
    pub y: f64,
    pub vx: f64,
    pub vy: f64,
    pub radius: f64,
    pub kind: PowerupKind,
    pub age: f64,
    pub life: f64,
}

#[derive(Debug, Clone)]
pub struct ChestEntity {
    pub id: u32,
    pub x: f64,
    pub y: f64,
    pub vx: f64,
    pub vy: f64,
    pub radius: f64,
    pub age: f64,
}

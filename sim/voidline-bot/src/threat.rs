use crate::snapshot::{EnemySnapshot, OrbSnapshot, Snapshot};
use std::f64::consts::TAU;

pub const ARENA_W: f64 = 1600.0;
pub const ARENA_H: f64 = 1100.0;

#[derive(Debug, Clone, Copy)]
pub struct Candidate {
    pub dx: f64,
    pub dy: f64,
    pub score: f64,
}

pub fn candidates(snapshot: &Snapshot) -> Vec<Candidate> {
    let mut out = Vec::with_capacity(24);
    for i in 0..24 {
        let angle = (i as f64 / 24.0) * TAU;
        let dx = angle.cos();
        let dy = angle.sin();
        out.push(Candidate {
            dx,
            dy,
            score: score_direction(snapshot, dx, dy),
        });
    }
    out.sort_by(|a, b| b.score.total_cmp(&a.score));
    out
}

pub fn score_direction(snapshot: &Snapshot, dx: f64, dy: f64) -> f64 {
    let p = &snapshot.player;
    let next_x = clamp(p.x + dx * p.speed * 0.25, 18.0, ARENA_W - 18.0);
    let next_y = clamp(p.y + dy * p.speed * 0.25, 18.0, ARENA_H - 18.0);
    let mut score = 0.0;

    for enemy in &snapshot.enemies {
        score -=
            enemy_threat(enemy, p.x, p.y, next_x, next_y) * if enemy.is_boss { 1.4 } else { 1.0 };
    }

    score += xp_attraction(&snapshot.orbs, next_x, next_y);
    score += range_keeping(snapshot, next_x, next_y);
    score -= boundary_penalty(next_x, next_y);
    score
}

fn enemy_threat(enemy: &EnemySnapshot, px: f64, py: f64, nx: f64, ny: f64) -> f64 {
    let dist_now = ((enemy.x - px).powi(2) + (enemy.y - py).powi(2)).sqrt();
    let dist_next = ((enemy.x - nx).powi(2) + (enemy.y - ny).powi(2)).sqrt();
    let closing = (dist_now - dist_next).max(0.0) * 4.0;
    let contact = enemy.radius + 10.0;
    let time_to_impact = ((dist_next - contact).max(1.0) / (enemy.speed + closing + 1.0)).max(0.05);
    enemy.damage / (time_to_impact * time_to_impact)
}

fn xp_attraction(orbs: &[OrbSnapshot], x: f64, y: f64) -> f64 {
    orbs.iter()
        .filter(|orb| orb.value >= 2.0)
        .filter_map(|orb| {
            let dist = ((orb.x - x).powi(2) + (orb.y - y).powi(2)).sqrt();
            (dist <= 500.0).then_some((orb.value * 9.0) / (dist + 30.0))
        })
        .sum()
}

fn range_keeping(snapshot: &Snapshot, x: f64, y: f64) -> f64 {
    let mut count = 0.0;
    let mut cx = 0.0;
    let mut cy = 0.0;
    for enemy in &snapshot.enemies {
        let dist = ((enemy.x - x).powi(2) + (enemy.y - y).powi(2)).sqrt();
        if dist <= snapshot.player.range * 1.35 {
            count += 1.0;
            cx += enemy.x;
            cy += enemy.y;
        }
    }
    if count == 0.0 {
        return 0.0;
    }
    cx /= count;
    cy /= count;
    let dist = ((cx - x).powi(2) + (cy - y).powi(2)).sqrt();
    let ideal = snapshot.player.range * 0.85;
    -((dist - ideal).abs() / 18.0).min(18.0)
}

pub fn boundary_penalty(x: f64, y: f64) -> f64 {
    let edge = x.min(ARENA_W - x).min(y).min(ARENA_H - y);
    if edge <= 30.0 {
        1_000.0
    } else {
        180.0 / (edge - 30.0)
    }
}

fn clamp(v: f64, lo: f64, hi: f64) -> f64 {
    v.max(lo).min(hi)
}

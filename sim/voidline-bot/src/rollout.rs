use crate::snapshot::{EnemySnapshot, Snapshot};
use crate::threat::{boundary_penalty, Candidate, ARENA_H, ARENA_W};

pub fn choose_with_rollout(snapshot: &Snapshot, candidates: &[Candidate]) -> Candidate {
    let mut best = candidates[0];
    let mut best_score = f64::NEG_INFINITY;
    for candidate in candidates.iter().take(5) {
        let score = rollout_score(snapshot, *candidate);
        if score > best_score {
            best_score = score;
            best = *candidate;
        }
    }
    best
}

fn rollout_score(snapshot: &Snapshot, candidate: Candidate) -> f64 {
    let dt = 1.0 / 60.0;
    let mut px = snapshot.player.x;
    let mut py = snapshot.player.y;
    let mut enemies = snapshot.enemies.clone();
    let mut damage = 0.0;
    let mut min_gap = f64::INFINITY;

    for _ in 0..15 {
        px = (px + candidate.dx * snapshot.player.speed * dt)
            .max(18.0)
            .min(ARENA_W - 18.0);
        py = (py + candidate.dy * snapshot.player.speed * dt)
            .max(18.0)
            .min(ARENA_H - 18.0);
        for enemy in &mut enemies {
            seek(enemy, px, py, dt);
            let dist = ((enemy.x - px).powi(2) + (enemy.y - py).powi(2)).sqrt();
            let gap = dist - enemy.radius - 9.0;
            min_gap = min_gap.min(gap);
            if gap <= 0.0 {
                damage += enemy.damage;
            }
        }
    }

    candidate.score - damage * 45.0 + min_gap.min(80.0) * 0.8 - boundary_penalty(px, py)
}

fn seek(enemy: &mut EnemySnapshot, px: f64, py: f64, dt: f64) {
    let dx = px - enemy.x;
    let dy = py - enemy.y;
    let dist = (dx * dx + dy * dy).sqrt();
    if dist > 0.0 {
        enemy.x += (dx / dist) * enemy.speed * dt;
        enemy.y += (dy / dist) * enemy.speed * dt;
    }
}

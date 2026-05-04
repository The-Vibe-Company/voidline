use crate::snapshot::{EnemyBulletSnapshot, EnemySnapshot, Snapshot};
use crate::threat::{boundary_penalty, Candidate, ARENA_H, ARENA_W, PLAYER_RADIUS};

const ROLLOUT_TICKS: usize = 30;
const ROLLOUT_DT: f64 = 1.0 / 60.0;

pub fn choose_with_rollout(snapshot: &Snapshot, candidates: &[Candidate]) -> Candidate {
    let mut best = candidates[0];
    let mut best_score = f64::NEG_INFINITY;
    // More candidates = more compute but better movement. 10 keeps us fast.
    for candidate in candidates.iter().take(10) {
        let score = rollout_score(snapshot, *candidate);
        if score > best_score {
            best_score = score;
            best = *candidate;
        }
    }
    best
}

/// Public wrapper — used by the champion to score a specific direction
/// (e.g. the previous-tick direction for hysteresis).
pub fn rollout_score_for(snapshot: &Snapshot, candidate: Candidate) -> f64 {
    rollout_score(snapshot, candidate)
}

fn rollout_score(snapshot: &Snapshot, candidate: Candidate) -> f64 {
    let mut px = snapshot.player.x;
    let mut py = snapshot.player.y;
    let mut enemies = snapshot.enemies.clone();
    let mut bullets = snapshot.enemy_bullets.clone();
    let mut contact_damage = 0.0;
    let mut bullet_damage = 0.0;
    let mut min_gap = f64::INFINITY;
    let max_hp = snapshot.max_hp.max(1.0);
    // Take damage more seriously when the player is already low.
    let hp_pressure = 1.0 + 1.5 * (1.0 - (snapshot.hp / max_hp).clamp(0.0, 1.0));

    for _ in 0..ROLLOUT_TICKS {
        px = (px + candidate.dx * snapshot.player.speed * ROLLOUT_DT)
            .max(18.0)
            .min(ARENA_W - 18.0);
        py = (py + candidate.dy * snapshot.player.speed * ROLLOUT_DT)
            .max(18.0)
            .min(ARENA_H - 18.0);
        for enemy in &mut enemies {
            seek(enemy, px, py, ROLLOUT_DT);
            let dist = ((enemy.x - px).powi(2) + (enemy.y - py).powi(2)).sqrt();
            let gap = dist - enemy.radius - PLAYER_RADIUS;
            if gap < min_gap {
                min_gap = gap;
            }
            if gap <= 0.0 {
                contact_damage += enemy.damage;
            }
        }
        for bullet in &mut bullets {
            if bullet.life <= 0.0 {
                continue;
            }
            bullet.x += bullet.vx * ROLLOUT_DT;
            bullet.y += bullet.vy * ROLLOUT_DT;
            bullet.life -= ROLLOUT_DT;
            let dist = ((bullet.x - px).powi(2) + (bullet.y - py).powi(2)).sqrt();
            let gap = dist - bullet.radius - PLAYER_RADIUS;
            if gap <= 0.0 {
                bullet_damage += bullet.damage;
                bullet.life = 0.0; // a hit consumes the bullet in our model
            }
        }
    }

    let total_damage = (contact_damage + bullet_damage) * hp_pressure;
    candidate.score - total_damage * 55.0 + min_gap.min(80.0) * 0.8 - boundary_penalty(px, py)
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

// Re-export so champion.rs can reuse our bullet model if needed in the future.
#[allow(dead_code)]
pub fn bullet_will_hit(bullet: &EnemyBulletSnapshot, px: f64, py: f64) -> bool {
    let mut life = bullet.life;
    let mut bx = bullet.x;
    let mut by = bullet.y;
    while life > 0.0 {
        bx += bullet.vx * ROLLOUT_DT;
        by += bullet.vy * ROLLOUT_DT;
        life -= ROLLOUT_DT;
        let dist = ((bx - px).powi(2) + (by - py).powi(2)).sqrt();
        if dist <= bullet.radius + PLAYER_RADIUS {
            return true;
        }
    }
    false
}

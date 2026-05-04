use crate::snapshot::{
    AttackTelegraphSnapshot, EnemyBulletSnapshot, EnemySnapshot, OrbSnapshot, Snapshot,
    SpawnIndicatorSnapshot,
};
use std::f64::consts::TAU;

pub const ARENA_W: f64 = 1600.0;
pub const ARENA_H: f64 = 1100.0;
pub const PLAYER_RADIUS: f64 = 9.0;

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
        score -= attack_state_threat(enemy, next_x, next_y);
    }

    for bullet in &snapshot.enemy_bullets {
        score -= bullet_threat(bullet, next_x, next_y);
    }

    for telegraph in &snapshot.attack_telegraphs {
        score -= telegraph_threat(telegraph, next_x, next_y);
    }

    for indicator in &snapshot.spawn_indicators {
        score -= spawn_indicator_threat(indicator, next_x, next_y);
    }

    // Boss volley pre-dodge: when the boss is about to fire, prefer
    // perpendicular motion to its line of sight.
    if let Some(boss) = snapshot.enemies.iter().find(|e| e.is_boss) {
        if let Some(timer) = boss.boss_shot_timer {
            if timer >= 0.0 && timer <= 0.7 {
                score -= boss_volley_anticipation(boss, p.x, p.y, dx, dy, next_x, next_y, timer);
            }
        }
    }

    let boss_present = snapshot.enemies.iter().any(|e| e.is_boss);
    score += xp_attraction(&snapshot.orbs, next_x, next_y, boss_present);
    score += range_keeping(snapshot, next_x, next_y);
    score -= boundary_penalty(next_x, next_y);
    score
}

/// Score an incoming projectile by its closest predicted approach over its
/// remaining life. The bot has no direct dodge timing — it just needs to
/// strongly prefer directions that push the future closest-approach above the
/// hit radius.
pub fn bullet_threat(bullet: &EnemyBulletSnapshot, nx: f64, ny: f64) -> f64 {
    // How long this bullet stays alive (capped to a useful planning horizon).
    let horizon = bullet.life.min(0.8).max(0.0);
    if horizon <= 0.0 {
        return 0.0;
    }
    // Sample 6 points along the trajectory; keep min distance to next position.
    let samples = 6;
    let mut min_gap = f64::INFINITY;
    for i in 0..=samples {
        let t = horizon * (i as f64 / samples as f64);
        let bx = bullet.x + bullet.vx * t;
        let by = bullet.y + bullet.vy * t;
        let dist = ((bx - nx).powi(2) + (by - ny).powi(2)).sqrt();
        let gap = dist - bullet.radius - PLAYER_RADIUS;
        if gap < min_gap {
            min_gap = gap;
        }
    }
    if min_gap <= 0.0 {
        // Direct hit predicted: huge penalty proportional to damage.
        bullet.damage * 6.0
    } else if min_gap < 40.0 {
        // Close call: scaled penalty.
        bullet.damage * (40.0 - min_gap) / 40.0 * 1.5
    } else {
        0.0
    }
}

/// Penalize positions inside an attack telegraph zone, scaled by how soon it
/// will trigger. Stronger signal as life→0.
pub fn telegraph_threat(tel: &AttackTelegraphSnapshot, nx: f64, ny: f64) -> f64 {
    if tel.life <= 0.0 {
        return 0.0;
    }
    // Distance from (nx,ny) to the telegraph's danger area.
    let inside_dist = match tel.shape.as_str() {
        "circle" => {
            let d = ((tel.x - nx).powi(2) + (tel.y - ny).powi(2)).sqrt();
            d - tel.radius
        }
        "line" => {
            // Line is centered at (x,y) with given angle and length.
            let cos = tel.angle.cos();
            let sin = tel.angle.sin();
            let half = tel.length * 0.5;
            // Point in line-local coordinates.
            let lx = (nx - tel.x) * cos + (ny - tel.y) * sin;
            let ly = -(nx - tel.x) * sin + (ny - tel.y) * cos;
            let lx_clamped = lx.clamp(-half, half);
            let dx = lx - lx_clamped;
            (dx * dx + ly * ly).sqrt() - tel.radius
        }
        _ => f64::INFINITY,
    };
    // Imminence factor: low life → high urgency (0..1).
    let imminence = if tel.max_life > 0.0 {
        1.0 - (tel.life / tel.max_life).clamp(0.0, 1.0)
    } else {
        0.5
    };
    if inside_dist <= 0.0 {
        // Standing inside the predicted hit zone.
        80.0 + 220.0 * imminence
    } else if inside_dist < 50.0 {
        (50.0 - inside_dist) * (0.6 + imminence * 1.4)
    } else {
        0.0
    }
}

/// Spawn indicators mark where a new enemy will appear. Avoid the tile so
/// the new enemy doesn't immediately contact-damage the player.
pub fn spawn_indicator_threat(ind: &SpawnIndicatorSnapshot, nx: f64, ny: f64) -> f64 {
    if ind.life <= 0.0 {
        return 0.0;
    }
    let dist = ((ind.x - nx).powi(2) + (ind.y - ny).powi(2)).sqrt();
    let danger = ind.radius + 35.0;
    if dist >= danger {
        return 0.0;
    }
    let weight = if ind.is_boss { 90.0 } else { 35.0 };
    weight * (1.0 - dist / danger)
}

/// Stingers in windup will dash to (attackTargetX, attackTargetY) — that's a
/// future-collision zone. Sentinels in windup are about to fire a projectile
/// from their position. Both deserve elevated threat at the predicted impact.
pub fn attack_state_threat(enemy: &EnemySnapshot, nx: f64, ny: f64) -> f64 {
    if enemy.attack_state != "windup" {
        return 0.0;
    }
    match enemy.kind.as_str() {
        "stinger" => {
            // Treat the dash target as a hot zone proportional to progress.
            let dist = ((enemy.attack_target_x - nx).powi(2)
                + (enemy.attack_target_y - ny).powi(2))
            .sqrt();
            let danger = enemy.radius + 60.0;
            if dist >= danger {
                return 0.0;
            }
            (1.0 - dist / danger) * (40.0 + 80.0 * enemy.attack_progress.clamp(0.0, 1.0))
        }
        "sentinel" => {
            // Sentinel locked onto a position and will fire there. The bullet
            // travels at ~220 px/s with a small radius — basically need to
            // step out of the line. Penalize the entire shot corridor and
            // a generous perpendicular margin.
            let dx = enemy.attack_target_x - enemy.x;
            let dy = enemy.attack_target_y - enemy.y;
            let len = (dx * dx + dy * dy).sqrt().max(1.0);
            let nxv = dx / len;
            let nyv = dy / len;
            let rel_x = nx - enemy.x;
            let rel_y = ny - enemy.y;
            let along = rel_x * nxv + rel_y * nyv;
            let perp = (rel_x * (-nyv) + rel_y * nxv).abs();
            // Extend corridor past the target — bullets keep going.
            if along < 0.0 || along > len + 120.0 || perp > 35.0 {
                return 0.0;
            }
            (1.0 - perp / 35.0) * 22.0
        }
        _ => 0.0,
    }
}

/// Penalize directions that don't keep the player moving perpendicular to
/// the boss when a volley is imminent (timer ≤ 0.7s). Sidestepping is the
/// only way to avoid a 5-projectile fan aimed at the current position.
fn boss_volley_anticipation(
    boss: &EnemySnapshot,
    px: f64,
    py: f64,
    dx: f64,
    dy: f64,
    nx: f64,
    ny: f64,
    timer: f64,
) -> f64 {
    let to_boss_x = boss.x - px;
    let to_boss_y = boss.y - py;
    let dist = (to_boss_x * to_boss_x + to_boss_y * to_boss_y).sqrt().max(1.0);
    let lx = to_boss_x / dist;
    let ly = to_boss_y / dist;
    // Component of intended velocity perpendicular vs along boss line.
    let along = dx * lx + dy * ly;
    let perp = (dx * (-ly) + dy * lx).abs();
    // Strong reward for high perpendicular component, decreasing with timer.
    let urgency = ((0.7 - timer).max(0.0) / 0.7).min(1.0);
    // We RETURN a penalty (subtracted by caller). Negative here = bonus.
    let mut penalty = -perp * 18.0 * urgency;
    // Heavy penalty for moving directly along the line (toward or away).
    penalty += along.abs() * 12.0 * urgency;
    // Also: if next position is closer to original boss line than current, pay.
    let next_to_boss_x = boss.x - nx;
    let next_to_boss_y = boss.y - ny;
    let next_dist = (next_to_boss_x * next_to_boss_x + next_to_boss_y * next_to_boss_y).sqrt();
    // Prefer to maintain or grow distance during volley window.
    if next_dist < dist {
        penalty += (dist - next_dist) * 0.6 * urgency;
    }
    penalty
}

fn enemy_threat(enemy: &EnemySnapshot, px: f64, py: f64, nx: f64, ny: f64) -> f64 {
    let dist_now = ((enemy.x - px).powi(2) + (enemy.y - py).powi(2)).sqrt();
    let dist_next = ((enemy.x - nx).powi(2) + (enemy.y - ny).powi(2)).sqrt();
    let closing = (dist_now - dist_next).max(0.0) * 4.0;
    let contact = enemy.radius + 10.0;
    let time_to_impact = ((dist_next - contact).max(1.0) / (enemy.speed + closing + 1.0)).max(0.05);
    enemy.damage / (time_to_impact * time_to_impact)
}

fn xp_attraction(orbs: &[OrbSnapshot], x: f64, y: f64, boss_present: bool) -> f64 {
    // During boss fights, orbs are a distraction — limit pull to nearby orbs
    // and lower the weight so positional safety dominates.
    let (max_dist, weight) = if boss_present {
        (180.0, 3.0)
    } else {
        (500.0, 9.0)
    };
    orbs.iter()
        .filter(|orb| orb.value >= 2.0)
        .filter_map(|orb| {
            let dist = ((orb.x - x).powi(2) + (orb.y - y).powi(2)).sqrt();
            (dist <= max_dist).then_some((orb.value * weight) / (dist + 30.0))
        })
        .sum()
}

fn range_keeping(snapshot: &Snapshot, x: f64, y: f64) -> f64 {
    // Boss-aware: when a boss is on the field, kite from the boss specifically
    // rather than the centroid of all enemies (minions are noise).
    if let Some(boss) = snapshot.enemies.iter().find(|e| e.is_boss) {
        let dist = ((boss.x - x).powi(2) + (boss.y - y).powi(2)).sqrt();
        // Stay at ~90% of weapon range from the boss: just inside DPS, just
        // outside contact / boss volley spread.
        let ideal = snapshot.player.range.max(220.0) * 0.9;
        return -((dist - ideal).abs() / 14.0).min(28.0);
    }
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
        200.0 / (edge - 30.0)
    }
}

fn clamp(v: f64, lo: f64, hi: f64) -> f64 {
    v.max(lo).min(hi)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bullet_at(x: f64, y: f64, vx: f64, vy: f64) -> EnemyBulletSnapshot {
        EnemyBulletSnapshot {
            id: 1,
            x,
            y,
            vx,
            vy,
            radius: 6.0,
            damage: 18.0,
            life: 1.0,
        }
    }

    #[test]
    fn bullet_aimed_at_player_is_dangerous() {
        // Bullet at (0, 0) flying right at 240 px/s, player at (240, 0).
        let bullet = bullet_at(0.0, 0.0, 240.0, 0.0);
        let direct = bullet_threat(&bullet, 240.0, 0.0);
        let sidestep = bullet_threat(&bullet, 240.0, 80.0);
        assert!(direct > sidestep, "head-on threat must exceed sidestep");
        assert!(direct > 0.0);
    }

    #[test]
    fn bullet_flying_away_is_safe() {
        let bullet = bullet_at(0.0, 0.0, -240.0, 0.0); // moving left
        let threat = bullet_threat(&bullet, 240.0, 0.0); // player to the right
        assert_eq!(threat, 0.0);
    }

    #[test]
    fn dead_bullet_is_safe() {
        let mut bullet = bullet_at(0.0, 0.0, 240.0, 0.0);
        bullet.life = 0.0;
        assert_eq!(bullet_threat(&bullet, 100.0, 0.0), 0.0);
    }
}

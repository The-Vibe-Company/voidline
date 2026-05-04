use crate::rollout::{choose_with_rollout, rollout_score_for};
use crate::snapshot::Snapshot;
use crate::threat::{candidates, score_direction, Candidate, PLAYER_RADIUS};

#[derive(Debug, Clone, Copy)]
pub struct Decision {
    pub pointer_x: f64,
    pub pointer_y: f64,
    pub dx: f64,
    pub dy: f64,
}

#[derive(Debug, Default)]
pub struct Champion {
    last_dir: Option<(f64, f64)>,
}

impl Champion {
    pub fn decide(&mut self, snapshot: &Snapshot) -> Decision {
        if let Some((dx, dy)) = emergency_escape(snapshot) {
            self.last_dir = Some((dx, dy));
            return pointer(snapshot, dx, dy);
        }

        if let Some(orb) = nearest_close_orb(snapshot) {
            let dx = orb.0 - snapshot.player.x;
            let dy = orb.1 - snapshot.player.y;
            let len = (dx * dx + dy * dy).sqrt().max(1.0);
            let nx = dx / len;
            let ny = dy / len;
            self.last_dir = Some((nx, ny));
            return pointer(snapshot, nx, ny);
        }

        let mut ranked = candidates(snapshot);
        // Inject the last direction as a candidate with a small stickiness
        // bonus — momentum/kite consistency beats theoretical micro-optimums.
        if let Some((px_dir, py_dir)) = self.last_dir {
            let base = score_direction(snapshot, px_dir, py_dir);
            let dampened = Candidate {
                dx: px_dir,
                dy: py_dir,
                score: base + 4.0,
            };
            ranked.push(dampened);
            ranked.sort_by(|a, b| b.score.total_cmp(&a.score));
        }
        let chosen = if ranked.is_empty() {
            Candidate {
                dx: 1.0,
                dy: 0.0,
                score: 0.0,
            }
        } else {
            // Hysteresis: only switch from last_dir if the rollout-best
            // beats the last direction's rollout score by at least a margin.
            let new_best = choose_with_rollout(snapshot, &ranked);
            if let Some((lx, ly)) = self.last_dir {
                let last_candidate = Candidate {
                    dx: lx,
                    dy: ly,
                    score: score_direction(snapshot, lx, ly),
                };
                let last_full = rollout_score_for(snapshot, last_candidate);
                let new_full = rollout_score_for(snapshot, new_best);
                if new_full - last_full < 8.0 {
                    last_candidate
                } else {
                    new_best
                }
            } else {
                new_best
            }
        };
        self.last_dir = Some((chosen.dx, chosen.dy));
        pointer(snapshot, chosen.dx, chosen.dy)
    }
}

fn emergency_escape(snapshot: &Snapshot) -> Option<(f64, f64)> {
    let mut vx = 0.0;
    let mut vy = 0.0;
    let mut active = false;
    let boss_present = snapshot.enemies.iter().any(|e| e.is_boss);
    for enemy in &snapshot.enemies {
        let dx = snapshot.player.x - enemy.x;
        let dy = snapshot.player.y - enemy.y;
        let dist = (dx * dx + dy * dy).sqrt().max(1.0);
        let trigger = if enemy.is_boss {
            380.0
        } else if boss_present {
            // Minions during a boss fight are noise — only flee if very close.
            110.0
        } else {
            150.0
        };
        if dist > trigger + enemy.radius {
            continue;
        }
        active = true;
        let gap = (dist - enemy.radius - PLAYER_RADIUS).max(8.0);
        let weight = enemy.damage * if enemy.is_boss { 5.0 } else { 1.0 } / (gap * gap);
        vx += (dx / dist) * weight;
        vy += (dy / dist) * weight;
    }

    // An incoming projectile that will plausibly hit also triggers an escape.
    for bullet in &snapshot.enemy_bullets {
        let to_player_x = snapshot.player.x - bullet.x;
        let to_player_y = snapshot.player.y - bullet.y;
        let dist = (to_player_x * to_player_x + to_player_y * to_player_y)
            .sqrt()
            .max(1.0);
        let bullet_speed = (bullet.vx * bullet.vx + bullet.vy * bullet.vy).sqrt();
        if bullet_speed < 30.0 || dist > 280.0 {
            continue;
        }
        // Push perpendicular to the bullet velocity (sidestep) rather than
        // away from it, since head-on backpedal rarely beats a fast bullet.
        let nvx = -bullet.vy / bullet_speed;
        let nvy = bullet.vx / bullet_speed;
        // Pick the perpendicular direction that increases distance from the bullet.
        let dot = nvx * to_player_x + nvy * to_player_y;
        let sign = if dot >= 0.0 { 1.0 } else { -1.0 };
        let urgency = bullet.damage / (dist + 30.0);
        vx += sign * nvx * urgency * 8.0;
        vy += sign * nvy * urgency * 8.0;
        active = true;
    }

    if !active {
        return None;
    }

    let edge = 120.0;
    if snapshot.player.x < edge {
        vx += (edge - snapshot.player.x) / edge;
    }
    if snapshot.player.x > 1600.0 - edge {
        vx -= (snapshot.player.x - (1600.0 - edge)) / edge;
    }
    if snapshot.player.y < edge {
        vy += (edge - snapshot.player.y) / edge;
    }
    if snapshot.player.y > 1100.0 - edge {
        vy -= (snapshot.player.y - (1100.0 - edge)) / edge;
    }

    let len = (vx * vx + vy * vy).sqrt();
    (len > 0.0001).then_some((vx / len, vy / len))
}

fn nearest_close_orb(snapshot: &Snapshot) -> Option<(f64, f64)> {
    let max_hp = snapshot.max_hp.max(1.0);
    let hp_ratio = (snapshot.hp / max_hp).clamp(0.0, 1.0);
    // Below 40% hp, never sidetrack for orbs — survival first.
    if hp_ratio < 0.4 {
        return None;
    }
    // Tighten the safety radius when a boss is on the field or hp is mid-low.
    let boss_present = snapshot.enemies.iter().any(|e| e.is_boss);
    let danger_radius = if boss_present || hp_ratio < 0.7 {
        140.0
    } else {
        95.0
    };
    let enemy_danger = snapshot.enemies.iter().any(|enemy| {
        let dist =
            ((enemy.x - snapshot.player.x).powi(2) + (enemy.y - snapshot.player.y).powi(2)).sqrt();
        dist < enemy.radius + danger_radius
    });
    let bullet_danger = snapshot.enemy_bullets.iter().any(|bullet| {
        let dist = ((bullet.x - snapshot.player.x).powi(2)
            + (bullet.y - snapshot.player.y).powi(2))
        .sqrt();
        dist < 220.0
    });
    if enemy_danger || bullet_danger {
        return None;
    }
    let pickup_radius = if boss_present { 45.0 } else { 60.0 };
    snapshot
        .orbs
        .iter()
        .filter_map(|orb| {
            let dist =
                ((orb.x - snapshot.player.x).powi(2) + (orb.y - snapshot.player.y).powi(2)).sqrt();
            (dist < pickup_radius).then_some((dist, orb.x, orb.y))
        })
        .min_by(|a, b| a.0.total_cmp(&b.0))
        .map(|(_, x, y)| (x, y))
}

fn pointer(snapshot: &Snapshot, dx: f64, dy: f64) -> Decision {
    Decision {
        pointer_x: snapshot.player.x + dx * 1000.0,
        pointer_y: snapshot.player.y + dy * 1000.0,
        dx,
        dy,
    }
}

use crate::rollout::choose_with_rollout;
use crate::snapshot::Snapshot;
use crate::threat::{candidates, Candidate};

#[derive(Debug, Clone, Copy)]
pub struct Decision {
    pub pointer_x: f64,
    pub pointer_y: f64,
    pub dx: f64,
    pub dy: f64,
}

#[derive(Debug, Default)]
pub struct Champion;

impl Champion {
    pub fn decide(&self, snapshot: &Snapshot) -> Decision {
        if let Some((dx, dy)) = emergency_escape(snapshot) {
            return pointer(snapshot, dx, dy);
        }

        if let Some(orb) = nearest_close_orb(snapshot) {
            let dx = orb.0 - snapshot.player.x;
            let dy = orb.1 - snapshot.player.y;
            let len = (dx * dx + dy * dy).sqrt().max(1.0);
            return pointer(snapshot, dx / len, dy / len);
        }

        let ranked = candidates(snapshot);
        let chosen = if ranked.is_empty() {
            Candidate {
                dx: 1.0,
                dy: 0.0,
                score: 0.0,
            }
        } else {
            choose_with_rollout(snapshot, &ranked)
        };
        pointer(snapshot, chosen.dx, chosen.dy)
    }
}

fn emergency_escape(snapshot: &Snapshot) -> Option<(f64, f64)> {
    let mut vx = 0.0;
    let mut vy = 0.0;
    let mut active = false;
    for enemy in &snapshot.enemies {
        let dx = snapshot.player.x - enemy.x;
        let dy = snapshot.player.y - enemy.y;
        let dist = (dx * dx + dy * dy).sqrt().max(1.0);
        let trigger = if enemy.is_boss { 320.0 } else { 150.0 };
        if dist > trigger + enemy.radius {
            continue;
        }
        active = true;
        let gap = (dist - enemy.radius - 9.0).max(8.0);
        let weight = enemy.damage * if enemy.is_boss { 4.0 } else { 1.0 } / (gap * gap);
        vx += (dx / dist) * weight;
        vy += (dy / dist) * weight;
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
    let danger = snapshot.enemies.iter().any(|enemy| {
        let dist =
            ((enemy.x - snapshot.player.x).powi(2) + (enemy.y - snapshot.player.y).powi(2)).sqrt();
        dist < enemy.radius + 95.0
    });
    if danger {
        return None;
    }
    snapshot
        .orbs
        .iter()
        .filter_map(|orb| {
            let dist =
                ((orb.x - snapshot.player.x).powi(2) + (orb.y - snapshot.player.y).powi(2)).sqrt();
            (dist < 60.0).then_some((dist, orb.x, orb.y))
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

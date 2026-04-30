//! Spatial grid used by the Rust runtime engine.
//!
//! Indexed by enemy index in the parent `Vec<Enemy>` rather than by reference
//! to keep the borrow-checker happy while preserving deterministic iteration
//! order.

use std::collections::HashMap;

use crate::entities::Enemy;
use crate::math::distance_sq;

#[derive(Debug, Clone)]
pub struct SpatialGrid {
    cell_size: f64,
    buckets: HashMap<i64, Vec<usize>>,
}

impl SpatialGrid {
    pub fn new(cell_size: f64) -> Self {
        Self {
            cell_size,
            buckets: HashMap::new(),
        }
    }

    pub fn clear(&mut self) {
        for bucket in self.buckets.values_mut() {
            bucket.clear();
        }
    }

    /// Mirrors `rebuild` in TS: clear then insert every item.
    pub fn rebuild(&mut self, enemies: &[Enemy]) {
        self.clear();
        for (idx, enemy) in enemies.iter().enumerate() {
            self.insert(idx, enemy.x, enemy.y);
        }
    }

    pub fn insert(&mut self, index: usize, x: f64, y: f64) {
        let cell_x = (x / self.cell_size).floor() as i64;
        let cell_y = (y / self.cell_size).floor() as i64;
        let key = cell_key(cell_x, cell_y);
        self.buckets.entry(key).or_default().push(index);
    }

    /// Visit indices in cells overlapping the query circle. Visitor returns
    /// `false` to stop iteration early (mirrors TS `false` return).
    pub fn visit_radius<F>(&self, x: f64, y: f64, radius: f64, mut visit: F)
    where
        F: FnMut(usize) -> bool,
    {
        let min_cx = ((x - radius) / self.cell_size).floor() as i64;
        let max_cx = ((x + radius) / self.cell_size).floor() as i64;
        let min_cy = ((y - radius) / self.cell_size).floor() as i64;
        let max_cy = ((y + radius) / self.cell_size).floor() as i64;

        for cy in min_cy..=max_cy {
            for cx in min_cx..=max_cx {
                if let Some(bucket) = self.buckets.get(&cell_key(cx, cy)) {
                    for &idx in bucket {
                        if !visit(idx) {
                            return;
                        }
                    }
                }
            }
        }
    }

    /// Returns the index of the nearest enemy within the search radius (or
    /// `None` if none found). Mirrors `nearest` in TS.
    pub fn nearest(&self, x: f64, y: f64, radius: f64, enemies: &[Enemy]) -> Option<usize> {
        let mut best_idx: Option<usize> = None;
        let mut best_dist_sq = radius * radius;
        self.visit_radius(x, y, radius, |idx| {
            let enemy = &enemies[idx];
            let d = distance_sq(x, y, enemy.x, enemy.y);
            if d < best_dist_sq {
                best_dist_sq = d;
                best_idx = Some(idx);
            }
            true
        });
        best_idx
    }
}

fn cell_key(cell_x: i64, cell_y: i64) -> i64 {
    // Mirror TS: ((cellX + 0x8000) & 0xffff) | (((cellY + 0x8000) & 0xffff) << 16)
    let cx = ((cell_x + 0x8000) as u32) & 0xffff;
    let cy = ((cell_y + 0x8000) as u32) & 0xffff;
    (cx as i64) | ((cy as i64) << 16)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::entities::{Enemy, EnemyKind, EnemyRole};

    fn enemy(id: u32, x: f64, y: f64, radius: f64) -> Enemy {
        Enemy {
            id,
            kind: EnemyKind::Scout,
            score: 0.0,
            radius,
            hp: 1.0,
            max_hp: 1.0,
            speed: 0.0,
            damage: 0.0,
            sides: 3,
            x,
            y,
            age: 0.0,
            seed: 0.0,
            wobble: 0.0,
            wobble_rate: 0.0,
            hit: 0.0,
            role: EnemyRole::Normal,
            contact_timer: 0.0,
            contact_cooldown: 0.0,
        }
    }

    #[test]
    fn nearest_finds_closest_within_radius() {
        let enemies = vec![
            enemy(1, 100.0, 100.0, 8.0),
            enemy(2, 300.0, 100.0, 8.0),
            enemy(3, 500.0, 500.0, 8.0),
        ];
        let mut grid = SpatialGrid::new(96.0);
        grid.rebuild(&enemies);
        let nearest = grid.nearest(110.0, 105.0, 200.0, &enemies);
        assert_eq!(nearest, Some(0));
    }

    #[test]
    fn visit_radius_visits_overlapping_cells_only() {
        let enemies = vec![enemy(1, 100.0, 100.0, 8.0), enemy(2, 1000.0, 1000.0, 8.0)];
        let mut grid = SpatialGrid::new(96.0);
        grid.rebuild(&enemies);
        let mut visited = vec![];
        grid.visit_radius(100.0, 100.0, 50.0, |idx| {
            visited.push(idx);
            true
        });
        assert_eq!(visited, vec![0]);
    }
}

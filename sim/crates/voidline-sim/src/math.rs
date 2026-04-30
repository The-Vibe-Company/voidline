//! Math utilities mirroring `src/utils.ts`.

pub fn clamp(value: f64, min: f64, max: f64) -> f64 {
    if value < min {
        min
    } else if value > max {
        max
    } else {
        value
    }
}

pub fn distance_sq(ax: f64, ay: f64, bx: f64, by: f64) -> f64 {
    let dx = ax - bx;
    let dy = ay - by;
    dx * dx + dy * dy
}

pub fn distance(ax: f64, ay: f64, bx: f64, by: f64) -> f64 {
    distance_sq(ax, ay, bx, by).sqrt()
}

#[derive(Debug, Clone, Copy)]
pub struct CircleRef {
    pub x: f64,
    pub y: f64,
    pub radius: f64,
}

pub fn circle_hit(a: CircleRef, b: CircleRef) -> bool {
    let r = a.radius + b.radius;
    distance_sq(a.x, a.y, b.x, b.y) <= r * r
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clamp_bounds() {
        assert_eq!(clamp(5.0, 0.0, 10.0), 5.0);
        assert_eq!(clamp(-1.0, 0.0, 10.0), 0.0);
        assert_eq!(clamp(11.0, 0.0, 10.0), 10.0);
    }

    #[test]
    fn distance_sq_matches_distance_squared() {
        let d = distance(0.0, 0.0, 3.0, 4.0);
        assert!((d - 5.0).abs() < 1e-12);
        assert!((distance_sq(0.0, 0.0, 3.0, 4.0) - 25.0).abs() < 1e-12);
    }

    #[test]
    fn circle_hit_overlap_detection() {
        let a = CircleRef { x: 0.0, y: 0.0, radius: 2.0 };
        let b = CircleRef { x: 3.0, y: 0.0, radius: 1.5 };
        assert!(circle_hit(a, b));
        let c = CircleRef { x: 10.0, y: 0.0, radius: 1.0 };
        assert!(!circle_hit(a, c));
    }
}

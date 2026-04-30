//! World viewport and arena bounds, mirroring `src/state.ts:world`.

#[derive(Debug, Clone, Copy)]
pub struct World {
    pub width: f64,
    pub height: f64,
    pub arena_width: f64,
    pub arena_height: f64,
    pub camera_x: f64,
    pub camera_y: f64,
    pub dpr: f64,
    pub time: f64,
    pub shake: f64,
}

impl Default for World {
    fn default() -> Self {
        Self {
            width: 1280.0,
            height: 720.0,
            arena_width: 3200.0,
            arena_height: 2200.0,
            camera_x: 0.0,
            camera_y: 0.0,
            dpr: 1.0,
            time: 0.0,
            shake: 0.0,
        }
    }
}

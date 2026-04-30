//! Headless input state for the simulation.

use std::collections::HashSet;

#[derive(Debug, Clone, Default)]
pub struct InputState {
    pub keys: HashSet<String>,
    pub pointer_x: f64,
    pub pointer_y: f64,
    pub pointer_inside: bool,
}

impl InputState {
    pub fn clear_keys(&mut self) {
        self.keys.clear();
    }

    pub fn press(&mut self, key: &str) {
        self.keys.insert(key.to_string());
    }
}

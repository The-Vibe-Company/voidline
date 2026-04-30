//! Headless Voidline gameplay simulation, ported from the TypeScript core.
//! Designed for parity with the TS sim (deterministic with the same seed).

pub mod math;
pub mod rng;

pub use math::{circle_hit, clamp, distance, distance_sq};
pub use rng::Mulberry32;

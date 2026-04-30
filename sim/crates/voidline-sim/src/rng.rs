//! Bit-exact port of `src/perf/rng.ts:mulberry32`.
//!
//! The reference TS implementation:
//! ```text
//! export function mulberry32(seed: number): () => number {
//!   let a = seed >>> 0;
//!   return function next(): number {
//!     a = (a + 0x6d2b79f5) >>> 0;
//!     let t = a;
//!     t = Math.imul(t ^ (t >>> 15), t | 1);
//!     t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
//!     return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
//!   };
//! }
//! ```
//!
//! `Math.imul(a, b)` in JS is the low 32 bits of the (signed) product —
//! `u32::wrapping_mul` produces the same bit pattern. All XOR/shift/add
//! operations on u32 in Rust match V8's i32 arithmetic at the bit level.

#[derive(Debug, Clone, Copy)]
pub struct Mulberry32 {
    state: u32,
}

impl Mulberry32 {
    pub fn new(seed: u32) -> Self {
        Self { state: seed }
    }

    pub fn next_f64(&mut self) -> f64 {
        self.state = self.state.wrapping_add(0x6d2b79f5);
        let mut t = self.state;
        t = (t ^ (t >> 15)).wrapping_mul(t | 1);
        t ^= t.wrapping_add((t ^ (t >> 7)).wrapping_mul(t | 61));
        ((t ^ (t >> 14)) as f64) / 4_294_967_296.0
    }
}

#[cfg(test)]
mod tests {
    use super::Mulberry32;

    /// First 8 values from JS `mulberry32(0)` captured via Node v22:
    /// ```sh
    /// node -e 'const m=(s)=>{let a=s>>>0;return()=>{a=(a+0x6d2b79f5)>>>0;\
    ///   let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);\
    ///   return((t^(t>>>14))>>>0)/4294967296};};\
    ///   const r=m(0);for(let i=0;i<8;i++)console.log(r().toFixed(17));'
    /// ```
    #[test]
    fn matches_ts_baseline_seed_zero() {
        let mut rng = Mulberry32::new(0);
        let expected = [
            0.26642920868471265,
            0.00032974570058286,
            0.22327202744781971,
            0.14620214793831110,
            0.46732782293111086,
            0.54504908272065222,
            0.61525138444267213,
            0.64898537984117866,
        ];
        for (i, want) in expected.iter().enumerate() {
            let got = rng.next_f64();
            assert!(
                (got - want).abs() < 1e-15,
                "mismatch at index {i}: rust={got}, ts={want}",
            );
        }
    }

    /// Spot-check a different seed to ensure the constant works for non-zero
    /// initial state. Captured the same way for seed=4242.
    #[test]
    fn matches_ts_baseline_seed_4242() {
        let mut rng = Mulberry32::new(4242);
        let expected = [
            0.54670613352209330,
            0.27860878920182586,
            0.93123691715300083,
        ];
        for (i, want) in expected.iter().enumerate() {
            let got = rng.next_f64();
            assert!(
                (got - want).abs() < 1e-15,
                "mismatch at index {i}: rust={got}, ts={want}",
            );
        }
    }

    #[test]
    fn deterministic_across_resets() {
        let mut a = Mulberry32::new(4242);
        let mut b = Mulberry32::new(4242);
        for _ in 0..200 {
            assert_eq!(a.next_f64().to_bits(), b.next_f64().to_bits());
        }
    }
}

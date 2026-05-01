//! Bit-near port of `src/game/roguelike.ts`.

use voidline_data::balance::Balance;

pub fn base_pressure_for_stage(balance: &Balance, stage: u32) -> u32 {
    let stage_offset = stage.saturating_sub(1);
    let pressure_offset = balance.bosses.pressure_offset_per_stage as u32;
    if stage_offset <= 1 {
        return 1 + stage_offset * pressure_offset;
    }
    let post_stage2_offset = (pressure_offset as f64
        * balance.bosses.post_stage2_pressure_offset_ratio)
        .round()
        .max(1.0) as u32;
    1 + pressure_offset + (stage_offset - 1) * post_stage2_offset
}

pub fn pressure_for_stage_elapsed(balance: &Balance, stage: u32, elapsed_seconds: f64) -> u32 {
    let elapsed_pressure = (elapsed_seconds.max(0.0) / 60.0).floor() as u32;
    base_pressure_for_stage(balance, stage) + elapsed_pressure
}

pub fn is_mini_boss_eligible_pressure(balance: &Balance, pressure: u32) -> bool {
    pressure >= balance.bosses.mini_boss.start_pressure as u32
}

pub fn should_spawn_mini_boss(
    balance: &Balance,
    pressure: u32,
    eligible_misses: u32,
    roll: f64,
) -> bool {
    if !is_mini_boss_eligible_pressure(balance, pressure) {
        return false;
    }
    if (eligible_misses + 1) as f64 >= balance.bosses.mini_boss.guarantee_after_eligible_pressures {
        return true;
    }
    roll < balance.bosses.mini_boss.spawn_chance
}

pub fn next_mini_boss_misses(
    balance: &Balance,
    pressure: u32,
    eligible_misses: u32,
    spawned: bool,
) -> u32 {
    if !is_mini_boss_eligible_pressure(balance, pressure) {
        return eligible_misses;
    }
    if spawned {
        0
    } else {
        eligible_misses + 1
    }
}

#[cfg(test)]
mod tests {
    use voidline_data::load_default;

    use super::{base_pressure_for_stage, pressure_for_stage_elapsed};

    #[test]
    fn pressure_is_stage_base_plus_elapsed_minutes() {
        let bundle = load_default().unwrap();
        let balance = &bundle.balance;
        assert_eq!(base_pressure_for_stage(balance, 1), 1);
        assert_eq!(
            base_pressure_for_stage(balance, 2),
            1 + balance.bosses.pressure_offset_per_stage as u32
        );
        assert_eq!(
            base_pressure_for_stage(balance, 3),
            1 + balance.bosses.pressure_offset_per_stage as u32
                + (balance.bosses.pressure_offset_per_stage
                    * balance.bosses.post_stage2_pressure_offset_ratio)
                    .round()
                    .max(1.0) as u32
        );
        assert_eq!(pressure_for_stage_elapsed(balance, 1, 0.0), 1);
        assert_eq!(pressure_for_stage_elapsed(balance, 1, 179.9), 3);
        assert_eq!(
            pressure_for_stage_elapsed(balance, 2, 360.0),
            base_pressure_for_stage(balance, 2) + 6
        );
    }
}

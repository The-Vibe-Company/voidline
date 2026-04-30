//! Bit-near port of `src/game/roguelike.ts`.

use voidline_data::balance::Balance;

pub fn starting_wave_for_stage(balance: &Balance, stage: u32) -> u32 {
    1 + (stage.saturating_sub(1)) * (balance.bosses.wave_offset_per_stage as u32)
}

pub fn boss_unlock_wave_for_stage(stage: u32) -> u32 {
    stage.max(1) * 10
}

pub fn is_mini_boss_eligible_wave(balance: &Balance, wave: u32) -> bool {
    wave >= balance.bosses.mini_boss.start_wave as u32
}

pub fn should_spawn_mini_boss(
    balance: &Balance,
    wave: u32,
    eligible_misses: u32,
    roll: f64,
) -> bool {
    if !is_mini_boss_eligible_wave(balance, wave) {
        return false;
    }
    if (eligible_misses + 1) as f64 >= balance.bosses.mini_boss.guarantee_after_eligible_waves {
        return true;
    }
    roll < balance.bosses.mini_boss.spawn_chance
}

pub fn next_mini_boss_misses(
    balance: &Balance,
    wave: u32,
    eligible_misses: u32,
    spawned: bool,
) -> u32 {
    if !is_mini_boss_eligible_wave(balance, wave) {
        return eligible_misses;
    }
    if spawned {
        0
    } else {
        eligible_misses + 1
    }
}

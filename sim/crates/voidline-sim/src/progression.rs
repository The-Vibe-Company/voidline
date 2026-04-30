//! XP collection + level-up, mirroring `src/game/progression.ts:collectExperience`.

use voidline_data::balance::Balance;

use crate::balance_curves::xp_to_next_level;
use crate::player::Player;
use crate::state::GameState;

pub fn collect_experience(
    balance: &Balance,
    state: &mut GameState,
    player: &mut Player,
    amount: u32,
) {
    state.xp += amount;
    state.score += (amount as f64) * 3.0;
    if player.traits.magnet_storm {
        player.magnet_storm_charge = (player.magnet_storm_charge + amount as f64).min(80.0);
    }

    while state.xp >= state.xp_target {
        state.xp -= state.xp_target;
        state.level += 1;
        state.xp_target = xp_to_next_level(balance, state.level) as u32;
        state.pending_upgrades += 1;
    }
}

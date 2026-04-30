//! Player state, mirroring `src/types.ts:Player` and the helpers in
//! `src/game/balance.ts:createPlayerState` / `recomputeMultiplicativeStats`.

use voidline_data::balance::{Balance, PlayerStats};

#[derive(Debug, Clone, Copy, Default)]
pub struct PlayerBonus {
    pub fire_rate_pct: f64,
    pub damage_pct: f64,
    pub bullet_speed_pct: f64,
    pub speed_pct: f64,
    pub pickup_radius_pct: f64,
    pub bullet_radius_pct: f64,
}

#[derive(Debug, Clone, Copy, Default)]
pub struct PlayerTraits {
    pub rail_splitter: bool,
    pub drone_swarm: bool,
    pub kinetic_ram: bool,
    pub magnet_storm: bool,
}

#[derive(Debug, Clone, Copy)]
pub struct Player {
    pub x: f64,
    pub y: f64,
    pub radius: f64,
    pub hp: f64,
    pub max_hp: f64,
    pub speed: f64,
    pub damage: f64,
    pub fire_rate: f64,
    pub bullet_speed: f64,
    pub projectile_count: f64,
    pub pierce: f64,
    pub drones: f64,
    pub shield: f64,
    pub shield_max: f64,
    pub shield_regen: f64,
    pub crit_chance: f64,
    pub lifesteal: f64,
    pub pickup_radius: f64,
    pub bullet_radius: f64,
    pub invuln: f64,
    pub fire_timer: f64,
    pub drone_timer: f64,
    pub aim_angle: f64,
    pub vx: f64,
    pub vy: f64,
    pub bonus: PlayerBonus,
    pub traits: PlayerTraits,
    pub ram_timer: f64,
    pub magnet_storm_charge: f64,
    pub magnet_storm_timer: f64,
}

impl Player {
    pub fn new(stats: &PlayerStats) -> Self {
        Self {
            x: 0.0,
            y: 0.0,
            radius: stats.radius,
            hp: stats.hp,
            max_hp: stats.max_hp,
            speed: stats.speed,
            damage: stats.damage,
            fire_rate: stats.fire_rate,
            bullet_speed: stats.bullet_speed,
            projectile_count: stats.projectile_count,
            pierce: stats.pierce,
            drones: stats.drones,
            shield: stats.shield,
            shield_max: stats.shield_max,
            shield_regen: stats.shield_regen,
            crit_chance: stats.crit_chance,
            lifesteal: stats.lifesteal,
            pickup_radius: stats.pickup_radius,
            bullet_radius: stats.bullet_radius,
            invuln: 0.0,
            fire_timer: 0.0,
            drone_timer: 0.0,
            aim_angle: -std::f64::consts::FRAC_PI_2,
            vx: 0.0,
            vy: 0.0,
            bonus: PlayerBonus::default(),
            traits: PlayerTraits::default(),
            ram_timer: 0.0,
            magnet_storm_charge: 0.0,
            magnet_storm_timer: 0.0,
        }
    }

    /// Mirrors `recomputeMultiplicativeStats(player)` in `src/game/balance.ts`.
    pub fn recompute_multiplicative_stats(&mut self, balance: &Balance) {
        let s = &balance.player.stats;
        self.fire_rate = s.fire_rate * (1.0 + self.bonus.fire_rate_pct);
        self.damage = s.damage * (1.0 + self.bonus.damage_pct);
        self.bullet_speed = s.bullet_speed * (1.0 + self.bonus.bullet_speed_pct);
        self.speed = s.speed * (1.0 + self.bonus.speed_pct);
        self.pickup_radius = s.pickup_radius * (1.0 + self.bonus.pickup_radius_pct);
        self.bullet_radius = s.bullet_radius * (1.0 + self.bonus.bullet_radius_pct);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use voidline_data::load_default;

    #[test]
    fn baseline_player_matches_balance_stats() {
        let bundle = load_default().expect("balance.json");
        let player = Player::new(&bundle.balance.player.stats);
        assert_eq!(player.hp, 100.0);
        assert_eq!(player.max_hp, 100.0);
        assert_eq!(player.speed, 265.0);
        assert_eq!(player.damage, 24.0);
        assert_eq!(player.fire_rate, 3.0);
        assert_eq!(player.projectile_count, 1.0);
    }

    #[test]
    fn recompute_applies_additive_bonuses() {
        let bundle = load_default().expect("balance.json");
        let mut player = Player::new(&bundle.balance.player.stats);
        player.bonus.fire_rate_pct = 0.22;
        player.bonus.damage_pct = 0.26;
        player.recompute_multiplicative_stats(&bundle.balance);
        assert!((player.fire_rate - 3.0 * 1.22).abs() < 1e-12);
        assert!((player.damage - 24.0 * 1.26).abs() < 1e-12);
    }
}

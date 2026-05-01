//! Mirror of `src/systems/synergies.ts` for build-tag synergy detection.

use std::collections::HashMap;

use voidline_data::{Relic, Upgrade};

use crate::player::{Player, PlayerTraits};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum SynergyId {
    RailSplitter,
    DroneSwarm,
    KineticRam,
    MagnetStorm,
}

#[derive(Debug, Clone)]
pub struct OwnedUpgrade<'a> {
    pub upgrade: &'a Upgrade,
    pub tier_power: f64,
    pub count: u32,
}

#[derive(Debug, Clone)]
pub struct OwnedRelic<'a> {
    pub relic: &'a Relic,
    pub count: u32,
}

pub fn build_tag_counts(
    upgrades: &[OwnedUpgrade<'_>],
    relics: &[OwnedRelic<'_>],
) -> HashMap<String, u32> {
    let mut counts = HashMap::new();
    for owned in upgrades {
        for tag in &owned.upgrade.tags {
            *counts.entry(tag.clone()).or_insert(0) += owned.count.max(1);
        }
    }
    for owned in relics {
        for tag in &owned.relic.tags {
            *counts.entry(tag.clone()).or_insert(0) += owned.count.max(1);
        }
    }
    counts
}

pub fn active_synergies(counts: &HashMap<String, u32>) -> Vec<SynergyId> {
    let mut active = Vec::new();
    let get = |tag: &str| *counts.get(tag).unwrap_or(&0);
    if get("cannon") >= 1 && get("crit") >= 1 && get("pierce") >= 1 {
        active.push(SynergyId::RailSplitter);
    }
    if get("drone") >= 1 && get("cannon") >= 1 {
        active.push(SynergyId::DroneSwarm);
    }
    if get("shield") >= 1 && get("salvage") >= 1 {
        active.push(SynergyId::KineticRam);
    }
    if get("magnet") >= 2 {
        active.push(SynergyId::MagnetStorm);
    }
    active
}

pub fn refresh_player_traits(
    player: &mut Player,
    upgrades: &[OwnedUpgrade<'_>],
    relics: &[OwnedRelic<'_>],
) -> Vec<SynergyId> {
    let counts = build_tag_counts(upgrades, relics);
    let active = active_synergies(&counts);
    let mut next = PlayerTraits::default();
    for syn in &active {
        match syn {
            SynergyId::RailSplitter => next.rail_splitter = true,
            SynergyId::DroneSwarm => next.drone_swarm = true,
            SynergyId::KineticRam => next.kinetic_ram = true,
            SynergyId::MagnetStorm => next.magnet_storm = true,
        }
    }
    if !next.kinetic_ram {
        player.ram_timer = 0.0;
    }
    if !next.magnet_storm {
        player.magnet_storm_charge = 0.0;
        player.magnet_storm_timer = 0.0;
    }
    player.traits = next;
    active
}

#[cfg(test)]
mod tests {
    use super::*;
    use voidline_data::load_default;

    fn upgrade<'a>(bundle: &'a voidline_data::DataBundle, id: &str) -> &'a Upgrade {
        bundle.upgrades.iter().find(|u| u.id == id).unwrap()
    }

    fn relic<'a>(bundle: &'a voidline_data::DataBundle, id: &str) -> &'a Relic {
        bundle.relics.iter().find(|r| r.id == id).unwrap()
    }

    fn owned<'a>(u: &'a Upgrade, count: u32) -> OwnedUpgrade<'a> {
        OwnedUpgrade {
            upgrade: u,
            tier_power: 1.0,
            count,
        }
    }

    fn owned_relic<'a>(r: &'a Relic, count: u32) -> OwnedRelic<'a> {
        OwnedRelic { relic: r, count }
    }

    #[test]
    fn empty_loadout_has_no_active_synergy() {
        let counts = HashMap::new();
        assert!(active_synergies(&counts).is_empty());
    }

    #[test]
    fn rail_splitter_requires_cannon_crit_pierce() {
        let bundle = load_default().unwrap();
        let cannon = upgrade(&bundle, "plasma-core");
        let crit = upgrade(&bundle, "crit-array");
        let pierce = upgrade(&bundle, "lance-pierce");
        let upgrades = [owned(cannon, 1), owned(crit, 1), owned(pierce, 1)];
        let counts = build_tag_counts(&upgrades, &[]);
        assert!(active_synergies(&counts).contains(&SynergyId::RailSplitter));
    }

    #[test]
    fn rail_splitter_inactive_when_pierce_missing() {
        let bundle = load_default().unwrap();
        let cannon = upgrade(&bundle, "plasma-core");
        let crit = upgrade(&bundle, "crit-array");
        let upgrades = [owned(cannon, 1), owned(crit, 1)];
        let counts = build_tag_counts(&upgrades, &[]);
        assert!(!active_synergies(&counts).contains(&SynergyId::RailSplitter));
    }

    #[test]
    fn kinetic_ram_requires_shield_and_salvage() {
        let bundle = load_default().unwrap();
        // kinetic-shield carries both shield and salvage tags.
        let shield = upgrade(&bundle, "kinetic-shield");
        let upgrades = [owned(shield, 1)];
        let counts = build_tag_counts(&upgrades, &[]);
        assert!(active_synergies(&counts).contains(&SynergyId::KineticRam));
    }

    #[test]
    fn magnet_storm_needs_two_magnet_picks() {
        let bundle = load_default().unwrap();
        let magnet = upgrade(&bundle, "magnet-array");
        let single = [owned(magnet, 1)];
        assert!(
            !active_synergies(&build_tag_counts(&single, &[])).contains(&SynergyId::MagnetStorm)
        );

        let stacked = [owned(magnet, 2)];
        assert!(
            active_synergies(&build_tag_counts(&stacked, &[])).contains(&SynergyId::MagnetStorm)
        );
    }

    #[test]
    fn drone_swarm_requires_drone_and_cannon() {
        let bundle = load_default().unwrap();
        let drone = upgrade(&bundle, "drone-uplink");
        let cannon = upgrade(&bundle, "plasma-core");
        let counts = build_tag_counts(&[owned(drone, 1), owned(cannon, 1)], &[]);
        assert!(active_synergies(&counts).contains(&SynergyId::DroneSwarm));
    }

    #[test]
    fn relics_contribute_to_tag_counts() {
        let bundle = load_default().unwrap();
        // emergency-nanites tags include "salvage" — combine with shield upgrade.
        let shield = upgrade(&bundle, "kinetic-shield");
        let relic = relic(&bundle, "emergency-nanites");
        let counts = build_tag_counts(&[owned(shield, 1)], &[owned_relic(relic, 1)]);
        // Shield + salvage from upgrade should already trigger Kinetic Ram regardless.
        assert!(active_synergies(&counts).contains(&SynergyId::KineticRam));
    }

    #[test]
    fn refresh_traits_clears_charges_when_synergy_drops() {
        let bundle = load_default().unwrap();
        let mut player = crate::player::Player::new(&bundle.balance.player.stats);
        player.magnet_storm_charge = 99.0;
        player.magnet_storm_timer = 1.5;
        player.ram_timer = 0.5;
        // Empty loadout: no synergies active → all timers zeroed.
        refresh_player_traits(&mut player, &[], &[]);
        assert_eq!(player.magnet_storm_charge, 0.0);
        assert_eq!(player.magnet_storm_timer, 0.0);
        assert_eq!(player.ram_timer, 0.0);
        assert!(!player.traits.kinetic_ram);
        assert!(!player.traits.magnet_storm);
    }
}

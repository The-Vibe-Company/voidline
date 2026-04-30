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

use crate::snapshot::MetaLevels;
use std::collections::BTreeMap;

const ORDER: [&str; 5] = [
    "meta:max-hp",
    "meta:speed",
    "meta:damage",
    "meta:fire-rate",
    "meta:crystal-yield",
];

pub fn next_meta_purchase(crystals: i64, spent: i64, levels: &MetaLevels) -> Option<String> {
    if crystals < 30 {
        return None;
    }
    let map = &levels.0;
    let ladder = [
        (60, "meta:max-hp", 1),
        (100, "meta:speed", 1),
        (150, "meta:damage", 1),
        (200, "meta:fire-rate", 1),
        (280, "meta:max-hp", 2),
    ];
    for (threshold, id, target_level) in ladder {
        if spent + crystals >= threshold && level(map, id) < target_level {
            let cost = cost_at(id, level(map, id));
            if cost <= crystals && cost * 10 <= crystals * 6 {
                return Some(id.to_string());
            }
        }
    }
    for id in ORDER {
        if id == "meta:crystal-yield" && ORDER[..4].iter().any(|combat| level(map, combat) < 5) {
            continue;
        }
        if level(map, id) >= 5 {
            continue;
        }
        let cost = cost_at(id, level(map, id));
        if cost <= crystals && cost * 10 <= crystals * 6 {
            return Some(id.to_string());
        }
    }
    None
}

fn level(map: &BTreeMap<String, u32>, id: &str) -> u32 {
    map.get(id).copied().unwrap_or(0)
}

fn cost_at(id: &str, level: u32) -> i64 {
    match id {
        "meta:max-hp" => 30 + level as i64 * 25,
        "meta:damage" => 30 + level as i64 * 30,
        "meta:fire-rate" => 30 + level as i64 * 35,
        "meta:speed" => 25 + level as i64 * 25,
        "meta:crystal-yield" => 40 + level as i64 * 40,
        _ => i64::MAX,
    }
}

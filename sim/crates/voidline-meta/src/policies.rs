//! Buy-strategy policies for the meta-progression env.

use crate::account::can_purchase;
use crate::env::{MetaAction, MetaProgressionEnv};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PolicyId {
    Random,
    GreedyCheap,
    FocusedAttack,
    Hoarder,
}

impl PolicyId {
    pub fn as_str(&self) -> &'static str {
        match self {
            PolicyId::Random => "random",
            PolicyId::GreedyCheap => "greedy-cheap",
            PolicyId::FocusedAttack => "focused-attack",
            PolicyId::Hoarder => "hoarder",
        }
    }
}

pub trait MetaPolicy {
    fn id(&self) -> PolicyId;
    fn pick(&mut self, env: &MetaProgressionEnv<'_>) -> MetaAction;
}

/// Simple LCG-based RNG used inside policies (independent of the sim RNG).
#[derive(Debug, Clone, Copy)]
struct PolicyRng(u64);

impl PolicyRng {
    fn new(seed: u64) -> Self {
        Self(seed.max(1))
    }

    fn next_u32(&mut self) -> u32 {
        self.0 = self
            .0
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1442695040888963407);
        (self.0 >> 33) as u32
    }

    fn next_unit(&mut self) -> f64 {
        (self.next_u32() as f64) / (u32::MAX as f64)
    }
}

pub struct RandomPolicy {
    rng: PolicyRng,
}

impl RandomPolicy {
    pub fn new(seed: u64) -> Self {
        Self {
            rng: PolicyRng::new(seed),
        }
    }
}

impl MetaPolicy for RandomPolicy {
    fn id(&self) -> PolicyId {
        PolicyId::Random
    }
    fn pick(&mut self, env: &MetaProgressionEnv<'_>) -> MetaAction {
        let purchases = env.available_purchases();
        // 50% chance to buy if anything's available, else NextRun.
        if !purchases.is_empty() && self.rng.next_unit() < 0.5 {
            let idx = (self.rng.next_u32() as usize) % purchases.len();
            return MetaAction::Purchase(purchases[idx].clone());
        }
        MetaAction::NextRun
    }
}

pub struct GreedyCheapPolicy;

impl MetaPolicy for GreedyCheapPolicy {
    fn id(&self) -> PolicyId {
        PolicyId::GreedyCheap
    }
    fn pick(&mut self, env: &MetaProgressionEnv<'_>) -> MetaAction {
        // Find cheapest purchasable.
        let mut best: Option<(String, u64)> = None;
        for meta in &env.bundle.meta_upgrades {
            if let Ok(cost) = can_purchase(&env.account, meta) {
                if best.as_ref().map(|(_, c)| cost < *c).unwrap_or(true) {
                    best = Some((meta.id.clone(), cost));
                }
            }
        }
        match best {
            Some((id, _)) => MetaAction::Purchase(id),
            None => MetaAction::NextRun,
        }
    }
}

pub struct FocusedAttackPolicy {
    priority: Vec<&'static str>,
}

impl Default for FocusedAttackPolicy {
    fn default() -> Self {
        Self {
            priority: vec![
                "category:attack",
                "unique:weapon-scatter",
                "category:defense",
                "category:tempo",
                "unique:char-tank",
                "category:salvage",
                "unique:extra-choice",
                "unique:reroll",
                "unique:weapon-lance",
                "unique:weapon-drone",
                "unique:char-runner",
            ],
        }
    }
}

impl MetaPolicy for FocusedAttackPolicy {
    fn id(&self) -> PolicyId {
        PolicyId::FocusedAttack
    }
    fn pick(&mut self, env: &MetaProgressionEnv<'_>) -> MetaAction {
        for &id in &self.priority {
            if let Some(meta) = env.bundle.meta_upgrades.iter().find(|m| m.id == id) {
                if can_purchase(&env.account, meta).is_ok() {
                    return MetaAction::Purchase(id.to_string());
                }
            }
        }
        MetaAction::NextRun
    }
}

pub struct HoarderPolicy;

impl MetaPolicy for HoarderPolicy {
    fn id(&self) -> PolicyId {
        PolicyId::Hoarder
    }
    fn pick(&mut self, env: &MetaProgressionEnv<'_>) -> MetaAction {
        // Skip purchases under 100 crystals unless they're weapons or characters.
        let mut best: Option<(String, u64)> = None;
        for meta in &env.bundle.meta_upgrades {
            if let Ok(cost) = can_purchase(&env.account, meta) {
                let is_unique = meta.kind == "unique";
                let is_big_or_unlock = cost >= 100
                    || (is_unique && (meta.weapon_id.is_some() || meta.character_id.is_some()));
                if !is_big_or_unlock {
                    continue;
                }
                if best.as_ref().map(|(_, c)| cost < *c).unwrap_or(true) {
                    best = Some((meta.id.clone(), cost));
                }
            }
        }
        match best {
            Some((id, _)) => MetaAction::Purchase(id),
            None => MetaAction::NextRun,
        }
    }
}

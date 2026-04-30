//! Meta-progression env + policies + campaign runner for Voidline.

pub mod account;
pub mod campaign;
pub mod env;
pub mod policies;

pub use account::{AccountSnapshot, MetaUpgradeKind, RunOutcome};
pub use campaign::{run_meta_campaign, CampaignOptions, CampaignResult, CampaignTimelineEntry};
pub use env::{MetaAction, MetaProgressionEnv, StepResult};
pub use policies::{MetaPolicy, PolicyId};

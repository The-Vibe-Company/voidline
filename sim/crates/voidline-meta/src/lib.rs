//! Meta-progression env + policies + campaign runner for Voidline.

pub mod account;
pub mod campaign;
pub mod champion;
pub mod env;
#[cfg(feature = "learned-policy")]
pub mod learned_policy;
pub mod obs;
pub mod policies;
pub mod profiles;

pub use account::{AccountSnapshot, MetaUpgradeKind, RunOutcome};
pub use campaign::{run_meta_campaign, CampaignOptions, CampaignResult, CampaignTimelineEntry};
pub use env::{MetaAction, MetaProgressionEnv, StepResult};
pub use policies::{MetaPolicy, PolicyId};
pub use profiles::{PlayerProfileId, ProfileRunSummary, RunPolicy, RunPolicyError};

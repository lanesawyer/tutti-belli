#![allow(elided_lifetimes_in_paths)]
#![allow(clippy::wildcard_imports)]
pub use sea_orm_migration::prelude::*;
mod m20220101_000001_users;

mod m20250414_051644_ensembles;
mod m20250414_053342_add_ensemble_ref_to_users;
mod m20250414_055207_events;
pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![
            Box::new(m20220101_000001_users::Migration),
            Box::new(m20250414_051644_ensembles::Migration),
            Box::new(m20250414_053342_add_ensemble_ref_to_users::Migration),
            Box::new(m20250414_055207_events::Migration),
            // inject-above (do not remove this comment)
        ]
    }
}

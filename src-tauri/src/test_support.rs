//! Helpers for the tests that need a live Postgres.

use std::sync::atomic::{AtomicU64, Ordering};

use crate::postgres_store::PostgresStore;

/// Set in CI so an unreachable database fails the suite instead of silently
/// skipping the Postgres coverage.
const REQUIRED_ENV: &str = "REQUIRE_POSTGRES_TESTS";

static NEXT_TEST_ID: AtomicU64 = AtomicU64::new(0);

fn postgres_required() -> bool {
    std::env::var(REQUIRED_ENV).is_ok_and(|value| !value.trim().is_empty() && value != "0")
}

/// Connects to `DATABASE_URL`. Without a reachable server the test is skipped
/// locally (see README for how to start one via compose) and fails when
/// `REQUIRE_POSTGRES_TESTS` is set, so CI always exercises the database.
pub fn test_store() -> Option<PostgresStore> {
    let reason = match std::env::var("DATABASE_URL") {
        Err(_) => "DATABASE_URL is not set".to_owned(),
        Ok(url) => match PostgresStore::connect(&url) {
            Ok(store) => return Some(store),
            Err(error) => format!(
                "{} is not reachable: {error}",
                crate::config::redact_database_url(&url)
            ),
        },
    };
    assert!(
        !postgres_required(),
        "{REQUIRED_ENV} is set but {reason}; the Postgres tests must run in CI"
    );
    eprintln!("skipping the Postgres test: {reason}");
    None
}

/// Value that no other test (or parallel run against the same database) uses,
/// so the uniqueness fixtures start from a clean slate.
pub fn unique_tag() -> String {
    let id = NEXT_TEST_ID.fetch_add(1, Ordering::Relaxed);
    format!("{}-{id}", std::process::id())
}

/// Address that is unused for the same reason.
pub fn unique_email() -> String {
    format!("postgres-test-{}@example.com", unique_tag())
}

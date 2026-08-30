//! Helpers for the tests that need a live Postgres.

use std::sync::atomic::{AtomicU64, Ordering};

use crate::postgres_store::PostgresStore;

/// Set in CI so an unreachable database fails the suite instead of silently
/// skipping the Postgres coverage.
const REQUIRED_ENV: &str = "REQUIRE_POSTGRES_TESTS";

static NEXT_TEST_ID: AtomicU64 = AtomicU64::new(0);

fn postgres_required() -> bool {
    std::env::var(REQUIRED_ENV).is_ok_and(|value| {
        let value = value.trim();
        !value.is_empty() && value != "0"
    })
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
                "{} could not be opened: {error}",
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

/// An empty database created on the configured server, so a test can exercise
/// a first-time migration. Dropped again when the guard goes out of scope, so
/// repeated local runs do not pile up databases.
pub struct FreshDatabase {
    name: String,
    url: String,
}

impl FreshDatabase {
    /// Connection string of the freshly created database.
    pub fn url(&self) -> &str {
        &self.url
    }
}

impl Drop for FreshDatabase {
    fn drop(&mut self) {
        let Ok(url) = std::env::var("DATABASE_URL") else {
            return;
        };
        if let Ok(mut client) = postgres::Client::connect(&url, postgres::NoTls) {
            let _ = client.batch_execute(&format!("DROP DATABASE IF EXISTS {} (FORCE)", self.name));
        }
    }
}

/// Creates an empty database on the configured server. Returns `None` under
/// the same conditions as `test_store`.
pub fn fresh_database() -> Option<FreshDatabase> {
    // Proves the server is reachable and applies the required/skip policy.
    test_store()?;
    let url = std::env::var("DATABASE_URL").expect("test_store checked DATABASE_URL");
    let mut client = postgres::Client::connect(&url, postgres::NoTls)
        .expect("test_store already connected to this server");
    // The generated name only contains digits and underscores.
    let name = format!("wtt_test_{}", unique_tag().replace('-', "_"));
    client
        .batch_execute(&format!("CREATE DATABASE {name}"))
        .expect("the test database can be created");
    let url = replace_dbname(&url, &name);
    Some(FreshDatabase { name, url })
}

/// Swaps the database of a `key=value` or URL connection string.
fn replace_dbname(url: &str, name: &str) -> String {
    if url.contains("://") {
        let (base, _) = url.rsplit_once('/').expect("the URL names a database");
        return format!("{base}/{name}");
    }
    let mut parts: Vec<String> = url
        .split_whitespace()
        .filter(|part| !part.starts_with("dbname="))
        .map(str::to_owned)
        .collect();
    parts.push(format!("dbname={name}"));
    parts.join(" ")
}

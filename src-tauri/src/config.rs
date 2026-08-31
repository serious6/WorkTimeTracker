//! Resolves the Postgres database connection used at startup.

use std::collections::HashMap;

pub const DATABASE_URL_ENV: &str = "DATABASE_URL";

#[derive(Debug, PartialEq, Eq)]
pub struct DbConfig {
    pub database_url: String,
}

#[derive(Debug, PartialEq, Eq)]
pub struct ConfigError;

impl std::fmt::Display for ConfigError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            formatter,
            "{DATABASE_URL_ENV} must be set to a non-empty PostgreSQL connection string"
        )
    }
}

impl std::error::Error for ConfigError {}

impl DbConfig {
    /// Resolves the configuration from the real process environment.
    pub fn from_env() -> Result<Self, ConfigError> {
        let vars: HashMap<String, String> = [DATABASE_URL_ENV]
            .into_iter()
            .filter_map(|key| std::env::var(key).ok().map(|value| (key.to_owned(), value)))
            .collect();
        Self::resolve(&vars)
    }

    /// Pure resolution from a map of env vars, so it can be unit tested
    /// without mutating the real process environment.
    pub fn resolve(vars: &HashMap<String, String>) -> Result<Self, ConfigError> {
        let database_url = vars
            .get(DATABASE_URL_ENV)
            .filter(|value| !value.trim().is_empty())
            .cloned()
            .ok_or(ConfigError)?;
        Ok(Self { database_url })
    }
}

/// Redacts the password segment of a database connection URL so it
/// is safe to include in error messages and logs.
pub fn redact_database_url(url: &str) -> String {
    let Some((scheme, rest)) = url.split_once("://") else {
        return url.to_owned();
    };
    let Some((credentials, host_and_path)) = rest.split_once('@') else {
        return url.to_owned();
    };
    let user = credentials.split_once(':').map_or(credentials, |(u, _)| u);
    format!("{scheme}://{user}:***@{host_and_path}")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vars(pairs: &[(&str, &str)]) -> HashMap<String, String> {
        pairs
            .iter()
            .map(|(k, v)| ((*k).to_owned(), (*v).to_owned()))
            .collect()
    }

    #[test]
    fn rejects_an_unset_database_url() {
        let error = DbConfig::resolve(&HashMap::new()).expect_err("must require DATABASE_URL");

        assert_eq!(
            error.to_string(),
            "DATABASE_URL must be set to a non-empty PostgreSQL connection string"
        );
    }

    #[test]
    fn rejects_a_blank_database_url() {
        let error =
            DbConfig::resolve(&vars(&[(DATABASE_URL_ENV, "   ")])).expect_err("must reject blank");

        assert_eq!(
            error.to_string(),
            "DATABASE_URL must be set to a non-empty PostgreSQL connection string"
        );
    }

    #[test]
    fn uses_the_database_url_when_set() {
        let user = "worktimetracker";
        let secret = "secret";
        let url = format!("postgresql://{user}:{secret}@localhost/worktimetracker");
        let config = DbConfig::resolve(&vars(&[(DATABASE_URL_ENV, &url)])).unwrap();

        assert_eq!(config.database_url, url);
    }

    #[test]
    fn redacts_the_password_in_a_database_url() {
        let user = "worktimetracker";
        let secret = "hunter2";
        let host_and_path = "localhost:5432/worktimetracker";
        let url = format!("postgresql://{user}:{secret}@{host_and_path}");
        let expected = format!("postgresql://{user}:***@{host_and_path}");
        assert_eq!(redact_database_url(&url), expected);
        assert!(!redact_database_url(&url).contains(secret));
    }

    #[test]
    fn leaves_malformed_urls_unchanged() {
        assert_eq!(redact_database_url("not-a-url"), "not-a-url");
    }
}

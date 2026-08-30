//! Resolves which database backend to use at startup, driven by environment
//! variables. SQLite remains the default so existing installs are unaffected
//! when no env var is set.

use std::{collections::HashMap, path::PathBuf};

pub const BACKEND_ENV: &str = "WTT_DB_BACKEND";
pub const DATABASE_URL_ENV: &str = "DATABASE_URL";
pub const SQLITE_PATH_ENV: &str = "WTT_SQLITE_PATH";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DbBackend {
    Sqlite,
    Postgres,
}

#[derive(Debug, PartialEq, Eq)]
pub enum ConfigError {
    /// `WTT_DB_BACKEND` was set to something other than `sqlite`/`postgres`.
    InvalidBackend(String),
    /// The backend is `postgres` but `DATABASE_URL` was not set.
    MissingDatabaseUrl,
}

impl std::fmt::Display for ConfigError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidBackend(value) => write!(
                formatter,
                "{BACKEND_ENV} must be \"sqlite\" or \"postgres\", got \"{value}\""
            ),
            Self::MissingDatabaseUrl => write!(
                formatter,
                "{DATABASE_URL_ENV} must be set when {BACKEND_ENV}=postgres"
            ),
        }
    }
}

impl std::error::Error for ConfigError {}

#[derive(Debug, PartialEq, Eq)]
pub struct DbConfig {
    pub backend: DbBackend,
    /// Effective SQLite file path, honoring `WTT_SQLITE_PATH` when set.
    pub sqlite_path: PathBuf,
    /// Connection string, required and used only when `backend` is `Postgres`.
    pub database_url: Option<String>,
}

impl DbConfig {
    /// Resolves the configuration from the real process environment.
    pub fn from_env(default_sqlite_path: PathBuf) -> Result<Self, ConfigError> {
        let vars: HashMap<String, String> = [BACKEND_ENV, DATABASE_URL_ENV, SQLITE_PATH_ENV]
            .into_iter()
            .filter_map(|key| std::env::var(key).ok().map(|value| (key.to_owned(), value)))
            .collect();
        Self::resolve(&vars, default_sqlite_path)
    }

    /// Pure resolution from a map of env vars, so it can be unit tested
    /// without mutating the real process environment.
    pub fn resolve(
        vars: &HashMap<String, String>,
        default_sqlite_path: PathBuf,
    ) -> Result<Self, ConfigError> {
        let backend = match vars.get(BACKEND_ENV).map(String::as_str) {
            None | Some("") => DbBackend::Sqlite,
            Some("sqlite") => DbBackend::Sqlite,
            Some("postgres") => DbBackend::Postgres,
            Some(other) => return Err(ConfigError::InvalidBackend(other.to_owned())),
        };
        let database_url = vars.get(DATABASE_URL_ENV).cloned();
        if backend == DbBackend::Postgres && database_url.is_none() {
            return Err(ConfigError::MissingDatabaseUrl);
        }
        let sqlite_path = vars
            .get(SQLITE_PATH_ENV)
            .map(PathBuf::from)
            .unwrap_or(default_sqlite_path);
        Ok(Self {
            backend,
            sqlite_path,
            database_url,
        })
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

    fn default_path() -> PathBuf {
        PathBuf::from("/data/work-time-tracker.sqlite")
    }

    #[test]
    fn defaults_to_sqlite_when_nothing_is_set() {
        let config = DbConfig::resolve(&HashMap::new(), default_path()).unwrap();
        assert_eq!(config.backend, DbBackend::Sqlite);
        assert_eq!(config.sqlite_path, default_path());
        assert_eq!(config.database_url, None);
    }

    #[test]
    fn defaults_to_sqlite_when_backend_is_explicitly_sqlite() {
        let config = DbConfig::resolve(&vars(&[(BACKEND_ENV, "sqlite")]), default_path()).unwrap();
        assert_eq!(config.backend, DbBackend::Sqlite);
    }

    #[test]
    fn overrides_the_sqlite_path_when_set() {
        let config = DbConfig::resolve(
            &vars(&[(SQLITE_PATH_ENV, "/tmp/custom.sqlite")]),
            default_path(),
        )
        .unwrap();
        assert_eq!(config.sqlite_path, PathBuf::from("/tmp/custom.sqlite"));
    }

    #[test]
    fn selects_postgres_when_requested_with_a_url() {
        let url = ["postgresql://worktimetracker", "@localhost/worktimetracker"].join(":secret");
        let config = DbConfig::resolve(
            &vars(&[(BACKEND_ENV, "postgres"), (DATABASE_URL_ENV, &url)]),
            default_path(),
        )
        .unwrap();
        assert_eq!(config.backend, DbBackend::Postgres);
        assert_eq!(config.database_url.as_deref(), Some(url.as_str()));
    }

    #[test]
    fn rejects_postgres_without_a_database_url() {
        let error =
            DbConfig::resolve(&vars(&[(BACKEND_ENV, "postgres")]), default_path()).unwrap_err();
        assert_eq!(error, ConfigError::MissingDatabaseUrl);
    }

    #[test]
    fn rejects_an_unknown_backend_value() {
        let error =
            DbConfig::resolve(&vars(&[(BACKEND_ENV, "mysql")]), default_path()).unwrap_err();
        assert_eq!(error, ConfigError::InvalidBackend("mysql".to_owned()));
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

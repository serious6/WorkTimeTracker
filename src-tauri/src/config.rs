//! Resolves the Postgres database connection used at startup.
//!
//! Development, the test suites and CI always talk to a local Postgres; a
//! production build talks to the managed Postgres of the deployment over a
//! verified TLS connection. Which of the two applies is decided by
//! `WORK_TIME_TRACKER_ENV`, see `architecture/decisions.md`. Neither the host
//! of that managed database nor any credential is part of the source: both are
//! injected as environment variables at deployment time.

use std::collections::HashMap;

pub const DATABASE_URL_ENV: &str = "DATABASE_URL";
pub const DEPLOYMENT_MODE_ENV: &str = "WORK_TIME_TRACKER_ENV";
pub const MIGRATE_ENV: &str = "WORK_TIME_TRACKER_DB_MIGRATE";
pub const DB_HOST_ENV: &str = "SUPABASE_DB_HOST";
pub const DB_PORT_ENV: &str = "SUPABASE_DB_PORT";
pub const DB_USER_ENV: &str = "SUPABASE_DB_USER";
pub const DB_PASSWORD_ENV: &str = "SUPABASE_DB_PASSWORD";
pub const DB_NAME_ENV: &str = "SUPABASE_DB_NAME";
pub const DB_ROOT_CERT_ENV: &str = "SUPABASE_DB_ROOT_CERT";

/// Every variable the resolution reads: `env_vars` copies only these out of the
/// process environment, and `portable.rs` accepts only these names in
/// `WorkTimeTracker.env`.
pub const ENV_KEYS: [&str; 9] = [
    DATABASE_URL_ENV,
    DEPLOYMENT_MODE_ENV,
    MIGRATE_ENV,
    DB_HOST_ENV,
    DB_PORT_ENV,
    DB_USER_ENV,
    DB_PASSWORD_ENV,
    DB_NAME_ENV,
    DB_ROOT_CERT_ENV,
];

const DEFAULT_PORT: u16 = 5432;
const DEFAULT_DATABASE: &str = "postgres";

/// Which deployment the process runs as. A remote database host is only ever
/// accepted in `Production`, and only with a verified TLS connection.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum DeploymentMode {
    #[default]
    Development,
    Production,
}

impl DeploymentMode {
    pub fn is_production(self) -> bool {
        self == Self::Production
    }

    /// Reads the mode from the real process environment, for the places that
    /// resolve no full configuration, such as the guard of the test helpers.
    #[cfg(test)]
    pub fn from_env() -> Result<Self, ConfigError> {
        match std::env::var(DEPLOYMENT_MODE_ENV) {
            Ok(value) => Self::parse(&value),
            Err(_) => Ok(Self::default()),
        }
    }

    fn parse(value: &str) -> Result<Self, ConfigError> {
        let value = value.trim();
        if value.is_empty() || value.eq_ignore_ascii_case("development") {
            Ok(Self::Development)
        } else if value.eq_ignore_ascii_case("production") {
            Ok(Self::Production)
        } else {
            Err(ConfigError::UnknownMode(value.to_owned()))
        }
    }
}

impl std::fmt::Display for DeploymentMode {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(match self {
            Self::Development => "development",
            Self::Production => "production",
        })
    }
}

#[derive(Debug, PartialEq, Eq)]
pub struct DbConfig {
    pub mode: DeploymentMode,
    pub database_url: String,
    /// PEM file with the certificate authority a remote server is verified
    /// against. An `sslrootcert` in the connection string takes precedence.
    pub root_cert: Option<String>,
    /// Whether this process may apply the schema migrations. A production
    /// database is migrated by a deliberate, separately approved step instead
    /// of by every client that starts, so only `for_migration` ever sets this
    /// for a production database.
    pub run_migrations: bool,
}

/// Failure of the configuration itself. Names variables, never their values,
/// so it stays safe to log and to show.
#[derive(Debug, PartialEq, Eq)]
pub enum ConfigError {
    MissingDatabaseUrl,
    UnknownMode(String),
    MissingSettings(Vec<&'static str>),
    InvalidPort,
    InvalidHost,
}

impl std::fmt::Display for ConfigError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::MissingDatabaseUrl => write!(
                formatter,
                "{DATABASE_URL_ENV} must be set to a non-empty PostgreSQL connection string"
            ),
            Self::UnknownMode(value) => write!(
                formatter,
                "{DEPLOYMENT_MODE_ENV} must be either \"development\" or \"production\", not {value:?}"
            ),
            Self::MissingSettings(names) => write!(
                formatter,
                "{DEPLOYMENT_MODE_ENV}=production requires {DATABASE_URL_ENV} or the database settings; missing: {}",
                names.join(", ")
            ),
            Self::InvalidPort => write!(
                formatter,
                "{DB_PORT_ENV} must be a TCP port number between 1 and 65535"
            ),
            Self::InvalidHost => write!(
                formatter,
                "{DB_HOST_ENV} must be a host name without a scheme, credentials, port or path"
            ),
        }
    }
}

impl std::error::Error for ConfigError {}

impl DbConfig {
    /// The configuration of the separate migration step, the only place that
    /// may authorize applying the migrations to a production database
    /// (`WORK_TIME_TRACKER_DB_MIGRATE=true`, see `examples/migrate.rs`).
    pub fn for_migration() -> Result<Self, ConfigError> {
        let vars = env_vars();
        Self::resolve_for_migration(&vars)
    }

    /// Pure resolution from a map of env vars, so it can be unit tested
    /// without mutating the real process environment.
    pub fn resolve(vars: &HashMap<String, String>) -> Result<Self, ConfigError> {
        let mode = match vars.get(DEPLOYMENT_MODE_ENV) {
            Some(value) => DeploymentMode::parse(value)?,
            None => DeploymentMode::default(),
        };
        let database_url = match (mode, setting(vars, DATABASE_URL_ENV)) {
            (_, Some(url)) => url.to_owned(),
            (DeploymentMode::Development, None) => return Err(ConfigError::MissingDatabaseUrl),
            (DeploymentMode::Production, None) => production_url(vars)?,
        };
        Ok(Self {
            mode,
            database_url,
            root_cert: setting(vars, DB_ROOT_CERT_ENV).map(str::to_owned),
            run_migrations: !mode.is_production(),
        })
    }

    /// The same resolution for the migration step, which reads the opt-in flag
    /// that a production database may be migrated.
    pub fn resolve_for_migration(vars: &HashMap<String, String>) -> Result<Self, ConfigError> {
        let mut config = Self::resolve(vars)?;
        config.run_migrations = config.run_migrations || flag(vars, MIGRATE_ENV);
        Ok(config)
    }
}

/// The variables of the resolution, copied out of the process environment.
pub fn env_vars() -> HashMap<String, String> {
    ENV_KEYS
        .into_iter()
        .filter_map(|key| std::env::var(key).ok().map(|value| (key.to_owned(), value)))
        .collect()
}

/// A variable with a meaningful value. A blank one counts as unset, so a
/// secret that was not injected cannot pass as a configured empty password.
fn setting<'a>(vars: &'a HashMap<String, String>, key: &str) -> Option<&'a str> {
    vars.get(key)
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
}

fn flag(vars: &HashMap<String, String>, key: &str) -> bool {
    setting(vars, key).is_some_and(|value| {
        value.eq_ignore_ascii_case("true") || value == "1" || value.eq_ignore_ascii_case("yes")
    })
}

/// Assembles the production connection string from the injected settings. The
/// mandatory `sslmode=verify-full` is part of it, so a production connection
/// cannot be opened without verifying the certificate of the server.
fn production_url(vars: &HashMap<String, String>) -> Result<String, ConfigError> {
    let host = setting(vars, DB_HOST_ENV);
    let user = setting(vars, DB_USER_ENV);
    let password = setting(vars, DB_PASSWORD_ENV);
    let missing: Vec<&'static str> = [
        (DB_HOST_ENV, host.is_none()),
        (DB_USER_ENV, user.is_none()),
        (DB_PASSWORD_ENV, password.is_none()),
    ]
    .into_iter()
    .filter_map(|(name, missing)| missing.then_some(name))
    .collect();
    if !missing.is_empty() {
        return Err(ConfigError::MissingSettings(missing));
    }
    let (Some(host), Some(user), Some(password)) = (host, user, password) else {
        unreachable!("every missing setting was reported above");
    };
    if host.contains(|character: char| character.is_whitespace() || "/@?#:\\[]".contains(character))
    {
        return Err(ConfigError::InvalidHost);
    }
    let port = match setting(vars, DB_PORT_ENV) {
        Some(value) => value
            .parse::<u16>()
            .ok()
            .filter(|port| *port > 0)
            .ok_or(ConfigError::InvalidPort)?,
        None => DEFAULT_PORT,
    };
    let database = setting(vars, DB_NAME_ENV).unwrap_or(DEFAULT_DATABASE);
    Ok(format!(
        "postgresql://{}:{}@{host}:{port}/{}?sslmode=verify-full",
        encode(user),
        encode(password),
        encode(database)
    ))
}

/// Percent-encodes everything outside the unreserved set, so a password that
/// contains a `@`, `/` or `?` cannot change the meaning of the connection
/// string it is placed in.
fn encode(value: &str) -> String {
    let mut encoded = String::with_capacity(value.len());
    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'.' | b'_' | b'~') {
            encoded.push(char::from(byte));
        } else {
            encoded.push_str(&format!("%{byte:02X}"));
        }
    }
    encoded
}

/// Redacts the secrets of a database connection URL or of a `key=value`
/// connection string so it is safe to include in error messages and logs.
pub fn redact_database_url(url: &str) -> String {
    let Some((scheme, rest)) = url.split_once("://") else {
        return redact_keyword_values(url);
    };
    // The driver reads everything up to the first `@` as the credentials, so a
    // password containing `?` belongs to them and must not be mistaken for the
    // start of the query. Splitting them off first mirrors that.
    let (credentials, remainder) = match rest.split_once('@') {
        Some((credentials, remainder)) => {
            let user = credentials
                .split_once(':')
                .map_or(credentials, |(user, _)| user);
            (format!("{user}:{REDACTED}@"), remainder)
        }
        None => (String::new(), rest),
    };
    match remainder.split_once('?') {
        Some((host_and_path, query)) => format!(
            "{scheme}://{credentials}{host_and_path}?{}",
            redact_query(query)
        ),
        None => format!("{scheme}://{credentials}{remainder}"),
    }
}

const REDACTED: &str = "***";

/// The connection parameters that carry a secret, in the spelling libpq uses.
const SECRET_KEYS: [&str; 3] = ["password", "sslpassword", "sslkey"];

fn is_secret(key: &str) -> bool {
    SECRET_KEYS
        .iter()
        .any(|secret| key.trim().eq_ignore_ascii_case(secret))
}

fn redact_query(query: &str) -> String {
    query
        .split('&')
        .map(|pair| match pair.split_once('=') {
            Some((key, _)) if is_secret(key) => format!("{key}={REDACTED}"),
            _ => pair.to_owned(),
        })
        .collect::<Vec<_>>()
        .join("&")
}

/// Redacts a `key=value` connection string with the quoting rules of the
/// driver, so a quoted or escaped password is redacted as a whole instead of
/// leaking the part behind its first space.
fn redact_keyword_values(connection_string: &str) -> String {
    let mut redacted = String::with_capacity(connection_string.len());
    let mut rest = connection_string;
    while !rest.is_empty() {
        let value = rest.trim_start();
        redacted.push_str(&rest[..rest.len() - value.len()]);
        let Some(separator) = value.find('=') else {
            redacted.push_str(value);
            break;
        };
        let key = &value[..separator];
        let value = &value[separator + 1..];
        let space = value.len() - value.trim_start().len();
        let (secret, remainder) = take_value(&value[space..]);
        redacted.push_str(key);
        redacted.push('=');
        redacted.push_str(&value[..space]);
        redacted.push_str(if is_secret(key) { REDACTED } else { secret });
        rest = remainder;
    }
    redacted
}

/// Takes one value of a `key=value` connection string: quoted with `'` or
/// ending at the next space, with `\` escaping the character behind it.
fn take_value(value: &str) -> (&str, &str) {
    let mut characters = value.char_indices();
    let quoted = value.starts_with('\'');
    if quoted {
        characters.next();
    }
    let mut end = value.len();
    while let Some((index, character)) = characters.next() {
        match character {
            '\\' => {
                characters.next();
            }
            '\'' if quoted => {
                end = index + 1;
                break;
            }
            character if !quoted && character.is_whitespace() => {
                end = index;
                break;
            }
            _ => {}
        }
    }
    value.split_at(end)
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

    fn local_url() -> String {
        "postgresql://worktimetracker@localhost/worktimetracker".to_owned()
    }

    fn remote_url() -> String {
        "postgresql://app@db.codehub.org/postgres?sslmode=verify-full".to_owned()
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
        assert_eq!(config.mode, DeploymentMode::Development);
        assert!(config.run_migrations);
        assert_eq!(config.root_cert, None);
    }

    #[test]
    fn defaults_to_development_without_a_mode() {
        let config = DbConfig::resolve(&vars(&[(DATABASE_URL_ENV, &local_url())])).unwrap();

        assert_eq!(config.mode, DeploymentMode::Development);
    }

    #[test]
    fn rejects_an_unknown_deployment_mode() {
        let error = DbConfig::resolve(&vars(&[
            (DEPLOYMENT_MODE_ENV, "staging"),
            (DATABASE_URL_ENV, &local_url()),
        ]))
        .expect_err("must reject an unknown mode");

        assert_eq!(
            error.to_string(),
            "WORK_TIME_TRACKER_ENV must be either \"development\" or \"production\", not \"staging\""
        );
    }

    #[test]
    fn assembles_the_production_url_from_the_injected_settings() {
        let user = "app.project-ref";
        let secret = "pass word/@";
        let config = DbConfig::resolve(&vars(&[
            (DEPLOYMENT_MODE_ENV, "production"),
            (DB_HOST_ENV, "db.codehub.org"),
            (DB_PORT_ENV, "6543"),
            (DB_USER_ENV, user),
            (DB_PASSWORD_ENV, secret),
            (DB_NAME_ENV, "postgres"),
            (DB_ROOT_CERT_ENV, "/etc/work-time-tracker/ca.crt"),
        ]))
        .unwrap();

        assert_eq!(
            config.database_url,
            format!(
                "postgresql://{}:{}@db.codehub.org:6543/postgres?sslmode=verify-full",
                encode(user),
                encode(secret)
            )
        );
        // The reserved characters of the password never reach the parser.
        assert!(!config.database_url.contains(secret));
        assert_eq!(config.mode, DeploymentMode::Production);
        assert_eq!(
            config.root_cert.as_deref(),
            Some("/etc/work-time-tracker/ca.crt")
        );
    }

    #[test]
    fn defaults_the_production_port_and_database() {
        let config = DbConfig::resolve(&vars(&[
            (DEPLOYMENT_MODE_ENV, "production"),
            (DB_HOST_ENV, "db.codehub.org"),
            (DB_USER_ENV, "app"),
            (DB_PASSWORD_ENV, "secret"),
        ]))
        .unwrap();

        assert!(config.database_url.contains(&format!(
            "@db.codehub.org:{DEFAULT_PORT}/{DEFAULT_DATABASE}"
        )));
        assert!(config.database_url.ends_with("?sslmode=verify-full"));
    }

    #[test]
    fn the_database_url_takes_precedence_in_production() {
        let config = DbConfig::resolve(&vars(&[
            (DEPLOYMENT_MODE_ENV, "production"),
            (DATABASE_URL_ENV, &remote_url()),
            (DB_HOST_ENV, "ignored.codehub.org"),
            (DB_USER_ENV, "ignored"),
            (DB_PASSWORD_ENV, "ignored"),
        ]))
        .unwrap();

        assert_eq!(config.database_url, remote_url());
    }

    #[test]
    fn reports_every_missing_production_setting_by_name() {
        let error = DbConfig::resolve(&vars(&[
            (DEPLOYMENT_MODE_ENV, "production"),
            (DB_HOST_ENV, "db.codehub.org"),
            (DB_PASSWORD_ENV, "   "),
        ]))
        .expect_err("must require the missing settings");

        assert_eq!(
            error.to_string(),
            "WORK_TIME_TRACKER_ENV=production requires DATABASE_URL or the database settings; \
             missing: SUPABASE_DB_USER, SUPABASE_DB_PASSWORD"
        );
    }

    #[test]
    fn rejects_a_malformed_production_port() {
        for port in ["0", "70000", "5432; DROP", ""] {
            let error = DbConfig::resolve(&vars(&[
                (DEPLOYMENT_MODE_ENV, "production"),
                (DB_HOST_ENV, "db.codehub.org"),
                (DB_USER_ENV, "app"),
                (DB_PASSWORD_ENV, "secret"),
                (DB_PORT_ENV, port),
            ]));

            if port.is_empty() {
                // A blank value counts as unset and falls back to the default.
                assert!(error.is_ok());
            } else {
                assert_eq!(
                    error.expect_err("must reject the port"),
                    ConfigError::InvalidPort
                );
            }
        }
    }

    #[test]
    fn rejects_a_production_host_that_is_not_a_host_name() {
        for host in [
            "db.codehub.org/database",
            "db.codehub.org:5432",
            "user@db.codehub.org",
            "db.codehub.org?sslmode=disable",
        ] {
            let error = DbConfig::resolve(&vars(&[
                (DEPLOYMENT_MODE_ENV, "production"),
                (DB_HOST_ENV, host),
                (DB_USER_ENV, "app"),
                (DB_PASSWORD_ENV, "secret"),
            ]))
            .expect_err("must reject the host");

            assert_eq!(error, ConfigError::InvalidHost);
        }
    }

    #[test]
    fn migrations_run_in_development_but_not_in_production() {
        let development = DbConfig::resolve(&vars(&[(DATABASE_URL_ENV, &local_url())])).unwrap();
        let production = DbConfig::resolve(&vars(&[
            (DEPLOYMENT_MODE_ENV, "production"),
            (DATABASE_URL_ENV, &remote_url()),
        ]))
        .unwrap();
        let migration_step = DbConfig::resolve_for_migration(&vars(&[
            (DEPLOYMENT_MODE_ENV, "production"),
            (DATABASE_URL_ENV, &remote_url()),
            (MIGRATE_ENV, "true"),
        ]))
        .unwrap();

        assert!(development.run_migrations);
        assert!(!production.run_migrations);
        assert!(migration_step.run_migrations);
    }

    /// The flag authorizes the separate migration step alone. An application
    /// process that carries it still only verifies the migrations.
    #[test]
    fn an_application_process_never_migrates_a_production_database() {
        let vars = vars(&[
            (DEPLOYMENT_MODE_ENV, "production"),
            (DATABASE_URL_ENV, &remote_url()),
            (MIGRATE_ENV, "true"),
        ]);

        assert!(!DbConfig::resolve(&vars).unwrap().run_migrations);
        assert!(
            DbConfig::resolve_for_migration(&vars)
                .unwrap()
                .run_migrations
        );
    }

    #[test]
    fn the_migration_step_needs_the_flag_for_a_production_database() {
        let config = DbConfig::resolve_for_migration(&vars(&[
            (DEPLOYMENT_MODE_ENV, "production"),
            (DATABASE_URL_ENV, &remote_url()),
        ]))
        .unwrap();

        assert!(!config.run_migrations);
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
    fn redacts_a_remote_url_with_query_parameters() {
        let user = "app.project-ref";
        let secret = "hunter2";
        let rest = "db.codehub.org:6543/postgres?sslmode=verify-full&sslrootcert=/etc/ca.crt";
        let url = format!("postgresql://{user}:{secret}@{rest}");

        let redacted = redact_database_url(&url);

        assert_eq!(redacted, format!("postgresql://{user}:***@{rest}"));
        assert!(!redacted.contains(secret));
    }

    #[test]
    fn redacts_a_secret_query_parameter() {
        let secret = "hunter2";
        let key = SECRET_KEYS[0];
        let rest = "db.codehub.org/postgres?sslmode=verify-full";
        let url = format!("postgresql://app@{rest}&{key}={secret}");

        let redacted = redact_database_url(&url);

        assert_eq!(
            redacted,
            format!("postgresql://app:{REDACTED}@{rest}&{key}={REDACTED}")
        );
        assert!(!redacted.contains(secret));
    }

    #[test]
    fn redacts_a_password_that_contains_a_question_mark() {
        // The driver reads the credentials up to the first `@`, so `?` is part
        // of the password and must not be read as the start of the query.
        let secret = "hun?ter2";
        let rest = "db.codehub.org:6543/postgres?sslmode=verify-full";
        let url = format!("postgresql://app:{secret}@{rest}");

        let redacted = redact_database_url(&url);

        assert_eq!(redacted, format!("postgresql://app:{REDACTED}@{rest}"));
        assert!(!redacted.contains(secret));
    }

    #[test]
    fn redacts_a_quoted_password_of_a_keyword_value_connection_string() {
        let secret = "hunter 2";
        let key = SECRET_KEYS[0];
        let connection_string = format!("host=localhost {key}='{secret}' dbname=worktimetracker");

        let redacted = redact_database_url(&connection_string);

        assert_eq!(
            redacted,
            format!("host=localhost {key}={REDACTED} dbname=worktimetracker")
        );
        assert!(!redacted.contains("hunter") && !redacted.contains(" 2"));
    }

    #[test]
    fn redacts_an_escaped_password_of_a_keyword_value_connection_string() {
        let key = SECRET_KEYS[0];
        let connection_string = format!("host=localhost {key}=hunter\\ 2 dbname=worktimetracker");

        let redacted = redact_database_url(&connection_string);

        assert_eq!(
            redacted,
            format!("host=localhost {key}={REDACTED} dbname=worktimetracker")
        );
    }

    #[test]
    fn keeps_a_keyword_value_connection_string_without_a_secret_readable() {
        let connection_string = "host=localhost  port=5432 user=postgres dbname=worktimetracker";

        assert_eq!(redact_database_url(connection_string), connection_string);
    }

    #[test]
    fn redacts_the_password_of_a_keyword_value_connection_string() {
        let secret = "hunter2";
        let key = SECRET_KEYS[0];
        let prefix = "host=localhost port=5432 user=postgres";
        let connection_string = format!("{prefix} {key}={secret} dbname=worktimetracker");

        let redacted = redact_database_url(&connection_string);

        assert_eq!(
            redacted,
            format!("{prefix} {key}={REDACTED} dbname=worktimetracker")
        );
        assert!(!redacted.contains(secret));
    }

    #[test]
    fn leaves_malformed_urls_unchanged() {
        assert_eq!(redact_database_url("not-a-url"), "not-a-url");
    }
}

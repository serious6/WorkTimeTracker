//! Validates a database connection string and builds its TLS connector.
//!
//! Development, tests and CI may only reach local Postgres without TLS.
//! Production must reach a remote host with `sslmode=verify-full` and the
//! pinned certificate authority; there is no downgrade path.

use std::{net::IpAddr, sync::Arc};

use postgres::config::{Host, SslMode};
use rustls::{
    pki_types::{pem::PemObject, CertificateDer},
    ClientConfig, RootCertStore,
};
use tokio_postgres_rustls::MakeRustlsConnect;

use crate::config::DeploymentMode;

/// Set by `compose.yaml`, where the database is the service `db` instead of a
/// loopback address.
pub const COMPOSE_ENV: &str = "WORK_TIME_TRACKER_COMPOSE";
const COMPOSE_HOST: &str = "db";
const VERIFY_FULL: &str = "verify-full";
const DISABLE: &str = "disable";
pub(crate) const APP_SCHEMA: &str = "wtt";
/// Pinned at connection startup because the store uses unqualified SQL; direct
/// test clients must set the same option when they query application tables.
/// The path intentionally excludes `public` for the Supabase defense-in-depth
/// boundary.
pub(crate) fn search_path_options() -> String {
    format!("-c search_path={APP_SCHEMA}")
}

fn options_with_search_path(existing: Option<&str>) -> String {
    match existing.filter(|options| !options.trim().is_empty()) {
        Some(options) => format!("{options} {}", search_path_options()),
        None => search_path_options(),
    }
}

/// How a connection is protected. `Disabled` is the local development case,
/// which matches the plain connection the compose database offers.
#[derive(Debug, PartialEq, Eq)]
pub enum TlsPlan {
    Disabled,
    Verified { root_cert: String },
}

/// A validated connection string, ready to be turned into a pool.
pub struct Plan {
    pub config: postgres::Config,
    pub tls: TlsPlan,
}

#[derive(Debug, PartialEq, Eq)]
pub enum ConnectionError {
    /// The connection string itself does not parse.
    Parse(String),
    /// A host that is not local, outside of a production deployment.
    RemoteHost(String),
    /// A local host inside a production deployment, which must reach the
    /// remote database of that deployment.
    LocalHost(String),
    /// A remote host without a fully verified TLS connection.
    UnverifiedTls { host: String, ssl_mode: String },
    /// A TLS connection without the certificate authority to verify against.
    MissingRootCert,
    /// The pinned certificate authority cannot be used.
    RootCert(String),
    /// The TLS stack itself refused the configuration.
    Tls(String),
}

impl std::fmt::Display for ConnectionError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Parse(error) => write!(formatter, "{error}"),
            Self::RemoteHost(host) => write!(
                formatter,
                "database host {host:?} is not local; allowed TCP hosts are localhost and loopback addresses"
            ),
            Self::LocalHost(host) => write!(
                formatter,
                "database host {host:?} is local; a production deployment must reach its remote database"
            ),
            Self::UnverifiedTls { host, ssl_mode } => write!(
                formatter,
                "database host {host:?} is remote and sslmode={ssl_mode} does not verify the server certificate; sslmode={VERIFY_FULL} is required"
            ),
            Self::MissingRootCert => write!(
                formatter,
                "sslmode={VERIFY_FULL} needs the certificate authority to verify the server against; set {} or sslrootcert",
                crate::config::DB_ROOT_CERT_ENV
            ),
            Self::RootCert(error) => write!(
                formatter,
                "the pinned certificate authority could not be read: {error}"
            ),
            Self::Tls(error) => write!(formatter, "the TLS connector could not be built: {error}"),
        }
    }
}

impl std::error::Error for ConnectionError {}

/// Whether the process runs inside the compose stack, where the database is
/// the neighbouring service `db` rather than a loopback address.
pub fn compose_mode() -> bool {
    std::env::var(COMPOSE_ENV).is_ok_and(|value| value.eq_ignore_ascii_case("true"))
}

/// Validates the connection string against the deployment mode. Performs no
/// I/O, so the rules can be unit tested without a server or a certificate.
pub fn plan(
    database_url: &str,
    mode: DeploymentMode,
    root_cert: Option<&str>,
) -> Result<Plan, ConnectionError> {
    let (base, options) = split_ssl_options(database_url);
    let mut config: postgres::Config = base
        .parse()
        .map_err(|error: postgres::Error| ConnectionError::Parse(error.to_string()))?;
    let requested = options
        .ssl_mode
        .map(|value| value.trim().to_ascii_lowercase());
    let verify_full = requested.as_deref() == Some(VERIFY_FULL);

    if let Some(host) = remote_host(&config, compose_mode()) {
        if !mode.is_production() {
            return Err(ConnectionError::RemoteHost(host));
        }
        if !verify_full {
            return Err(ConnectionError::UnverifiedTls {
                host,
                ssl_mode: requested.unwrap_or_else(|| DISABLE.to_owned()),
            });
        }
    } else if mode.is_production() {
        // A production build talks to the remote database of its deployment.
        // Without this it would fall through to the plaintext local plan.
        return Err(ConnectionError::LocalHost(local_host_name(&config)));
    }

    if verify_full {
        let root_cert = options
            .root_cert
            .or_else(|| root_cert.map(str::to_owned))
            .filter(|path| !path.trim().is_empty())
            .ok_or(ConnectionError::MissingRootCert)?;
        // The driver only has to insist on TLS; the chain and the host name
        // are verified by the connector built from `root_cert`.
        config.ssl_mode(SslMode::Require);
        let startup_options = options_with_search_path(config.get_options());
        config.options(&startup_options);
        Ok(Plan {
            config,
            tls: TlsPlan::Verified { root_cert },
        })
    } else {
        if let Some(ssl_mode) = requested.filter(|value| value != DISABLE) {
            return Err(ConnectionError::UnverifiedTls {
                host: local_host_name(&config),
                ssl_mode,
            });
        }
        config.ssl_mode(SslMode::Disable);
        let startup_options = options_with_search_path(config.get_options());
        config.options(&startup_options);
        Ok(Plan {
            config,
            tls: TlsPlan::Disabled,
        })
    }
}

/// The validated configuration together with the connector it must be used
/// with. Reads the pinned certificate authority, so it can fail on I/O.
pub fn prepare(
    database_url: &str,
    mode: DeploymentMode,
    root_cert: Option<&str>,
) -> Result<(postgres::Config, MakeRustlsConnect), ConnectionError> {
    let plan = plan(database_url, mode, root_cert)?;
    let roots = match &plan.tls {
        TlsPlan::Disabled => RootCertStore::empty(),
        TlsPlan::Verified { root_cert } => pinned_roots(root_cert)?,
    };
    Ok((plan.config, connector(roots)?))
}

/// The certificate authority a remote server is verified against. Only the
/// pinned authority is trusted, never the certificate store of the machine.
fn pinned_roots(path: &str) -> Result<RootCertStore, ConnectionError> {
    let certificates: Vec<CertificateDer<'static>> = CertificateDer::pem_file_iter(path)
        .map_err(|error| ConnectionError::RootCert(error.to_string()))?
        .collect::<Result<_, _>>()
        .map_err(|error| ConnectionError::RootCert(error.to_string()))?;
    if certificates.is_empty() {
        return Err(ConnectionError::RootCert(
            "the file contains no certificate".to_owned(),
        ));
    }
    let mut roots = RootCertStore::empty();
    for certificate in certificates {
        roots
            .add(certificate)
            .map_err(|error| ConnectionError::RootCert(error.to_string()))?;
    }
    Ok(roots)
}

fn connector(roots: RootCertStore) -> Result<MakeRustlsConnect, ConnectionError> {
    let provider = Arc::new(rustls::crypto::ring::default_provider());
    let config = ClientConfig::builder_with_provider(provider)
        .with_safe_default_protocol_versions()
        .map_err(|error| ConnectionError::Tls(error.to_string()))?
        .with_root_certificates(roots)
        .with_no_client_auth();
    Ok(MakeRustlsConnect::new(config))
}

/// The first host of the configuration that is not a local development
/// server, if any.
fn remote_host(config: &postgres::Config, compose_mode: bool) -> Option<String> {
    for host in config.get_hosts() {
        match host {
            Host::Tcp(host) => {
                let local = host.eq_ignore_ascii_case("localhost")
                    || (compose_mode && host.eq_ignore_ascii_case(COMPOSE_HOST))
                    || host
                        .parse::<IpAddr>()
                        .is_ok_and(|address| address.is_loopback());
                if !local {
                    return Some(host.clone());
                }
            }
            #[cfg(unix)]
            Host::Unix(_) => {}
        }
    }
    config
        .get_hostaddrs()
        .iter()
        .find(|address| !address.is_loopback())
        .map(ToString::to_string)
}

/// Names the local host of a configuration, for the error of a local
/// connection that asks for an ssl mode which verifies nothing.
fn local_host_name(config: &postgres::Config) -> String {
    config
        .get_hosts()
        .iter()
        .find_map(|host| match host {
            Host::Tcp(host) => Some(host.clone()),
            #[cfg(unix)]
            Host::Unix(_) => None,
        })
        .unwrap_or_else(|| "localhost".to_owned())
}

#[derive(Default)]
struct SslOptions {
    ssl_mode: Option<String>,
    root_cert: Option<String>,
}

/// Splits `sslmode` and `sslrootcert` off the connection string. Both are
/// libpq parameters that the driver does not understand: it knows no
/// `verify-full` and no certificate file, which is exactly what this module
/// implements on top of it.
fn split_ssl_options(database_url: &str) -> (String, SslOptions) {
    let mut options = SslOptions::default();
    let Some(query) = query_start(database_url) else {
        if url_body(database_url).is_some() {
            return (database_url.to_owned(), options);
        }
        let kept: Vec<&str> = database_url
            .split(' ')
            .filter(|parameter| !take_ssl_option(parameter, false, &mut options))
            .collect();
        return (kept.join(" "), options);
    };
    let prefix = &database_url[..query];
    let kept: Vec<&str> = database_url[query + 1..]
        .split('&')
        .filter(|parameter| !take_ssl_option(parameter, true, &mut options))
        .collect();
    let base = if kept.is_empty() {
        prefix.to_owned()
    } else {
        format!("{prefix}?{}", kept.join("&"))
    };
    (base, options)
}

/// Everything behind the scheme of a connection URL. The driver decides by
/// exactly these two prefixes and reads anything else as a `key=value`
/// connection string, where `?` and `&` are ordinary characters.
fn url_body(database_url: &str) -> Option<&str> {
    database_url
        .strip_prefix("postgresql://")
        .or_else(|| database_url.strip_prefix("postgres://"))
}

/// The index of the `?` that opens the query of a connection URL. The driver
/// reads everything up to the first `@` as the credentials, so a password
/// containing a `?` does not start the query.
fn query_start(database_url: &str) -> Option<usize> {
    let body = url_body(database_url)?;
    let offset = database_url.len() - body.len();
    let credentials = body
        .split_once('@')
        .map_or(0, |(credentials, _)| credentials.len() + 1);
    body[credentials..]
        .find('?')
        .map(|index| offset + credentials + index)
}

/// Answers whether the parameter is one of the two TLS options, and remembers
/// its value if so.
fn take_ssl_option(parameter: &str, encoded: bool, options: &mut SslOptions) -> bool {
    let Some((key, value)) = parameter.split_once('=') else {
        return false;
    };
    let value = if encoded {
        percent_decode(value)
    } else {
        value.to_owned()
    };
    match key.trim().to_ascii_lowercase().as_str() {
        "sslmode" => options.ssl_mode = Some(value),
        "sslrootcert" => options.root_cert = Some(value),
        _ => return false,
    }
    true
}

fn percent_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let digit = |index: usize| {
        bytes
            .get(index)
            .map(|byte| char::from(*byte))
            .and_then(|character| character.to_digit(16))
    };
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        match (bytes[index], digit(index + 1), digit(index + 2)) {
            (b'%', Some(high), Some(low)) => {
                decoded.push((high * 16 + low) as u8);
                index += 3;
            }
            (byte, _, _) => {
                decoded.push(byte);
                index += 1;
            }
        }
    }
    String::from_utf8_lossy(&decoded).into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    const LOCAL_URLS: [&str; 6] = [
        "postgresql://user@localhost/database",
        "postgresql://user@LOCALHOST/database",
        "postgresql://user@127.0.0.1/database",
        "postgresql://user@127.42.0.9/database",
        "postgresql://user@[::1]/database",
        "host=localhost hostaddr=127.0.0.1 dbname=database",
    ];
    const REMOTE_URLS: [&str; 5] = [
        "postgresql://user@codehub.org/database",
        "postgresql://user@192.168.1.20/database",
        "postgresql://user@10.0.0.5/database",
        "postgresql://user@[2001:db8::1]/database",
        "host=localhost hostaddr=203.0.113.8 dbname=database",
    ];
    const CERT: &str = "/etc/work-time-tracker/ca.crt";

    fn development(url: &str) -> Result<Plan, ConnectionError> {
        plan(url, DeploymentMode::Development, None)
    }

    fn production(url: &str) -> Result<Plan, ConnectionError> {
        plan(url, DeploymentMode::Production, Some(CERT))
    }

    /// Appends a parameter in the spelling of the connection string it is
    /// added to: the query of a URL, another pair of a keyword/value string.
    fn with(url: &str, parameter: &str) -> String {
        if url_body(url).is_some() {
            format!("{url}?{parameter}")
        } else {
            format!("{url} {parameter}")
        }
    }

    #[test]
    fn accepts_supported_local_database_hosts() {
        for url in LOCAL_URLS {
            let plan = development(url).unwrap_or_else(|error| panic!("{url}: {error}"));
            let options = search_path_options();

            assert_eq!(plan.tls, TlsPlan::Disabled);
            assert_eq!(plan.config.get_ssl_mode(), SslMode::Disable);
            assert_eq!(plan.config.get_options(), Some(options.as_str()));
        }
    }

    #[test]
    fn accepts_the_compose_database_host_only_in_compose_mode() {
        let config: postgres::Config = "postgresql://user@db/database".parse().unwrap();

        assert!(remote_host(&config, true).is_none());
        assert_eq!(remote_host(&config, false).as_deref(), Some("db"));
    }

    #[test]
    fn rejects_remote_database_hosts_outside_production() {
        for url in REMOTE_URLS {
            let error = development(url).err().expect("remote host is rejected");

            assert!(error.to_string().contains("is not local"), "{url}: {error}");
        }
    }

    #[test]
    fn rejects_a_remote_database_host_in_a_multi_host_configuration() {
        assert!(development("host=localhost,codehub.org dbname=database").is_err());
    }

    #[test]
    fn accepts_a_remote_host_with_a_verified_connection_in_production() {
        for url in REMOTE_URLS {
            let url = with(url, &format!("sslmode={VERIFY_FULL}"));
            let plan = production(&url).unwrap_or_else(|error| panic!("{url}: {error}"));
            let options = search_path_options();

            assert_eq!(
                plan.tls,
                TlsPlan::Verified {
                    root_cert: CERT.to_owned()
                }
            );
            assert_eq!(plan.config.get_ssl_mode(), SslMode::Require);
            assert_eq!(plan.config.get_options(), Some(options.as_str()));
        }
    }

    #[test]
    fn rejects_a_remote_host_whose_ssl_mode_verifies_nothing() {
        for ssl_mode in ["disable", "allow", "prefer", "require", "verify-ca"] {
            let url = format!("postgresql://user@db.codehub.org/database?sslmode={ssl_mode}");

            let error = production(&url).err().expect("must reject");

            assert_eq!(
                error,
                ConnectionError::UnverifiedTls {
                    host: "db.codehub.org".to_owned(),
                    ssl_mode: ssl_mode.to_owned(),
                }
            );
        }
    }

    #[test]
    fn rejects_a_remote_host_without_an_ssl_mode() {
        let error = plan(
            "postgresql://user@db.codehub.org/database",
            DeploymentMode::Production,
            Some(CERT),
        )
        .err()
        .expect("must reject");

        assert!(error.to_string().contains(VERIFY_FULL), "{error}");
    }

    #[test]
    fn rejects_a_local_host_in_production() {
        for url in LOCAL_URLS {
            let error = production(url).err().expect("must reject");

            assert!(
                matches!(error, ConnectionError::LocalHost(_)),
                "{url}: {error}, a production build must not fall back to a local database"
            );
        }
    }

    /// Even a `verify-full` local connection stays refused: production is the
    /// deployment, not a TLS terminated development server.
    #[test]
    fn rejects_a_local_host_in_production_with_a_verified_connection() {
        let error = production("postgresql://user@localhost/database?sslmode=verify-full")
            .err()
            .expect("must reject");

        assert_eq!(error, ConnectionError::LocalHost("localhost".to_owned()));
    }

    #[test]
    fn rejects_a_verified_connection_without_a_pinned_authority() {
        let error = plan(
            "postgresql://user@db.codehub.org/database?sslmode=verify-full",
            DeploymentMode::Production,
            None,
        )
        .err()
        .expect("must reject");

        assert_eq!(error, ConnectionError::MissingRootCert);
    }

    #[test]
    fn rejects_a_local_host_whose_ssl_mode_verifies_nothing() {
        let error = development("postgresql://user@localhost/database?sslmode=require")
            .err()
            .expect("must reject");

        assert_eq!(
            error,
            ConnectionError::UnverifiedTls {
                host: "localhost".to_owned(),
                ssl_mode: "require".to_owned(),
            }
        );
    }

    #[test]
    fn keeps_the_remaining_connection_parameters() {
        let plan = production(
            "postgresql://user@db.codehub.org:6543/database?sslmode=verify-full&application_name=wtt&sslrootcert=%2Ftmp%2Fca%20file.crt",
        )
        .unwrap();

        assert_eq!(plan.config.get_application_name(), Some("wtt"));
        assert_eq!(plan.config.get_ports(), [6543]);
        assert_eq!(
            plan.tls,
            TlsPlan::Verified {
                // The parameter of the connection string wins over the
                // separately configured authority, and is percent-decoded.
                root_cert: "/tmp/ca file.crt".to_owned()
            }
        );
    }

    #[test]
    fn appends_the_schema_to_existing_startup_options() {
        let plan = development(
            "postgresql://user@localhost/database?options=-c%20statement_timeout%3D5000",
        )
        .unwrap();

        assert_eq!(
            plan.config.get_options(),
            Some("-c statement_timeout=5000 -c search_path=wtt")
        );
    }

    #[test]
    fn keeps_the_remaining_keyword_value_parameters() {
        let plan = plan(
            "host=db.codehub.org sslmode=verify-full dbname=database sslrootcert=/tmp/ca.crt",
            DeploymentMode::Production,
            None,
        )
        .unwrap();

        assert_eq!(plan.config.get_dbname(), Some("database"));
        assert_eq!(
            plan.tls,
            TlsPlan::Verified {
                root_cert: "/tmp/ca.crt".to_owned()
            }
        );
    }

    #[test]
    fn reads_the_query_behind_a_password_that_contains_a_question_mark() {
        let plan = production(
            "postgresql://user:pa?ss@db.codehub.org/database?sslmode=verify-full&application_name=wtt",
        )
        .expect("the query of a URL starts behind the credentials");

        assert_eq!(plan.config.get_password(), Some("pa?ss".as_bytes()));
        assert_eq!(plan.config.get_application_name(), Some("wtt"));
        assert_eq!(
            plan.tls,
            TlsPlan::Verified {
                root_cert: CERT.to_owned()
            }
        );
    }

    #[test]
    fn keeps_a_keyword_value_string_that_contains_a_question_mark() {
        let plan = plan(
            "host=db.codehub.org sslmode=verify-full dbname=database application_name=wtt?1",
            DeploymentMode::Production,
            Some(CERT),
        )
        .expect("a `?` is an ordinary character of a keyword/value string");

        assert_eq!(plan.config.get_application_name(), Some("wtt?1"));
        assert_eq!(plan.config.get_dbname(), Some("database"));
        assert_eq!(
            plan.tls,
            TlsPlan::Verified {
                root_cert: CERT.to_owned()
            }
        );
    }

    #[test]
    fn reports_a_connection_string_that_does_not_parse() {
        let error = development("postgresql://user@localhost/database?nonsense=1")
            .err()
            .expect("must reject");

        assert!(matches!(error, ConnectionError::Parse(_)), "{error}");
    }

    #[test]
    fn fails_closed_when_the_pinned_authority_is_missing() {
        let error = prepare(
            "postgresql://user@db.codehub.org/database?sslmode=verify-full",
            DeploymentMode::Production,
            Some("/nonexistent/work-time-tracker-ca.crt"),
        )
        .err()
        .expect("must reject");

        assert!(
            matches!(error, ConnectionError::RootCert(_)),
            "{error}, a remote connection must not fall back to an unverified one"
        );
    }

    #[test]
    fn builds_a_connector_for_a_local_connection() {
        let (config, _connector) = prepare(LOCAL_URLS[0], DeploymentMode::Development, None)
            .expect("a local connection needs no certificate");

        assert_eq!(config.get_ssl_mode(), SslMode::Disable);
    }
}

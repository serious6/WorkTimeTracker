//! Entry points of the fuzz targets in `src-tauri/fuzz`.
//!
//! Every module of the backend is private, because nothing outside the binary
//! is meant to call into it. The `fuzzing` feature opens exactly the pure
//! parsers and validators the targets drive, so a fuzzing run needs no change
//! to the visibility of the code it exercises.

pub use crate::config::{redact_database_url, ENV_KEYS};
pub use crate::logging::{leaks_secret, redact, redact_keeping_layout};
pub use crate::models::{SaveAbsence, SaveProject, SaveTimeEntry};

/// Reads the settings file of a portable installation, as
/// [`crate::portable::settings`] does after loading it from disk. The error
/// type stays private, because a target only needs to know whether the
/// contents were accepted.
pub fn parse_portable_settings(contents: &str) -> Option<Vec<(String, String)>> {
    let settings = crate::portable::parse(contents).ok()?;
    let mut settings: Vec<(String, String)> = settings.into_iter().collect();
    settings.sort();
    Some(settings)
}

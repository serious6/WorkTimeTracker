use std::sync::PoisonError;

use serde::Serialize;

/// Failure of a command. The kind travels over the IPC boundary, so the user
/// interface can branch on it instead of matching message text.
#[derive(Debug, PartialEq, Serialize)]
#[serde(tag = "kind", content = "message", rename_all = "camelCase")]
pub enum AppError {
    NotSignedIn(String),
    Validation(String),
    Conflict(String),
    NotFound(String),
    RateLimited(String),
    Database(String),
    Internal(String),
}

pub type AppResult<T> = Result<T, AppError>;

impl AppError {
    pub fn not_signed_in() -> Self {
        Self::NotSignedIn("Please sign in first".to_owned())
    }

    pub fn validation(message: impl Into<String>) -> Self {
        Self::Validation(message.into())
    }

    pub fn conflict(message: impl Into<String>) -> Self {
        Self::Conflict(message.into())
    }

    /// A failure of the process itself, such as a key derivation or a poisoned
    /// lock. It is not an infrastructure failure of the database.
    pub fn internal(message: impl Into<String>) -> Self {
        Self::Internal(message.into())
    }

    /// Name of the variant, used as the category in the log file.
    pub fn kind(&self) -> &'static str {
        match self {
            Self::NotSignedIn(_) => "notSignedIn",
            Self::Validation(_) => "validation",
            Self::Conflict(_) => "conflict",
            Self::NotFound(_) => "notFound",
            Self::RateLimited(_) => "rateLimited",
            Self::Database(_) => "database",
            Self::Internal(_) => "internal",
        }
    }

    pub fn message(&self) -> &str {
        match self {
            Self::NotSignedIn(message)
            | Self::Validation(message)
            | Self::Conflict(message)
            | Self::NotFound(message)
            | Self::RateLimited(message)
            | Self::Database(message)
            | Self::Internal(message) => message,
        }
    }
}

impl From<&str> for AppError {
    fn from(message: &str) -> Self {
        Self::validation(message)
    }
}

/// Generic mapping used for storage failures that are not a known-message
/// conflict (unique violations get their per-command message via
/// `commands::unique_error` before reaching here).
impl From<crate::store::StoreError> for AppError {
    fn from(error: crate::store::StoreError) -> Self {
        match error {
            crate::store::StoreError::NotFound => {
                Self::NotFound("The record was not found".to_owned())
            }
            crate::store::StoreError::UniqueViolation => {
                Self::Conflict("This record already exists".to_owned())
            }
            crate::store::StoreError::Backend(message) => Self::Database(message),
        }
    }
}

/// A poisoned lock means another command panicked while holding it.
impl<T> From<PoisonError<T>> for AppError {
    fn from(error: PoisonError<T>) -> Self {
        Self::internal(error.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_the_kind_next_to_the_message() {
        let error = AppError::validation("invalid project name");

        assert_eq!(
            serde_json::to_string(&error).unwrap(),
            r#"{"kind":"validation","message":"invalid project name"}"#
        );
    }

    #[test]
    fn maps_missing_store_rows_to_not_found() {
        assert_eq!(
            AppError::from(crate::store::StoreError::NotFound),
            AppError::NotFound("The record was not found".to_owned())
        );
    }

    #[test]
    fn maps_validation_messages_of_the_models() {
        assert_eq!(
            AppError::from("invalid email"),
            AppError::Validation("invalid email".to_owned())
        );
    }

    #[test]
    fn names_every_kind_for_the_log() {
        assert_eq!(AppError::not_signed_in().kind(), "notSignedIn");
        assert_eq!(AppError::validation("nope").kind(), "validation");
        assert_eq!(AppError::conflict("taken").kind(), "conflict");
        assert_eq!(
            AppError::from(crate::store::StoreError::NotFound).kind(),
            "notFound"
        );
        assert_eq!(AppError::RateLimited(String::new()).kind(), "rateLimited");
        assert_eq!(AppError::Database(String::new()).kind(), "database");
        assert_eq!(AppError::internal("kdf").kind(), "internal");
    }

    #[test]
    fn keeps_the_message_of_every_kind_readable() {
        assert_eq!(AppError::not_signed_in().message(), "Please sign in first");
        assert_eq!(AppError::conflict("taken").message(), "taken");
        assert_eq!(AppError::internal("kdf failed").message(), "kdf failed");
    }
}

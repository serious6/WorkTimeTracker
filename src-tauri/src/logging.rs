use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use chrono::{DateTime, SecondsFormat};

use crate::error::AppResult;

const FILE_NAME: &str = "work-time-tracker.log";
const ROTATED_FILE_NAME: &str = "work-time-tracker.log.1";
/// Above this size the log is rotated once, so the file cannot grow forever.
const MAX_BYTES: u64 = 512 * 1024;
pub(crate) const MAX_MESSAGE_CHARS: usize = 2_000;
const REDACTED: &str = "[redacted]";
const REDACTED_PATH: &str = "[redacted path]";

/// Words whose value is never written to the log.
const SENSITIVE_KEYS: [&str; 11] = [
    "password",
    "passwort",
    "secret",
    "token",
    "hash",
    "credential",
    "credentials",
    "apikey",
    "api_key",
    "authorization",
    "cookie",
];

/// Prefixes of the password hash formats that may appear in a message.
const HASH_PREFIXES: [&str; 6] = ["$argon2", "$pbkdf2", "$scrypt", "$2a$", "$2b$", "$2y$"];

static LOG_FILE: OnceLock<Mutex<PathBuf>> = OnceLock::new();

fn log_dir_for(directory: &Path) -> PathBuf {
    directory.join("logs")
}

/// Points the logger at `<directory>/logs`. Logging before this call is a no-op,
/// so tests and the browser fallback never touch the file system.
pub fn init(directory: &Path) {
    let logs = log_dir_for(directory);
    if fs::create_dir_all(&logs).is_err() {
        return;
    }
    let _ = LOG_FILE.set(Mutex::new(logs.join(FILE_NAME)));
}

/// The file the logger writes to, `None` while [`init`] has not succeeded. A
/// caller may only point a user at the log file once this returns a path.
pub fn file_path() -> Option<PathBuf> {
    LOG_FILE
        .get()
        .and_then(|path| path.lock().ok())
        .map(|path| path.clone())
}

/// Appends one redacted error line. Failures of the logger itself are swallowed:
/// an unwritable log must never break the running application.
pub fn error(source: &str, message: &str) {
    write_line("ERROR", source, message);
}

/// Logs the failure of a command and hands the result back unchanged.
pub fn logged<T>(command: &str, action: impl FnOnce() -> AppResult<T>) -> AppResult<T> {
    let result = action();
    if let Err(failure) = &result {
        error(
            command,
            &format!("{}: {}", failure.kind(), failure.message()),
        );
    }
    result
}

fn write_line(level: &str, source: &str, message: &str) {
    let Some(path) = LOG_FILE.get() else {
        return;
    };
    let Ok(path) = path.lock() else {
        return;
    };
    // The lock also serializes rotation and appending, so lines cannot interleave.
    rotate(&path);
    append(&path, &format_line(level, source, message));
}

fn format_line(level: &str, source: &str, message: &str) -> String {
    format!(
        "{} {} [{}] {}\n",
        timestamp(),
        level,
        redact(&clamp(source)),
        redact(&clamp(message))
    )
}

fn append(path: &Path, line: &str) {
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = file.write_all(line.as_bytes());
    }
}

fn rotate(path: &Path) {
    let Ok(metadata) = fs::metadata(path) else {
        return;
    };
    if metadata.len() < MAX_BYTES {
        return;
    }
    if let Some(parent) = path.parent() {
        let rotated = parent.join(ROTATED_FILE_NAME);
        let _ = fs::remove_file(&rotated);
        let _ = fs::rename(path, rotated);
    }
}

fn timestamp() -> String {
    let elapsed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    i64::try_from(elapsed.as_secs())
        .ok()
        .and_then(|seconds| DateTime::from_timestamp(seconds, 0))
        .map(|time| time.to_rfc3339_opts(SecondsFormat::Secs, true))
        .unwrap_or_else(|| "1970-01-01T00:00:00Z".to_owned())
}

fn clamp(message: &str) -> String {
    message.chars().take(MAX_MESSAGE_CHARS).collect()
}

/// Removes credentials, hashes, e-mail addresses and file system paths from a
/// message. A log line is redacted before it is written, so it is safe wherever it originates.
pub fn redact(message: &str) -> String {
    let message = redact_sensitive_values(message);
    message
        .split_whitespace()
        .map(redact_token)
        .collect::<Vec<_>>()
        .join(" ")
}

/// The same redaction as [`redact`], but the original whitespace is kept, so a
/// multi-line text stays readable where it is shown instead of logged.
pub fn redact_keeping_layout(message: &str) -> String {
    let message = redact_sensitive_values(message);
    let mut redacted = String::new();
    let mut token = String::new();

    for character in message.chars() {
        if character.is_whitespace() {
            if !token.is_empty() {
                redacted.push_str(&redact_token(&token));
                token.clear();
            }
            redacted.push(character);
            continue;
        }
        token.push(character);
    }

    if !token.is_empty() {
        redacted.push_str(&redact_token(&token));
    }
    redacted
}

/// Whether any token of `message` still carries an e-mail address, a password
/// hash or a file system path. The fuzz target in `src-tauri/fuzz` asserts
/// this is false for everything [`redact`] returns.
#[cfg(feature = "fuzzing")]
pub fn leaks_secret(message: &str) -> bool {
    message.split_whitespace().any(needs_redaction)
}

/// Redacts one whitespace-separated token. A `key=value` token keeps its key,
/// so a log line stays readable, but only while that key is no secret itself
/// and while what remains of the token no longer reads as one - a hash cut at
/// a colon must not survive as the label of its own redacted value.
fn redact_token(token: &str) -> String {
    if let Some((key, separator, value)) = split_pair(token) {
        if !is_path(token) && !needs_redaction(key) && needs_redaction(value) {
            let redacted = format!("{key}{separator}{}", replacement(value));
            if !needs_redaction(&redacted) {
                return redacted;
            }
        }
    }
    if needs_redaction(token) {
        return replacement(token).to_owned();
    }
    token.to_owned()
}

fn replacement(token: &str) -> &'static str {
    if is_path(token) {
        REDACTED_PATH
    } else {
        REDACTED
    }
}

fn needs_redaction(token: &str) -> bool {
    contains_email(token) || is_hash(token) || is_path(token)
}

fn redact_sensitive_values(message: &str) -> String {
    let mut redacted = String::new();
    let mut index = 0;

    while index < message.len() {
        if let Some((replacement, end)) = redact_sensitive_at(message, index) {
            redacted.push_str(&replacement);
            index = end;
        } else if let Some(character) = message[index..].chars().next() {
            redacted.push(character);
            index += character.len_utf8();
        } else {
            break;
        }
    }

    redacted
}

fn redact_sensitive_at(message: &str, index: usize) -> Option<(String, usize)> {
    if !is_boundary(message, index) {
        return None;
    }

    let (key, key_end) = match_sensitive_key(message, index)?;
    let separator_index = skip_spaces(message, key_end);
    let separator = message[separator_index..].chars().next()?;
    if separator != ':' && separator != '=' {
        return None;
    }

    let value_start = skip_spaces(message, separator_index + separator.len_utf8());
    if value_start >= message.len() {
        return None;
    }

    let prefix = &message[index..value_start];
    let value = message[value_start..].chars().next()?;
    if value == '"' || value == '\'' {
        return Some((
            format!("{prefix}{value}{REDACTED}{value}"),
            quoted_value_end(message, value_start, value),
        ));
    }

    let value_end = if key == "authorization" {
        authorization_value_end(message, value_start)
            .unwrap_or_else(|| unquoted_value_end(message, value_start))
    } else {
        unquoted_value_end(message, value_start)
    };
    if value_end == value_start {
        return None;
    }

    Some((format!("{prefix}{REDACTED}"), value_end))
}

fn is_boundary(message: &str, index: usize) -> bool {
    if index == 0 {
        return true;
    }
    message[..index]
        .chars()
        .next_back()
        .is_none_or(|character| !is_key_character(character))
}

fn match_sensitive_key(message: &str, index: usize) -> Option<(&'static str, usize)> {
    let quote = match message[index..].chars().next()? {
        '"' => Some('"'),
        '\'' => Some('\''),
        _ => None,
    };
    let key_start = index + quote.map_or(0, char::len_utf8);

    SENSITIVE_KEYS.iter().find_map(|key| {
        let key_end = key_start + key.len();
        // A key is ASCII, so comparing bytes both avoids slicing a multi-byte
        // character in half and proves `key_end` is a character boundary.
        if key_end > message.len()
            || !message.as_bytes()[key_start..key_end].eq_ignore_ascii_case(key.as_bytes())
        {
            return None;
        }

        if let Some(quote) = quote {
            return (message[key_end..].starts_with(quote)).then_some((*key, key_end + 1));
        }

        message[key_end..]
            .chars()
            .next()
            .is_none_or(|character| !is_key_character(character))
            .then_some((*key, key_end))
    })
}

fn is_key_character(character: char) -> bool {
    character.is_ascii_alphanumeric() || character == '_'
}

fn skip_spaces(message: &str, mut index: usize) -> usize {
    while let Some(character) = message[index..].chars().next() {
        if !character.is_whitespace() {
            break;
        }
        index += character.len_utf8();
    }
    index
}

fn quoted_value_end(message: &str, index: usize, quote: char) -> usize {
    let mut escaped = false;
    for (offset, character) in message[index + quote.len_utf8()..].char_indices() {
        if escaped {
            escaped = false;
        } else if character == '\\' {
            escaped = true;
        } else if character == quote {
            return index + quote.len_utf8() + offset + quote.len_utf8();
        }
    }
    message.len()
}

fn unquoted_value_end(message: &str, index: usize) -> usize {
    for (offset, character) in message[index..].char_indices() {
        if character.is_whitespace() || matches!(character, ',' | '}' | ']') {
            return index + offset;
        }
    }
    message.len()
}

fn authorization_value_end(message: &str, index: usize) -> Option<usize> {
    const SCHEMES: [&str; 4] = ["bearer", "basic", "digest", "negotiate"];

    SCHEMES.iter().find_map(|scheme| {
        let scheme_end = index + scheme.len();
        // Byte comparison for the same reason as in `match_sensitive_key`.
        if scheme_end > message.len()
            || !message.as_bytes()[index..scheme_end].eq_ignore_ascii_case(scheme.as_bytes())
        {
            return None;
        }

        let credential_start = skip_spaces(message, scheme_end);
        if credential_start == scheme_end {
            return None;
        }

        let credential_end = unquoted_value_end(message, credential_start);
        (credential_end > credential_start).then_some(credential_end)
    })
}

fn split_pair(token: &str) -> Option<(&str, char, &str)> {
    let index = token.find(['=', ':'])?;
    let separator = token[index..].chars().next()?;
    Some((&token[..index], separator, &token[index + 1..]))
}

fn contains_email(token: &str) -> bool {
    let Some((local, domain)) = token.split_once('@') else {
        return false;
    };
    let local = local.trim_matches(|character: char| !character.is_ascii_alphanumeric());
    let Some((label, rest)) = domain.split_once('.') else {
        return false;
    };
    !local.is_empty()
        && !label.is_empty()
        && rest
            .chars()
            .any(|character| character.is_ascii_alphanumeric())
}

/// Password hashes carry their algorithm as a prefix, `$argon2id$...` here.
fn is_hash(token: &str) -> bool {
    let token = token.to_ascii_lowercase();
    HASH_PREFIXES.iter().any(|prefix| token.starts_with(prefix))
}

fn is_path(token: &str) -> bool {
    let windows = token
        .as_bytes()
        .get(1)
        .is_some_and(|character| *character == b':')
        && token.contains('\\');
    (token.starts_with('/') && token.len() > 1) || token.starts_with("\\\\") || windows
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_ordinary_messages_readable() {
        assert_eq!(
            redact("This time overlaps with another time entry"),
            "This time overlaps with another time entry"
        );
    }

    /// A key that carries a secret itself must not stay readable next to the
    /// redacted value it labels. Found by
    /// `src-tauri/fuzz/fuzz_targets/redact.rs`.
    #[test]
    fn removes_a_token_whose_key_is_a_secret() {
        assert_eq!(redact("$2y$abc:jane@example.com"), "[redacted]");
        assert_eq!(redact("jane@example.com=john@example.com"), "[redacted]");
    }

    /// A driver error, a path or a panic payload can carry any UTF-8, and the
    /// message is redacted inside the panic hook, where a second panic would
    /// lose the report. Found by `src-tauri/fuzz/fuzz_targets/redact.rs`.
    #[test]
    fn survives_multi_byte_characters() {
        assert_eq!(redact("\u{5b4}"), "\u{5b4}");
        assert_eq!(redact("'\u{5b4}"), "'\u{5b4}");
        assert_eq!(redact("token\u{5b4}: kept"), "token\u{5b4}: kept");
        assert_eq!(
            redact("Authorization: Bearer\u{5b4}"),
            "Authorization: [redacted]"
        );
    }

    #[test]
    fn removes_email_addresses() {
        assert_eq!(
            redact("login failed for jane.doe@example.com twice"),
            "login failed for [redacted] twice"
        );
        assert_eq!(
            redact("email=jane@example.com"),
            "email=[redacted]".to_owned()
        );
    }

    #[test]
    fn removes_values_of_sensitive_keys() {
        assert_eq!(redact("token: abc123"), "token: [redacted]");
        assert_eq!(redact("Authorization=Bearer"), "Authorization=[redacted]");
        assert_eq!(
            redact(&format!(
                "Authorization: {}",
                ["Bearer", "opaque-token"].join(" ")
            )),
            "Authorization: [redacted]"
        );
        assert_eq!(
            redact(r#"{"password":"top secret"}"#),
            r#"{"password":"[redacted]"}"#
        );
    }

    #[test]
    fn keeps_shell_style_variables() {
        assert_eq!(redact("reading $HOME failed"), "reading $HOME failed");
    }

    #[test]
    fn removes_password_hashes() {
        assert_eq!(
            redact("stored $argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHQ$hash"),
            "stored [redacted]"
        );
    }

    #[test]
    fn removes_file_system_paths() {
        assert_eq!(
            redact("unable to open /home/jane/.local/share/app.db"),
            "unable to open [redacted path]"
        );
        assert_eq!(
            redact("unable to open C:\\Users\\jane\\app.db"),
            "unable to open [redacted path]"
        );
    }

    #[test]
    fn keeps_plain_words_that_only_look_similar() {
        assert_eq!(
            redact("Email or password is incorrect"),
            "Email or password is incorrect"
        );
        assert_eq!(redact("ratio 1:2 stays"), "ratio 1:2 stays");
    }

    #[test]
    fn keeps_the_layout_while_redacting() {
        assert_eq!(
            redact_keeping_layout("line 1:\n  token=abc123\n\tjane@example.com"),
            "line 1:\n  token=[redacted]\n\t[redacted]"
        );
    }

    #[test]
    fn keeping_the_layout_redacts_the_same_tokens_as_a_log_line() {
        let message = "opening /home/jane/app.db for $argon2id$v=19$hash of jane@example.com";

        assert_eq!(redact_keeping_layout(message), redact(message));
    }

    #[test]
    fn clamps_long_messages() {
        let message = "a".repeat(MAX_MESSAGE_CHARS + 100);

        assert_eq!(clamp(&message).chars().count(), MAX_MESSAGE_CHARS);
    }

    #[test]
    fn logging_without_initialization_is_a_no_op() {
        assert_eq!(file_path(), None);
        error("test", "nothing is written");
    }

    #[test]
    fn writes_a_redacted_line_with_level_and_source() {
        let line = format_line("ERROR", "login", "failed for jane@example.com");

        assert!(line.starts_with(&timestamp()));
        assert!(line.ends_with("ERROR [login] failed for [redacted]\n"));
    }

    #[test]
    fn appends_every_line_to_the_same_file() {
        let path =
            std::env::temp_dir().join(format!("work-time-tracker-log-{}.log", std::process::id()));
        let _ = fs::remove_file(&path);

        append(&path, "first\n");
        append(&path, "second\n");

        assert_eq!(
            fs::read_to_string(&path).unwrap(),
            "first\nsecond\n".to_owned()
        );
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn rotates_the_log_once_it_grows_too_large() {
        let directory =
            std::env::temp_dir().join(format!("work-time-tracker-rotate-{}", std::process::id()));
        let _ = fs::remove_dir_all(&directory);
        fs::create_dir_all(&directory).unwrap();
        let path = directory.join(FILE_NAME);
        fs::write(&path, "x".repeat(MAX_BYTES as usize + 1)).unwrap();

        rotate(&path);

        assert!(!path.exists());
        assert!(directory.join(ROTATED_FILE_NAME).exists());
        let _ = fs::remove_dir_all(&directory);
    }

    #[test]
    fn rotates_over_an_existing_rotated_log() {
        let directory = std::env::temp_dir().join(format!(
            "work-time-tracker-rotate-existing-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&directory);
        fs::create_dir_all(&directory).unwrap();
        let path = directory.join(FILE_NAME);
        let rotated = directory.join(ROTATED_FILE_NAME);
        fs::write(&path, "x".repeat(MAX_BYTES as usize + 1)).unwrap();
        fs::write(&rotated, "old").unwrap();

        rotate(&path);

        assert!(!path.exists());
        assert_eq!(
            fs::read_to_string(directory.join(ROTATED_FILE_NAME)).unwrap(),
            "x".repeat(MAX_BYTES as usize + 1)
        );
        let _ = fs::remove_dir_all(&directory);
    }
}

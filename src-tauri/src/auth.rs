use std::{
    collections::HashMap,
    fmt::Write as _,
    sync::{LazyLock, Mutex},
    time::{Duration, Instant},
};

use argon2::{
    password_hash::{
        rand_core::{OsRng, RngCore},
        PasswordHash, PasswordHasher, PasswordVerifier, SaltString,
    },
    Algorithm, Argon2, Params, Version,
};
use serde::Serialize;

use chrono::{DateTime, Utc};

use crate::{
    error::{AppError, AppResult},
    store::LoginAttemptStore,
};

/// Idle timeout of a session. Every command resets it, an idle session ends.
pub const SESSION_TIMEOUT_MINUTES: u64 = 480;
/// Failed logins of one email before the account is locked for a while.
pub const MAX_LOGIN_ATTEMPTS: u32 = 5;
/// Duration of the lockout that follows the last allowed attempt.
pub const LOGIN_LOCKOUT_MINUTES: u64 = 15;

/// Argon2id cost parameters, pinned instead of taken from `Argon2::default()`
/// so a dependency update cannot silently weaken or slow down the hashing.
/// They follow the OWASP recommendation for Argon2id (19 MiB of memory, two
/// passes, one lane), which keeps a hash well below a second on a desktop
/// machine while staying expensive for an attacker. The same numbers are part
/// of `contract/domain-rules.json`.
pub const ARGON2_MEMORY_KIB: u32 = 19_456;
pub const ARGON2_ITERATIONS: u32 = 2;
pub const ARGON2_PARALLELISM: u32 = 1;

const LOCKED_OUT: &str = "Too many failed sign in attempts, please try again later";

fn minutes(value: u64) -> Duration {
    Duration::from_secs(value * 60)
}

struct ActiveSession {
    user_id: i64,
    /// Label of the webview the session was started from. The id alone is a
    /// bearer token, so it is only accepted from that webview again.
    window: String,
    last_seen: Instant,
}

/// Opaque identifier of one signed in session. It is generated from the
/// operating system RNG and never derived from the user, so it identifies a
/// session in the command layer without carrying any account data.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize)]
pub struct SessionId(String);

impl SessionId {
    fn generate() -> Self {
        let mut bytes = [0_u8; 32];
        OsRng.fill_bytes(&mut bytes);
        Self(bytes.iter().fold(String::new(), |mut id, byte| {
            let _ = write!(id, "{byte:02x}");
            id
        }))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl From<String> for SessionId {
    fn from(value: String) -> Self {
        Self(value)
    }
}

/// The signed in sessions of the running application, keyed by their id. They
/// are only kept in memory, so a restart always returns to the login page, and
/// two windows can hold two different identities instead of sharing one. Each
/// session also remembers the webview it was started from, so a leaked id
/// cannot be replayed from another window of the same process.
#[derive(Default)]
pub struct Sessions(Mutex<HashMap<SessionId, ActiveSession>>);

impl Sessions {
    /// Resolves a session id to its user and extends the session. An id that
    /// reaches the backend from another webview than the one it was issued to
    /// resolves to nothing, exactly like an unknown id.
    pub fn user_id(&self, id: &SessionId, window: &str) -> AppResult<Option<i64>> {
        self.user_id_at(id, window, Instant::now())
    }

    fn user_id_at(&self, id: &SessionId, window: &str, now: Instant) -> AppResult<Option<i64>> {
        let mut sessions = self.0.lock()?;
        // An idle session ends; expired sessions never pile up in the map.
        sessions.retain(|_, session| {
            now.duration_since(session.last_seen) < minutes(SESSION_TIMEOUT_MINUTES)
        });
        let Some(active) = sessions.get_mut(id) else {
            return Ok(None);
        };
        // A rejected window must not keep the session of another window alive
        // either, so the timeout is only extended for the owning webview.
        if active.window != window {
            return Ok(None);
        }
        active.last_seen = now;
        Ok(Some(active.user_id))
    }

    /// Starts a session for the given webview and returns its id. The caller
    /// hands the id back with every following command.
    pub fn start(&self, user_id: i64, window: &str) -> AppResult<SessionId> {
        self.start_at(user_id, window, Instant::now())
    }

    fn start_at(&self, user_id: i64, window: &str, now: Instant) -> AppResult<SessionId> {
        let id = SessionId::generate();
        self.0.lock()?.insert(
            id.clone(),
            ActiveSession {
                user_id,
                window: window.to_owned(),
                last_seen: now,
            },
        );
        Ok(id)
    }

    /// Ends one session; the other sessions of the process stay signed in. Only
    /// the webview that owns the session can end it, so a leaked id cannot sign
    /// another window out either.
    pub fn end(&self, id: &SessionId, window: &str) -> AppResult<()> {
        let mut sessions = self.0.lock()?;
        if sessions
            .get(id)
            .is_some_and(|session| session.window == window)
        {
            sessions.remove(id);
        }
        Ok(())
    }
}

/// Counts the login attempts per email to slow down password guessing. The
/// counters are persisted, so restarting the application does not clear a
/// lockout, and expired counters are evicted with every attempt.
pub struct LoginAttempts<'store>(&'store dyn LoginAttemptStore);

impl<'store> LoginAttempts<'store> {
    pub fn new(store: &'store dyn LoginAttemptStore) -> Self {
        Self(store)
    }

    /// Counts this attempt and rejects it while the email is locked out.
    /// Counting before the password is verified is what makes the limit hold:
    /// a separate check would let concurrent logins all read the same count and
    /// verify a password together. A successful login clears the counter again.
    pub fn begin(&self, email: &str) -> AppResult<()> {
        self.begin_at(email, Utc::now())
    }

    fn begin_at(&self, email: &str, now: DateTime<Utc>) -> AppResult<()> {
        let limit = i64::from(MAX_LOGIN_ATTEMPTS);
        let counted = self.0.reserve_login_attempt(
            email,
            &timestamp(now),
            &self.expired_before(now),
            limit,
        )?;
        if counted > limit {
            return Err(AppError::RateLimited(LOCKED_OUT.to_owned()));
        }
        Ok(())
    }

    pub fn record_success(&self, email: &str) -> AppResult<()> {
        self.0.clear_login_attempts(email)?;
        Ok(())
    }

    /// Timestamp at which a counter has served its lockout.
    fn expired_before(&self, now: DateTime<Utc>) -> String {
        timestamp(now - chrono::Duration::minutes(LOGIN_LOCKOUT_MINUTES as i64))
    }
}

/// The ISO 8601 UTC format every timestamp of the backend is written in, so
/// stored counters compare as strings.
fn timestamp(time: DateTime<Utc>) -> String {
    time.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()
}

/// Argon2id with the pinned parameters above.
fn argon2() -> AppResult<Argon2<'static>> {
    let params = Params::new(
        ARGON2_MEMORY_KIB,
        ARGON2_ITERATIONS,
        ARGON2_PARALLELISM,
        None,
    )
    .map_err(|error| AppError::internal(format!("invalid argon2 parameters: {error}")))?;
    Ok(Argon2::new(Algorithm::Argon2id, Version::V0x13, params))
}

/// Passwords are never stored in plaintext; Argon2id derives a salted hash.
pub fn hash_password(password: &str) -> AppResult<String> {
    let salt = SaltString::generate(&mut OsRng);
    argon2()?
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|error| AppError::internal(format!("password hashing failed: {error}")))
}

/// Hash of a random password, verified when no user row exists. It is derived
/// once with the same parameters as a real credential, so the work of a login
/// with an unknown email matches the work of a login with a known one.
static DUMMY_HASH: LazyLock<String> = LazyLock::new(|| {
    let secret = SaltString::generate(&mut OsRng);
    hash_password(secret.as_str()).unwrap_or_default()
});

#[cfg(test)]
pub static DUMMY_VERIFICATIONS: std::sync::atomic::AtomicUsize =
    std::sync::atomic::AtomicUsize::new(0);

/// Spends the work of a verification without a stored hash. Always false, the
/// dummy password is never known to a caller.
pub fn verify_dummy_password(password: &str) -> bool {
    #[cfg(test)]
    DUMMY_VERIFICATIONS.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    verify_password(password, &DUMMY_HASH)
}

/// Verification reads the cost parameters from the stored hash, so hashes
/// written with earlier parameters keep working.
pub fn verify_password(password: &str, hash: &str) -> bool {
    PasswordHash::new(hash).is_ok_and(|parsed| {
        Argon2::default()
            .verify_password(password.as_bytes(), &parsed)
            .is_ok()
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::{LoginAttempt, StoreError};

    #[test]
    fn verifies_only_the_hashed_password() {
        let hash = hash_password("Str0ng-Passphrase!!x").unwrap();

        assert!(!hash.contains("Str0ng-Passphrase!!x"));
        assert!(verify_password("Str0ng-Passphrase!!x", &hash));
        assert!(!verify_password("str0ng-passphrase!!x", &hash));
    }

    #[test]
    fn hashes_with_the_pinned_parameters() {
        let hash = hash_password("Str0ng-Passphrase!!x").unwrap();

        assert!(hash.starts_with("$argon2id$v=19$"), "{hash}");
        assert!(
            hash.contains(&format!(
                "m={ARGON2_MEMORY_KIB},t={ARGON2_ITERATIONS},p={ARGON2_PARALLELISM}"
            )),
            "{hash}"
        );
    }

    #[test]
    fn salts_every_hash() {
        assert_ne!(
            hash_password("Str0ng-Passphrase!!x").unwrap(),
            hash_password("Str0ng-Passphrase!!x").unwrap()
        );
    }

    #[test]
    fn spends_a_verification_on_an_unknown_email() {
        assert!(DUMMY_HASH.starts_with("$argon2id$v=19$"), "{}", *DUMMY_HASH);
        assert!(!verify_dummy_password("Str0ng-Passphrase!!x"));
    }

    #[test]
    fn rejects_malformed_hashes() {
        assert!(!verify_password("Str0ng-Passphrase!!x", "not-a-hash"));
    }

    #[test]
    fn keeps_a_used_session_alive() {
        let sessions = Sessions::default();
        let now = Instant::now();
        let id = sessions.start_at(7, "main", now).unwrap();
        let later = now + minutes(SESSION_TIMEOUT_MINUTES) - Duration::from_secs(1);

        assert_eq!(sessions.user_id_at(&id, "main", later).unwrap(), Some(7));
        assert_eq!(
            sessions
                .user_id_at(&id, "main", later + minutes(SESSION_TIMEOUT_MINUTES / 2))
                .unwrap(),
            Some(7)
        );
    }

    #[test]
    fn ends_an_idle_session() {
        let sessions = Sessions::default();
        let now = Instant::now();
        let id = sessions.start_at(7, "main", now).unwrap();

        assert_eq!(
            sessions
                .user_id_at(&id, "main", now + minutes(SESSION_TIMEOUT_MINUTES))
                .unwrap(),
            None
        );
        assert_eq!(sessions.user_id(&id, "main").unwrap(), None);
    }

    #[test]
    fn gives_every_session_its_own_identity() {
        let sessions = Sessions::default();
        let now = Instant::now();
        let first = sessions.start_at(7, "main", now).unwrap();
        let second = sessions.start_at(9, "second", now).unwrap();

        assert_ne!(first, second);
        assert_eq!(sessions.user_id_at(&first, "main", now).unwrap(), Some(7));
        assert_eq!(
            sessions.user_id_at(&second, "second", now).unwrap(),
            Some(9)
        );

        sessions.end(&first, "main").unwrap();

        assert_eq!(sessions.user_id_at(&first, "main", now).unwrap(), None);
        assert_eq!(
            sessions.user_id_at(&second, "second", now).unwrap(),
            Some(9)
        );
    }

    #[test]
    fn rejects_a_session_replayed_from_another_window() {
        let sessions = Sessions::default();
        let now = Instant::now();
        let id = sessions.start_at(7, "main", now).unwrap();

        assert_eq!(sessions.user_id_at(&id, "second", now).unwrap(), None);
        // The rejected replay left the session of its own window untouched.
        assert_eq!(sessions.user_id_at(&id, "main", now).unwrap(), Some(7));
    }

    #[test]
    fn ends_a_session_only_from_its_own_window() {
        let sessions = Sessions::default();
        let now = Instant::now();
        let id = sessions.start_at(7, "main", now).unwrap();

        sessions.end(&id, "second").unwrap();

        assert_eq!(sessions.user_id_at(&id, "main", now).unwrap(), Some(7));
        sessions.end(&id, "main").unwrap();
        assert_eq!(sessions.user_id_at(&id, "main", now).unwrap(), None);
    }

    #[test]
    fn rejects_an_unknown_session_id() {
        let sessions = Sessions::default();
        sessions.start(7, "main").unwrap();

        assert_eq!(
            sessions
                .user_id(&SessionId::from("not-a-session".to_owned()), "main")
                .unwrap(),
            None
        );
    }

    #[test]
    fn generates_an_opaque_random_id() {
        let id = SessionId::generate();

        assert_eq!(id.as_str().len(), 64);
        assert!(id.as_str().chars().all(|c| c.is_ascii_hexdigit()));
        assert_ne!(id, SessionId::generate());
    }

    /// In-memory stand-in for the persisted counters.
    #[derive(Default)]
    struct FakeAttempts(Mutex<HashMap<String, LoginAttempt>>);

    impl LoginAttemptStore for FakeAttempts {
        fn reserve_login_attempt(
            &self,
            email: &str,
            now: &str,
            expired_before: &str,
            limit: i64,
        ) -> Result<i64, StoreError> {
            let mut attempts = self.0.lock().unwrap();
            attempts.retain(|_, attempt| attempt.last_failure.as_str() > expired_before);
            let attempt = attempts.entry(email.to_owned()).or_insert(LoginAttempt {
                failures: 0,
                last_failure: now.to_owned(),
            });
            if attempt.failures <= limit {
                attempt.failures += 1;
                attempt.last_failure = now.to_owned();
            }
            Ok(attempt.failures)
        }

        fn read_login_attempt(&self, email: &str) -> Result<Option<LoginAttempt>, StoreError> {
            Ok(self.0.lock().unwrap().get(email).cloned())
        }

        fn clear_login_attempts(&self, email: &str) -> Result<(), StoreError> {
            self.0.lock().unwrap().remove(email);
            Ok(())
        }
    }

    fn moment() -> DateTime<Utc> {
        DateTime::parse_from_rfc3339("2026-08-30T10:00:00.000Z")
            .unwrap()
            .with_timezone(&Utc)
    }

    #[test]
    fn locks_out_an_email_after_too_many_attempts() {
        let store = FakeAttempts::default();
        let attempts = LoginAttempts::new(&store);
        let now = moment();

        for _ in 0..MAX_LOGIN_ATTEMPTS {
            attempts.begin_at("first@example.com", now).unwrap();
        }

        assert_eq!(
            attempts.begin_at("first@example.com", now),
            Err(AppError::RateLimited(LOCKED_OUT.to_owned()))
        );
        attempts.begin_at("second@example.com", now).unwrap();
    }

    #[test]
    fn counts_every_attempt_before_the_password_is_verified() {
        let store = FakeAttempts::default();
        let attempts = LoginAttempts::new(&store);
        let now = moment();

        attempts.begin_at("first@example.com", now).unwrap();

        // The attempt is counted by the store operation itself, so a second
        // login cannot read a count that does not contain it yet.
        assert_eq!(
            store
                .read_login_attempt("first@example.com")
                .unwrap()
                .unwrap()
                .failures,
            1
        );
    }

    #[test]
    fn keeps_a_lockout_across_a_restart() {
        let store = FakeAttempts::default();
        let now = moment();
        for _ in 0..MAX_LOGIN_ATTEMPTS {
            LoginAttempts::new(&store)
                .begin_at("first@example.com", now)
                .unwrap();
        }

        // A new instance stands for the restarted process; the counters live
        // in the store, not in the instance.
        assert!(LoginAttempts::new(&store)
            .begin_at("first@example.com", now)
            .is_err());
    }

    #[test]
    fn releases_the_lockout_after_the_waiting_time() {
        let store = FakeAttempts::default();
        let attempts = LoginAttempts::new(&store);
        let now = moment();
        for _ in 0..MAX_LOGIN_ATTEMPTS {
            attempts.begin_at("first@example.com", now).unwrap();
        }

        assert!(attempts.begin_at("first@example.com", now).is_err());
        let later = now + chrono::Duration::minutes(LOGIN_LOCKOUT_MINUTES as i64);
        attempts.begin_at("first@example.com", later).unwrap();
    }

    #[test]
    fn does_not_let_a_locked_out_email_extend_its_own_lockout() {
        let store = FakeAttempts::default();
        let attempts = LoginAttempts::new(&store);
        let now = moment();
        for _ in 0..MAX_LOGIN_ATTEMPTS {
            attempts.begin_at("first@example.com", now).unwrap();
        }

        let blocked = now + chrono::Duration::minutes(1);
        assert!(attempts.begin_at("first@example.com", blocked).is_err());
        // The rejected attempt froze the counter instead of moving it on.
        let attempt = store
            .read_login_attempt("first@example.com")
            .unwrap()
            .unwrap();
        assert_eq!(attempt.failures, i64::from(MAX_LOGIN_ATTEMPTS) + 1);
        assert_eq!(attempt.last_failure, timestamp(blocked));

        let later = blocked + chrono::Duration::minutes(LOGIN_LOCKOUT_MINUTES as i64);
        attempts.begin_at("first@example.com", later).unwrap();
    }

    #[test]
    fn evicts_expired_counters_instead_of_keeping_them() {
        let store = FakeAttempts::default();
        let attempts = LoginAttempts::new(&store);
        let now = moment();
        attempts.begin_at("first@example.com", now).unwrap();

        let later = now + chrono::Duration::minutes(LOGIN_LOCKOUT_MINUTES as i64 + 1);
        attempts.begin_at("second@example.com", later).unwrap();

        assert_eq!(store.read_login_attempt("first@example.com").unwrap(), None);
    }

    #[test]
    fn counts_a_new_lockout_from_one_after_the_waiting_time() {
        let store = FakeAttempts::default();
        let attempts = LoginAttempts::new(&store);
        let now = moment();
        for _ in 0..MAX_LOGIN_ATTEMPTS {
            attempts.begin_at("first@example.com", now).unwrap();
        }

        let later = now + chrono::Duration::minutes(LOGIN_LOCKOUT_MINUTES as i64 + 1);
        attempts.begin_at("first@example.com", later).unwrap();

        assert_eq!(
            store
                .read_login_attempt("first@example.com")
                .unwrap()
                .unwrap()
                .failures,
            1
        );
    }

    #[test]
    fn forgets_the_attempts_after_a_successful_login() {
        let store = FakeAttempts::default();
        let attempts = LoginAttempts::new(&store);
        let now = moment();
        for _ in 0..MAX_LOGIN_ATTEMPTS {
            attempts.begin_at("first@example.com", now).unwrap();
        }
        attempts.record_success("first@example.com").unwrap();

        attempts.begin_at("first@example.com", now).unwrap();
    }
}

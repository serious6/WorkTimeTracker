use std::{
    sync::{LazyLock, Mutex},
    time::{Duration, Instant},
};

use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Algorithm, Argon2, Params, Version,
};

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
    last_seen: Instant,
}

/// The user of the running application. Sessions are only kept in memory, so a
/// restart always returns to the login page.
#[derive(Default)]
pub struct Session(Mutex<Option<ActiveSession>>);

impl Session {
    pub fn user_id(&self) -> AppResult<Option<i64>> {
        self.user_id_at(Instant::now())
    }

    fn user_id_at(&self, now: Instant) -> AppResult<Option<i64>> {
        let mut session = self.0.lock()?;
        let Some(active) = session.as_mut() else {
            return Ok(None);
        };
        if now.duration_since(active.last_seen) >= minutes(SESSION_TIMEOUT_MINUTES) {
            *session = None;
            return Ok(None);
        }
        active.last_seen = now;
        Ok(Some(active.user_id))
    }

    pub fn set(&self, user_id: Option<i64>) -> AppResult<()> {
        self.set_at(user_id, Instant::now())
    }

    fn set_at(&self, user_id: Option<i64>, now: Instant) -> AppResult<()> {
        *self.0.lock()? = user_id.map(|user_id| ActiveSession {
            user_id,
            last_seen: now,
        });
        Ok(())
    }
}

/// Counts failed logins per email to slow down password guessing. The counters
/// are persisted, so restarting the application does not clear a lockout, and
/// expired counters are removed on every check.
pub struct LoginAttempts<'store>(&'store dyn LoginAttemptStore);

impl<'store> LoginAttempts<'store> {
    pub fn new(store: &'store dyn LoginAttemptStore) -> Self {
        Self(store)
    }

    /// Rejects further attempts while an email is locked out.
    pub fn check(&self, email: &str) -> AppResult<()> {
        self.check_at(email, Utc::now())
    }

    fn check_at(&self, email: &str, now: DateTime<Utc>) -> AppResult<()> {
        let expired = self.expired_before(now);
        self.0.purge_login_attempts(&expired)?;
        let Some(attempt) = self.0.read_login_attempt(email)? else {
            return Ok(());
        };
        if attempt.last_failure <= expired {
            self.0.clear_login_attempts(email)?;
            return Ok(());
        }
        if attempt.failures >= i64::from(MAX_LOGIN_ATTEMPTS) {
            return Err(AppError::RateLimited(LOCKED_OUT.to_owned()));
        }
        Ok(())
    }

    pub fn record_failure(&self, email: &str) -> AppResult<()> {
        self.record_failure_at(email, Utc::now())
    }

    fn record_failure_at(&self, email: &str, now: DateTime<Utc>) -> AppResult<()> {
        // The expired counters go first, so a new lockout starts from one.
        self.0.purge_login_attempts(&self.expired_before(now))?;
        self.0.record_login_failure(email, &timestamp(now))?;
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
    let params = Params::new(ARGON2_MEMORY_KIB, ARGON2_ITERATIONS, ARGON2_PARALLELISM, None)
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
    use std::collections::HashMap;

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
        let session = Session::default();
        let now = Instant::now();
        session.set_at(Some(7), now).unwrap();
        let later = now + minutes(SESSION_TIMEOUT_MINUTES) - Duration::from_secs(1);

        assert_eq!(session.user_id_at(later).unwrap(), Some(7));
        assert_eq!(
            session
                .user_id_at(later + minutes(SESSION_TIMEOUT_MINUTES / 2))
                .unwrap(),
            Some(7)
        );
    }

    #[test]
    fn ends_an_idle_session() {
        let session = Session::default();
        let now = Instant::now();
        session.set_at(Some(7), now).unwrap();

        assert_eq!(
            session
                .user_id_at(now + minutes(SESSION_TIMEOUT_MINUTES))
                .unwrap(),
            None
        );
        assert_eq!(session.user_id().unwrap(), None);
    }

    /// In-memory stand-in for the persisted counters.
    #[derive(Default)]
    struct FakeAttempts(Mutex<HashMap<String, LoginAttempt>>);

    impl LoginAttemptStore for FakeAttempts {
        fn read_login_attempt(&self, email: &str) -> Result<Option<LoginAttempt>, StoreError> {
            Ok(self.0.lock().unwrap().get(email).cloned())
        }

        fn record_login_failure(&self, email: &str, now: &str) -> Result<(), StoreError> {
            let mut attempts = self.0.lock().unwrap();
            let attempt = attempts.entry(email.to_owned()).or_insert(LoginAttempt {
                failures: 0,
                last_failure: now.to_owned(),
            });
            attempt.failures += 1;
            attempt.last_failure = now.to_owned();
            Ok(())
        }

        fn clear_login_attempts(&self, email: &str) -> Result<(), StoreError> {
            self.0.lock().unwrap().remove(email);
            Ok(())
        }

        fn purge_login_attempts(&self, before: &str) -> Result<(), StoreError> {
            self.0
                .lock()
                .unwrap()
                .retain(|_, attempt| attempt.last_failure.as_str() > before);
            Ok(())
        }
    }

    fn moment() -> DateTime<Utc> {
        DateTime::parse_from_rfc3339("2026-08-30T10:00:00.000Z")
            .unwrap()
            .with_timezone(&Utc)
    }

    #[test]
    fn locks_out_an_email_after_too_many_failures() {
        let store = FakeAttempts::default();
        let attempts = LoginAttempts::new(&store);
        let now = moment();

        for _ in 0..MAX_LOGIN_ATTEMPTS {
            attempts.check_at("first@example.com", now).unwrap();
            attempts.record_failure_at("first@example.com", now).unwrap();
        }

        assert_eq!(
            attempts.check_at("first@example.com", now),
            Err(AppError::RateLimited(LOCKED_OUT.to_owned()))
        );
        attempts.check_at("second@example.com", now).unwrap();
    }

    #[test]
    fn keeps_a_lockout_across_a_restart() {
        let store = FakeAttempts::default();
        let now = moment();
        for _ in 0..MAX_LOGIN_ATTEMPTS {
            LoginAttempts::new(&store)
                .record_failure_at("first@example.com", now)
                .unwrap();
        }

        // A new instance stands for the restarted process; the counters live
        // in the store, not in the instance.
        assert!(LoginAttempts::new(&store)
            .check_at("first@example.com", now)
            .is_err());
    }

    #[test]
    fn releases_the_lockout_after_the_waiting_time() {
        let store = FakeAttempts::default();
        let attempts = LoginAttempts::new(&store);
        let now = moment();
        for _ in 0..MAX_LOGIN_ATTEMPTS {
            attempts.record_failure_at("first@example.com", now).unwrap();
        }

        assert!(attempts.check_at("first@example.com", now).is_err());
        let later = now + chrono::Duration::minutes(LOGIN_LOCKOUT_MINUTES as i64);
        attempts.check_at("first@example.com", later).unwrap();
    }

    #[test]
    fn evicts_expired_counters_instead_of_keeping_them() {
        let store = FakeAttempts::default();
        let attempts = LoginAttempts::new(&store);
        let now = moment();
        attempts.record_failure_at("first@example.com", now).unwrap();

        let later = now + chrono::Duration::minutes(LOGIN_LOCKOUT_MINUTES as i64 + 1);
        attempts.check_at("second@example.com", later).unwrap();

        assert_eq!(store.read_login_attempt("first@example.com").unwrap(), None);
    }

    #[test]
    fn counts_a_new_lockout_from_one_after_the_waiting_time() {
        let store = FakeAttempts::default();
        let attempts = LoginAttempts::new(&store);
        let now = moment();
        for _ in 0..MAX_LOGIN_ATTEMPTS {
            attempts.record_failure_at("first@example.com", now).unwrap();
        }

        let later = now + chrono::Duration::minutes(LOGIN_LOCKOUT_MINUTES as i64 + 1);
        attempts.record_failure_at("first@example.com", later).unwrap();

        assert_eq!(
            store
                .read_login_attempt("first@example.com")
                .unwrap()
                .unwrap()
                .failures,
            1
        );
        attempts.check_at("first@example.com", later).unwrap();
    }

    #[test]
    fn forgets_the_failures_after_a_successful_login() {
        let store = FakeAttempts::default();
        let attempts = LoginAttempts::new(&store);
        let now = moment();
        for _ in 0..MAX_LOGIN_ATTEMPTS {
            attempts.record_failure_at("first@example.com", now).unwrap();
        }
        attempts.record_success("first@example.com").unwrap();

        attempts.check_at("first@example.com", now).unwrap();
    }
}

use std::{
    collections::HashMap,
    sync::Mutex,
    time::{Duration, Instant},
};

use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Algorithm, Argon2, Params, Version,
};

use crate::error::{AppError, AppResult};

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

#[derive(Clone, Copy)]
struct Attempts {
    failures: u32,
    last_failure: Instant,
}

/// Counts failed logins per email to slow down password guessing. The counters
/// live in memory only and are lost with the process.
#[derive(Default)]
pub struct LoginAttempts(Mutex<HashMap<String, Attempts>>);

impl LoginAttempts {
    /// Rejects further attempts while an email is locked out.
    pub fn check(&self, email: &str) -> AppResult<()> {
        self.check_at(email, Instant::now())
    }

    fn check_at(&self, email: &str, now: Instant) -> AppResult<()> {
        let mut attempts = self.0.lock()?;
        let Some(attempt) = attempts.get(email).copied() else {
            return Ok(());
        };
        if now.duration_since(attempt.last_failure) >= minutes(LOGIN_LOCKOUT_MINUTES) {
            attempts.remove(email);
            return Ok(());
        }
        if attempt.failures >= MAX_LOGIN_ATTEMPTS {
            return Err(AppError::RateLimited(LOCKED_OUT.to_owned()));
        }
        Ok(())
    }

    pub fn record_failure(&self, email: &str) -> AppResult<()> {
        self.record_failure_at(email, Instant::now())
    }

    fn record_failure_at(&self, email: &str, now: Instant) -> AppResult<()> {
        let mut attempts = self.0.lock()?;
        let attempt = attempts.entry(email.to_owned()).or_insert(Attempts {
            failures: 0,
            last_failure: now,
        });
        attempt.failures += 1;
        attempt.last_failure = now;
        Ok(())
    }

    pub fn record_success(&self, email: &str) -> AppResult<()> {
        self.0.lock()?.remove(email);
        Ok(())
    }
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

    #[test]
    fn locks_out_an_email_after_too_many_failures() {
        let attempts = LoginAttempts::default();
        let now = Instant::now();

        for _ in 0..MAX_LOGIN_ATTEMPTS {
            attempts.check_at("first@example.com", now).unwrap();
            attempts
                .record_failure_at("first@example.com", now)
                .unwrap();
        }

        assert_eq!(
            attempts.check_at("first@example.com", now),
            Err(AppError::RateLimited(LOCKED_OUT.to_owned()))
        );
        attempts.check_at("second@example.com", now).unwrap();
    }

    #[test]
    fn releases_the_lockout_after_the_waiting_time() {
        let attempts = LoginAttempts::default();
        let now = Instant::now();
        for _ in 0..MAX_LOGIN_ATTEMPTS {
            attempts
                .record_failure_at("first@example.com", now)
                .unwrap();
        }

        assert!(attempts.check_at("first@example.com", now).is_err());
        attempts
            .check_at("first@example.com", now + minutes(LOGIN_LOCKOUT_MINUTES))
            .unwrap();
    }

    #[test]
    fn forgets_the_failures_after_a_successful_login() {
        let attempts = LoginAttempts::default();
        let now = Instant::now();
        for _ in 0..MAX_LOGIN_ATTEMPTS {
            attempts
                .record_failure_at("first@example.com", now)
                .unwrap();
        }
        attempts.record_success("first@example.com").unwrap();

        attempts.check_at("first@example.com", now).unwrap();
    }
}

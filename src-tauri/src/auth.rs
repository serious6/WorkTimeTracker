use std::sync::Mutex;

use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};

/// The user of the running application. Sessions are only kept in memory, so a
/// restart always returns to the login page.
#[derive(Default)]
pub struct Session(pub Mutex<Option<i64>>);

impl Session {
    pub fn user_id(&self) -> Result<Option<i64>, String> {
        self.0
            .lock()
            .map(|user_id| *user_id)
            .map_err(|error| error.to_string())
    }

    pub fn set(&self, user_id: Option<i64>) -> Result<(), String> {
        *self.0.lock().map_err(|error| error.to_string())? = user_id;
        Ok(())
    }
}

/// Passwords are never stored in plaintext; Argon2id derives a salted hash.
pub fn hash_password(password: &str) -> Result<String, String> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|error| error.to_string())
}

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
}

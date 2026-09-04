//! Configuration of a portable installation, the archive that runs from a
//! folder the user may write to and needs no administrator rights.
//!
//! Such an installation has no deployment that could inject the database
//! settings, so they are read from `WorkTimeTracker.env` next to the
//! application, in the spelling of `.env.example`. Only a portable archive
//! ships that file; without it this resolves to the process environment alone,
//! so an installed build and local development are unchanged.
//!
//! The folder the archive is unpacked into may be copied or synchronized, so
//! it never keeps a secret: the connection string and the password are moved
//! into the credential store of the user account on the first start, and the
//! file keeps the marker `{STORED}` in their place. Removing the file forgets
//! them again. What stays readable are the host, the port, the database name
//! and the path of the pinned certificate authority.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use crate::config::{env_vars, DATABASE_URL_ENV, DB_PASSWORD_ENV, DB_ROOT_CERT_ENV, ENV_KEYS};

/// The configuration file, next to `WorkTimeTracker.exe` on Windows and next
/// to `WorkTimeTracker.app` on macOS, so that it survives replacing the
/// application bundle.
pub const ENV_FILE_NAME: &str = "WorkTimeTracker.env";

/// The value that stands for a secret held by the credential store of the user
/// account instead of by the file.
pub const STORED: &str = "stored-in-credential-store";

/// The settings that must never sit readable in the folder of the archive.
const SECRET_KEYS: [&str; 2] = [DATABASE_URL_ENV, DB_PASSWORD_ENV];

/// The service the credential store files the secrets under, the bundle
/// identifier of the application.
#[cfg(any(windows, target_os = "macos"))]
const CREDENTIAL_SERVICE: &str = "io.github.serious6.worktimetracker";

/// Failure of the portable configuration. Names the file and the setting,
/// never a value, so it stays safe to log and to show.
#[derive(Debug, PartialEq, Eq)]
pub enum PortableError {
    Unreadable,
    Permissions,
    Malformed(usize),
    UnknownSetting(usize),
    NotStorable(&'static str),
    NotStored(&'static str),
}

impl std::fmt::Display for PortableError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Unreadable => write!(
                formatter,
                "{ENV_FILE_NAME} next to the application could not be read"
            ),
            Self::Permissions => write!(
                formatter,
                "{ENV_FILE_NAME} must be readable by its owner only; restrict it (chmod 600) before starting again"
            ),
            Self::Malformed(line) => write!(
                formatter,
                "{ENV_FILE_NAME} line {line} is neither a comment nor a NAME=value setting"
            ),
            Self::UnknownSetting(line) => write!(
                formatter,
                "{ENV_FILE_NAME} line {line} names a setting the application does not read"
            ),
            Self::NotStorable(name) => write!(
                formatter,
                "{name} could not be moved into the credential store of this account; the application refuses to keep it readable in {ENV_FILE_NAME}"
            ),
            Self::NotStored(name) => write!(
                formatter,
                "{name} is marked as held by the credential store of this account, but no such credential exists; enter the connection again in {ENV_FILE_NAME}"
            ),
        }
    }
}

impl std::error::Error for PortableError {}

/// The credential store that holds the secrets of a portable installation.
/// Abstracted so the resolution can be unit tested without touching the store
/// of the machine that runs the tests.
trait SecretStore {
    fn secret(&self, name: &str) -> Option<String>;
    fn remember(&self, name: &str, secret: &str) -> bool;
    fn forget(&self, name: &str) -> bool;
}

/// The credential store of the user account: the Windows Credential Manager,
/// which protects the value with DPAPI in the scope of the current user, and
/// the login keychain on macOS. Both are available without administrator
/// rights.
struct AccountStore;

#[cfg(any(windows, target_os = "macos"))]
mod account {
    use std::sync::OnceLock;

    /// Registers the platform store once, and reports whether it is there.
    /// Every entry of this process is created against it.
    pub fn ready() -> bool {
        static READY: OnceLock<bool> = OnceLock::new();
        *READY.get_or_init(|| {
            #[cfg(windows)]
            let store = windows_native_keyring_store::Store::new();
            #[cfg(target_os = "macos")]
            let store = apple_native_keyring_store::keychain::Store::new();
            match store {
                Ok(store) => {
                    keyring_core::set_default_store(store);
                    true
                }
                Err(_) => false,
            }
        })
    }

    /// An entry of this application. On Windows the credential is kept on this
    /// machine instead of roaming with the account of a managed domain.
    pub fn entry(service: &str, name: &str) -> Option<keyring_core::Entry> {
        if !ready() {
            return None;
        }
        #[cfg(windows)]
        {
            let modifiers = std::collections::HashMap::from([("persistence", "local")]);
            keyring_core::Entry::new_with_modifiers(service, name, &modifiers).ok()
        }
        #[cfg(not(windows))]
        keyring_core::Entry::new(service, name).ok()
    }
}

#[cfg(any(windows, target_os = "macos"))]
impl SecretStore for AccountStore {
    fn secret(&self, name: &str) -> Option<String> {
        account::entry(CREDENTIAL_SERVICE, name)?
            .get_password()
            .ok()
    }

    fn remember(&self, name: &str, secret: &str) -> bool {
        account::entry(CREDENTIAL_SERVICE, name)
            .is_some_and(|entry| entry.set_password(secret).is_ok())
    }

    fn forget(&self, name: &str) -> bool {
        account::entry(CREDENTIAL_SERVICE, name).is_some_and(|entry| {
            matches!(
                entry.delete_credential(),
                Ok(()) | Err(keyring_core::Error::NoEntry)
            )
        })
    }
}

/// No portable archive is shipped for the other platforms, so there is no
/// store to protect a secret with. Reporting that is what keeps a secret from
/// staying readable in the folder.
#[cfg(not(any(windows, target_os = "macos")))]
impl SecretStore for AccountStore {
    fn secret(&self, _name: &str) -> Option<String> {
        None
    }

    fn remember(&self, _name: &str, _secret: &str) -> bool {
        false
    }

    fn forget(&self, _name: &str) -> bool {
        true
    }
}

/// The variables the database configuration is resolved from: those of the
/// process environment, extended by the settings of `WorkTimeTracker.env` next
/// to the application. A value that the process environment carries wins, so a
/// managed deployment still overrides the file.
pub fn settings() -> Result<HashMap<String, String>, PortableError> {
    let process = env_vars();
    let Some(directory) = application_directory() else {
        return Ok(process);
    };
    resolve(&directory, process, &AccountStore)
}

/// The folder the configuration file sits in: the one of the executable, and
/// on macOS the one the application bundle itself sits in.
fn application_directory() -> Option<PathBuf> {
    let executable = std::env::current_exe().ok()?;
    Some(folder_of(&executable))
}

/// Strips `WorkTimeTracker.app/Contents/MacOS` from the path of the
/// executable, so the file lives beside the bundle and survives replacing it.
fn folder_of(executable: &Path) -> PathBuf {
    let directory = executable.parent().unwrap_or(Path::new(".")).to_path_buf();
    let bundle = directory
        .parent()
        .filter(|contents| contents.file_name().is_some_and(|name| name == "Contents"))
        .and_then(Path::parent)
        .filter(|bundle| {
            bundle
                .extension()
                .is_some_and(|extension| extension == "app")
        })
        .and_then(Path::parent);
    match bundle {
        Some(folder) if directory.file_name().is_some_and(|name| name == "MacOS") => {
            folder.to_path_buf()
        }
        _ => directory,
    }
}

/// The resolution itself, on an explicit folder and credential store.
fn resolve(
    directory: &Path,
    process: HashMap<String, String>,
    store: &dyn SecretStore,
) -> Result<HashMap<String, String>, PortableError> {
    let path = directory.join(ENV_FILE_NAME);
    if !path.exists() {
        // No configuration in this folder, so nothing of it may stay behind in
        // the credential store either: removing the file forgets the
        // connection. Another installation keeps its own secrets, which are
        // filed under the folder they belong to.
        for setting in SECRET_KEYS {
            store.forget(&credential_name(directory, setting));
        }
        return Ok(process);
    }
    verify_owner_only(&path)?;
    let contents = std::fs::read_to_string(&path).map_err(|_| PortableError::Unreadable)?;

    let mut settings = parse(&contents)?;
    protect_secrets(directory, &path, &contents, &mut settings, store)?;
    absolute_root_cert(directory, &mut settings);

    for (key, value) in process {
        settings.insert(key, value);
    }
    Ok(settings)
}

/// Fails on a file that anyone but its owner may read. Windows carries no such
/// mode; there the file holds no secret, because the Credential Manager does.
fn verify_owner_only(path: &Path) -> Result<(), PortableError> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;

        let metadata = std::fs::metadata(path).map_err(|_| PortableError::Unreadable)?;
        if metadata.permissions().mode() & 0o077 != 0 {
            return Err(PortableError::Permissions);
        }
    }
    #[cfg(not(unix))]
    let _ = path;
    Ok(())
}

/// Reads the `NAME=value` settings of the file. A line that is neither blank,
/// a comment nor a setting the application reads fails the start, so a typo
/// never passes as an unconfigured connection.
fn parse(contents: &str) -> Result<HashMap<String, String>, PortableError> {
    let mut settings = HashMap::new();
    for (index, line) in contents.lines().enumerate() {
        let number = index + 1;
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let (key, value) = line
            .split_once('=')
            .ok_or(PortableError::Malformed(number))?;
        let key = key.trim();
        if !ENV_KEYS.contains(&key) {
            return Err(PortableError::UnknownSetting(number));
        }
        let value = unquote(value.trim());
        if value.is_empty() {
            continue;
        }
        settings.insert(key.to_owned(), value.to_owned());
    }
    Ok(settings)
}

/// Removes one layer of matching quotes, so a password with a leading or
/// trailing space can be written down.
fn unquote(value: &str) -> &str {
    for quote in ['"', '\''] {
        if let Some(inner) = value
            .strip_prefix(quote)
            .and_then(|rest| rest.strip_suffix(quote))
        {
            return inner;
        }
    }
    value
}

/// Moves a secret that the file still carries in clear text into the
/// credential store and rewrites the file with the marker in its place, and
/// reads back the ones that are already stored. A secret that can neither be
/// stored nor read fails the start instead of being used from the folder.
fn protect_secrets(
    directory: &Path,
    path: &Path,
    contents: &str,
    settings: &mut HashMap<String, String>,
    store: &dyn SecretStore,
) -> Result<(), PortableError> {
    let mut absorbed = Vec::new();
    for setting in SECRET_KEYS {
        let name = credential_name(directory, setting);
        let Some(value) = settings.get(setting).cloned() else {
            store.forget(&name);
            continue;
        };
        if value == STORED {
            let secret = store
                .secret(&name)
                .ok_or(PortableError::NotStored(setting))?;
            settings.insert(setting.to_owned(), secret);
            continue;
        }
        if !store.remember(&name, &value) {
            return Err(PortableError::NotStorable(setting));
        }
        absorbed.push(setting);
    }
    if absorbed.is_empty() {
        return Ok(());
    }
    write_owner_only(path, &scrub(contents, &absorbed)).map_err(|_| PortableError::Unreadable)
}

/// The file with the value of every absorbed setting replaced by the marker,
/// with its comments and its order kept so it stays the file the user wrote.
fn scrub(contents: &str, absorbed: &[&str]) -> String {
    let ending = if contents.contains("\r\n") {
        "\r\n"
    } else {
        "\n"
    };
    let mut scrubbed = contents
        .lines()
        .map(|line| match line.split_once('=') {
            Some((key, _)) if absorbed.contains(&key.trim()) => format!("{key}={STORED}"),
            _ => line.to_owned(),
        })
        .collect::<Vec<_>>()
        .join(ending);
    if contents.ends_with('\n') {
        scrubbed.push_str(ending);
    }
    scrubbed
}

/// Writes the file back so that only its owner may read it. It is written
/// beside the original and then renamed over it, so a failed write leaves the
/// file it replaces intact instead of a truncated one whose settings are gone.
fn write_owner_only(path: &Path, contents: &str) -> std::io::Result<()> {
    let temporary = path.with_extension("env.replacement");
    let mut options = std::fs::OpenOptions::new();
    options.write(true).truncate(true).create(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;

        options.mode(0o600);
    }
    let written = options
        .open(&temporary)
        .and_then(|mut file| std::io::Write::write_all(&mut file, contents.as_bytes()))
        .and_then(|()| restrict(&temporary))
        .and_then(|()| std::fs::rename(&temporary, path));
    if written.is_err() {
        let _ = std::fs::remove_file(&temporary);
    }
    written
}

/// Restricts a file to its owner, for the case that it existed already and the
/// mode of `OpenOptions` therefore did not apply.
fn restrict(path: &Path) -> std::io::Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;

        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))?;
    }
    #[cfg(not(unix))]
    let _ = path;
    Ok(())
}

/// The name a secret is filed under in the credential store: the setting and a
/// fingerprint of the folder it was configured in. The store is shared by
/// every installation of this user account, so without the folder an installed
/// build that carries no file would remove the secrets of a portable one.
fn credential_name(directory: &Path, setting: &str) -> String {
    format!("{setting}@{}", fingerprint(directory))
}

/// FNV-1a over the folder, lower-cased because Windows and macOS reach the
/// same folder under different spellings. It identifies an installation, it
/// protects nothing, and the folder itself is no secret.
fn fingerprint(directory: &Path) -> String {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in directory.to_string_lossy().to_lowercase().bytes() {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("{hash:016x}")
}

/// Resolves a relative path of the pinned certificate authority against the
/// folder of the application, so the authority travels with the archive.
fn absolute_root_cert(directory: &Path, settings: &mut HashMap<String, String>) {
    let Some(configured) = settings.get(DB_ROOT_CERT_ENV) else {
        return;
    };
    let path = Path::new(configured);
    if path.is_absolute() {
        return;
    }
    let absolute = directory.join(path);
    settings.insert(
        DB_ROOT_CERT_ENV.to_owned(),
        absolute.to_string_lossy().into_owned(),
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::collections::HashMap as Map;

    use crate::config::{DbConfig, DB_HOST_ENV, DB_USER_ENV, DEPLOYMENT_MODE_ENV, MIGRATE_ENV};

    /// A credential store in memory, so the tests never touch the store of the
    /// machine they run on.
    #[derive(Default)]
    struct MemoryStore {
        secrets: RefCell<Map<String, String>>,
        refuses: bool,
    }

    impl MemoryStore {
        fn refusing() -> Self {
            Self {
                refuses: true,
                ..Self::default()
            }
        }
    }

    impl SecretStore for MemoryStore {
        fn secret(&self, name: &str) -> Option<String> {
            self.secrets.borrow().get(name).cloned()
        }

        fn remember(&self, name: &str, secret: &str) -> bool {
            if self.refuses {
                return false;
            }
            self.secrets
                .borrow_mut()
                .insert(name.to_owned(), secret.to_owned());
            true
        }

        fn forget(&self, name: &str) -> bool {
            self.secrets.borrow_mut().remove(name);
            true
        }
    }

    /// A folder of its own per test, removed when the test ends.
    struct Folder(PathBuf);

    impl Folder {
        fn new(name: &str) -> Self {
            let path = std::env::temp_dir().join(format!("wtt-portable-{name}"));
            let _ = std::fs::remove_dir_all(&path);
            std::fs::create_dir_all(&path).expect("the test folder is created");
            Self(path)
        }

        fn write(&self, contents: &str) -> PathBuf {
            let path = self.0.join(ENV_FILE_NAME);
            std::fs::write(&path, contents).expect("the test file is written");
            owner_only(&path);
            path
        }

        fn read(&self) -> String {
            std::fs::read_to_string(self.0.join(ENV_FILE_NAME)).expect("the test file is readable")
        }
    }

    impl Drop for Folder {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn owner_only(path: &Path) {
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;

            std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))
                .expect("the test file is restricted");
        }
        #[cfg(not(unix))]
        let _ = path;
    }

    fn process(pairs: &[(&str, &str)]) -> HashMap<String, String> {
        pairs
            .iter()
            .map(|(key, value)| ((*key).to_owned(), (*value).to_owned()))
            .collect()
    }

    const REMOTE: &str = "******db.example.org/postgres?sslmode=verify-full";

    #[test]
    fn without_a_file_the_process_environment_is_used_unchanged() {
        let folder = Folder::new("absent");
        let store = MemoryStore::default();
        let name = credential_name(&folder.0, DATABASE_URL_ENV);
        store.remember(&name, REMOTE);

        let settings = resolve(&folder.0, process(&[(DATABASE_URL_ENV, "local")]), &store).unwrap();

        assert_eq!(settings, process(&[(DATABASE_URL_ENV, "local")]));
        // Removing the file is how a portable installation forgets its
        // connection, so nothing of this folder may survive in the store.
        assert_eq!(store.secret(&name), None);
    }

    #[test]
    fn reads_the_settings_of_the_file() {
        let folder = Folder::new("reads");
        folder.write(&format!(
            "# the connection\n{DEPLOYMENT_MODE_ENV}=production\n{DB_HOST_ENV}=db.example.org\n{DB_USER_ENV}=app\n"
        ));

        let settings = resolve(&folder.0, HashMap::new(), &MemoryStore::default()).unwrap();

        assert_eq!(
            settings.get(DEPLOYMENT_MODE_ENV).map(String::as_str),
            Some("production")
        );
        assert_eq!(
            settings.get(DB_HOST_ENV).map(String::as_str),
            Some("db.example.org")
        );
    }

    #[test]
    fn the_process_environment_wins_over_the_file() {
        let folder = Folder::new("precedence");
        folder.write(&format!("{DB_HOST_ENV}=db.example.org\n"));

        let settings = resolve(
            &folder.0,
            process(&[(DB_HOST_ENV, "db.managed.example")]),
            &MemoryStore::default(),
        )
        .unwrap();

        assert_eq!(
            settings.get(DB_HOST_ENV).map(String::as_str),
            Some("db.managed.example")
        );
    }

    #[test]
    fn moves_a_secret_of_the_file_into_the_credential_store() {
        let folder = Folder::new("absorb");
        folder.write(&format!(
            "{DEPLOYMENT_MODE_ENV}=production\n{DATABASE_URL_ENV}={REMOTE}\n{DB_PASSWORD_ENV}='secret'\n"
        ));
        let store = MemoryStore::default();

        let settings = resolve(&folder.0, HashMap::new(), &store).unwrap();

        assert_eq!(
            settings.get(DATABASE_URL_ENV).map(String::as_str),
            Some(REMOTE)
        );
        assert_eq!(
            store
                .secret(&credential_name(&folder.0, DB_PASSWORD_ENV))
                .as_deref(),
            Some("secret")
        );
        let scrubbed = folder.read();
        assert!(
            !scrubbed.contains("secret") && !scrubbed.contains(REMOTE),
            "the file still carries a secret: {scrubbed}"
        );
        assert!(scrubbed.contains(&format!("{DATABASE_URL_ENV}={STORED}")));
        assert!(scrubbed.contains(&format!("{DEPLOYMENT_MODE_ENV}=production")));
    }

    #[test]
    fn reads_a_stored_secret_back() {
        let folder = Folder::new("stored");
        folder.write(&format!("{DATABASE_URL_ENV}={STORED}\n"));
        let store = MemoryStore::default();
        store.remember(&credential_name(&folder.0, DATABASE_URL_ENV), REMOTE);

        let settings = resolve(&folder.0, HashMap::new(), &store).unwrap();

        assert_eq!(
            settings.get(DATABASE_URL_ENV).map(String::as_str),
            Some(REMOTE)
        );
    }

    #[test]
    fn fails_when_the_stored_secret_is_gone() {
        let folder = Folder::new("gone");
        folder.write(&format!("{DATABASE_URL_ENV}={STORED}\n"));

        let error = resolve(&folder.0, HashMap::new(), &MemoryStore::default())
            .expect_err("a missing credential must fail the start");

        assert_eq!(error, PortableError::NotStored(DATABASE_URL_ENV));
        assert!(error.to_string().contains(DATABASE_URL_ENV));
    }

    #[test]
    fn fails_instead_of_leaving_a_secret_readable() {
        let folder = Folder::new("refused");
        folder.write(&format!("{DATABASE_URL_ENV}={REMOTE}\n"));

        let error = resolve(&folder.0, HashMap::new(), &MemoryStore::refusing())
            .expect_err("a store that refuses must fail the start");

        assert_eq!(error, PortableError::NotStorable(DATABASE_URL_ENV));
        assert!(!error.to_string().contains("secret"));
    }

    #[test]
    fn resolves_a_relative_certificate_authority_against_the_folder() {
        let folder = Folder::new("relative-cert");
        folder.write(&format!("{DB_ROOT_CERT_ENV}=database-ca.pem\n"));

        let settings = resolve(&folder.0, HashMap::new(), &MemoryStore::default()).unwrap();

        let expected = folder.0.join("database-ca.pem");
        assert_eq!(
            settings.get(DB_ROOT_CERT_ENV).map(Path::new),
            Some(expected.as_path())
        );
    }

    #[test]
    fn keeps_an_absolute_certificate_authority() {
        let folder = Folder::new("absolute-cert");
        let absolute = if cfg!(windows) {
            "C:\\certs\\database-ca.pem"
        } else {
            "/etc/ssl/database-ca.pem"
        };
        folder.write(&format!("{DB_ROOT_CERT_ENV}={absolute}\n"));

        let settings = resolve(&folder.0, HashMap::new(), &MemoryStore::default()).unwrap();

        assert_eq!(
            settings.get(DB_ROOT_CERT_ENV).map(String::as_str),
            Some(absolute)
        );
    }

    #[test]
    fn rejects_a_malformed_line() {
        let folder = Folder::new("malformed");
        folder.write(&format!("{DB_HOST_ENV}=db.example.org\nnonsense\n"));

        let error = resolve(&folder.0, HashMap::new(), &MemoryStore::default())
            .expect_err("a malformed line must fail the start");

        assert_eq!(error, PortableError::Malformed(2));
        assert!(error.to_string().contains(ENV_FILE_NAME));
    }

    #[test]
    fn rejects_a_setting_that_is_not_read() {
        let folder = Folder::new("unknown");
        folder.write("SUPABASE_DB_SSLMODE=disable\n");

        let error = resolve(&folder.0, HashMap::new(), &MemoryStore::default())
            .expect_err("an unknown setting must fail the start");

        assert_eq!(error, PortableError::UnknownSetting(1));
    }

    #[test]
    fn never_lets_the_file_migrate_a_database() {
        let folder = Folder::new("migrate");
        folder.write(&format!(
            "{DEPLOYMENT_MODE_ENV}=production\n{MIGRATE_ENV}=true\n{DATABASE_URL_ENV}={STORED}\n"
        ));
        let store = MemoryStore::default();
        store.remember(&credential_name(&folder.0, DATABASE_URL_ENV), REMOTE);

        let settings = resolve(&folder.0, HashMap::new(), &store).unwrap();

        assert!(!DbConfig::resolve(&settings).unwrap().run_migrations);
    }

    #[test]
    fn a_second_installation_keeps_its_own_connection() {
        let configured = Folder::new("first-copy");
        configured.write(&format!("{DATABASE_URL_ENV}={REMOTE}\n"));
        let store = MemoryStore::default();
        resolve(&configured.0, HashMap::new(), &store).unwrap();

        // A build without a file of its own - an installed one, or a copy that
        // is not configured yet - must not remove what the first one stored.
        let unconfigured = Folder::new("second-copy");
        resolve(&unconfigured.0, HashMap::new(), &store).unwrap();

        let settings = resolve(&configured.0, HashMap::new(), &store).unwrap();
        assert_eq!(
            settings.get(DATABASE_URL_ENV).map(String::as_str),
            Some(REMOTE)
        );
    }

    #[test]
    fn keeps_the_settings_when_the_file_cannot_be_rewritten() {
        let folder = Folder::new("write-failure");
        let path = folder.write(&format!("{DATABASE_URL_ENV}={REMOTE}\n"));
        // A replacement cannot be renamed over the original while a directory
        // of that name is in the way, so the write fails.
        std::fs::create_dir(path.with_extension("env.replacement")).unwrap();

        let error = resolve(&folder.0, HashMap::new(), &MemoryStore::default())
            .expect_err("a failed rewrite must fail the start");

        assert_eq!(error, PortableError::Unreadable);
        assert!(
            folder.read().contains(REMOTE),
            "the file that could not be replaced was lost"
        );
    }

    #[cfg(unix)]
    #[test]
    fn refuses_a_file_that_others_may_read() {
        use std::os::unix::fs::PermissionsExt;

        let folder = Folder::new("permissions");
        let path = folder.write(&format!("{DB_HOST_ENV}=db.example.org\n"));
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o644)).unwrap();

        let error = resolve(&folder.0, HashMap::new(), &MemoryStore::default())
            .expect_err("a readable file must fail the start");

        assert_eq!(error, PortableError::Permissions);
        assert!(error.to_string().contains(ENV_FILE_NAME));
    }

    #[cfg(unix)]
    #[test]
    fn writes_the_scrubbed_file_back_owner_only() {
        use std::os::unix::fs::PermissionsExt;

        let folder = Folder::new("scrub-permissions");
        let path = folder.write(&format!("{DATABASE_URL_ENV}={REMOTE}\n"));

        resolve(&folder.0, HashMap::new(), &MemoryStore::default()).unwrap();

        let mode = std::fs::metadata(&path).unwrap().permissions().mode();
        assert_eq!(mode & 0o777, 0o600, "unexpected mode {mode:o}");
    }

    #[test]
    fn finds_the_file_next_to_the_application_bundle() {
        assert_eq!(
            folder_of(Path::new(
                "/Users/me/Apps/WorkTimeTracker.app/Contents/MacOS/WorkTimeTracker"
            )),
            Path::new("/Users/me/Apps")
        );
    }

    #[test]
    fn finds_the_file_next_to_a_plain_executable() {
        assert_eq!(
            folder_of(Path::new("/home/me/WorkTimeTracker/WorkTimeTracker")),
            Path::new("/home/me/WorkTimeTracker")
        );
    }
}

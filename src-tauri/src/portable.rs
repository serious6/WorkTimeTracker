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
    NotForgotten(&'static str),
    Unprotectable,
}

impl std::fmt::Display for PortableError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Unreadable => write!(
                formatter,
                "{ENV_FILE_NAME} next to the application could not be read"
            ),
            Self::Permissions => {
                #[cfg(windows)]
                {
                    write!(
                        formatter,
                        "{ENV_FILE_NAME} must be readable by its owner only; remove every other account from its permissions before starting again"
                    )
                }
                #[cfg(not(windows))]
                write!(
                    formatter,
                    "{ENV_FILE_NAME} must be readable by its owner only; restrict it (chmod 600) before starting again"
                )
            }
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
            Self::Unprotectable => write!(
                formatter,
                "the volume {ENV_FILE_NAME} sits on keeps no permissions, so the connection cannot be protected there; unpack the archive onto a volume that does"
            ),
            Self::NotForgotten(name) => write!(
                formatter,
                "{name} could not be removed from the credential store of this account; without {ENV_FILE_NAME} this folder must keep no secret, so restore the file or remove the credential by hand"
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
            forget(store, directory, setting)?;
        }
        return Ok(process);
    }
    verify_owner_only(&path)?;
    let contents = std::fs::read_to_string(&path).map_err(|_| PortableError::Unreadable)?;

    let mut settings = parse(&contents)?;
    protect_secrets(directory, &path, &contents, &mut settings, store, &process)?;
    absolute_root_cert(directory, &mut settings);

    for (key, value) in process {
        settings.insert(key, value);
    }
    Ok(settings)
}

/// Removes a secret of this folder from the credential store. A removal that
/// leaves the secret readable is reported, because a secret that outlives its
/// file is one the user believes to be gone. A store this build cannot reach at
/// all holds no secret of this folder either, so it does not fail the start of
/// the installed builds that never wrote one.
fn forget(
    store: &dyn SecretStore,
    directory: &Path,
    setting: &'static str,
) -> Result<(), PortableError> {
    let name = credential_name(directory, setting);
    if store.forget(&name) || store.secret(&name).is_none() {
        Ok(())
    } else {
        Err(PortableError::NotForgotten(setting))
    }
}

/// Fails on a file that an account other than its owner may read. The file
/// carries the connection in clear text until the first start moves it into the
/// credential store, so it is read only once the folder it was unpacked into
/// has not widened it.
fn verify_owner_only(path: &Path) -> Result<(), PortableError> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;

        let metadata = std::fs::metadata(path).map_err(|_| PortableError::Unreadable)?;
        if metadata.permissions().mode() & 0o077 != 0 {
            return Err(PortableError::Permissions);
        }
    }
    #[cfg(windows)]
    {
        match windows_acl::permissions(path).map_err(|_| PortableError::Unreadable)? {
            windows_acl::Permissions::OwnerOnly => {}
            windows_acl::Permissions::Wider => return Err(PortableError::Permissions),
            windows_acl::Permissions::Unsupported => return Err(PortableError::Unprotectable),
        }
    }
    #[cfg(not(any(unix, windows)))]
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
/// stored nor read fails the start instead of being used from the folder,
/// unless the process environment carries it: a managed deployment overrides
/// the file, so its value decides even when the credential is gone.
fn protect_secrets(
    directory: &Path,
    path: &Path,
    contents: &str,
    settings: &mut HashMap<String, String>,
    store: &dyn SecretStore,
    process: &HashMap<String, String>,
) -> Result<(), PortableError> {
    let mut absorbed = Vec::new();
    for setting in SECRET_KEYS {
        let name = credential_name(directory, setting);
        let Some(value) = settings.get(setting).cloned() else {
            forget(store, directory, setting)?;
            continue;
        };
        if value == STORED {
            match store.secret(&name) {
                Some(secret) => {
                    settings.insert(setting.to_owned(), secret);
                }
                // The value of the process environment is inserted over the
                // settings afterwards, so the marker is dropped rather than
                // used as a connection.
                None if process.contains_key(setting) => {
                    settings.remove(setting);
                }
                None => return Err(PortableError::NotStored(setting)),
            }
            continue;
        }
        // A value the process environment overrides is still moved out of the
        // file: it must not stay readable in the folder either way.
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
    // The folder may be shared, so a leftover of an earlier run is removed
    // rather than written into, and the replacement is only ever a file this
    // start created: a link planted at that name would otherwise receive the
    // settings and the restricted permissions of the replacement.
    let _ = std::fs::remove_file(&temporary);
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create_new(true);
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
/// mode of `OpenOptions` therefore did not apply. On Windows it replaces the
/// inherited permissions of the folder with a list that names the account of
/// this process alone.
fn restrict(path: &Path) -> std::io::Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;

        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))?;
    }
    #[cfg(windows)]
    windows_acl::restrict_to_owner(path)?;
    #[cfg(not(any(unix, windows)))]
    let _ = path;
    Ok(())
}

/// The Windows side of "only its owner may read this file". A file has no mode
/// there; what decides is its discretionary access control list, which a file
/// unpacked into a shared or synchronized folder inherits from that folder.
#[cfg(windows)]
mod windows_acl {
    use std::io;
    use std::os::windows::ffi::OsStrExt;
    use std::path::Path;

    use windows_sys::Win32::Foundation::{
        CloseHandle, LocalFree, ERROR_INVALID_FUNCTION, ERROR_NOT_SUPPORTED,
        ERROR_NO_SECURITY_ON_OBJECT, ERROR_SUCCESS, HANDLE, HLOCAL,
    };
    use windows_sys::Win32::Security::Authorization::{
        GetNamedSecurityInfoW, SetNamedSecurityInfoW, SE_FILE_OBJECT,
    };
    use windows_sys::Win32::Security::{
        AddAccessAllowedAce, CreateWellKnownSid, EqualSid, GetAce, GetLengthSid,
        GetTokenInformation, InitializeAcl, TokenUser, WinBuiltinAdministratorsSid,
        WinLocalSystemSid, ACCESS_ALLOWED_ACE, ACE_HEADER, ACL, ACL_REVISION,
        DACL_SECURITY_INFORMATION, OWNER_SECURITY_INFORMATION, PROTECTED_DACL_SECURITY_INFORMATION,
        PSID, TOKEN_QUERY, TOKEN_USER, WELL_KNOWN_SID_TYPE,
    };
    use windows_sys::Win32::Storage::FileSystem::FILE_ALL_ACCESS;
    use windows_sys::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};

    /// The entry types of an access control list that hand out access to the
    /// account named in the entry itself. The remaining ones deny access or
    /// only record it, so they never widen the file.
    const GRANTING_ACE_TYPES: [u8; 2] = [0, 9];

    /// The entry types that hand out access to an account this code does not
    /// read: they carry the account behind a variable number of identifiers.
    /// A file object never carries them, and one that did would be wider than
    /// this code can prove, so it counts as wider.
    const OPAQUE_ACE_TYPES: [u8; 2] = [5, 11];

    /// The answers of a volume that keeps no permissions at all.
    const UNPROTECTABLE_STATUS: [u32; 3] = [
        ERROR_NOT_SUPPORTED,
        ERROR_INVALID_FUNCTION,
        ERROR_NO_SECURITY_ON_OBJECT,
    ];

    /// What the file allows.
    pub enum Permissions {
        OwnerOnly,
        Wider,
        /// The volume keeps no permissions at all, as a FAT formatted stick
        /// does. Nothing can be protected there, and nothing can be repaired
        /// either, so it is worth its own message.
        Unsupported,
    }

    /// Whether the file is owned by the account of this process and its list
    /// grants access to no one else. The two authorities of the machine itself
    /// count as its owner: they may take ownership of any file regardless of
    /// the list, so refusing them would only make every ordinary folder
    /// unusable.
    pub fn permissions(path: &Path) -> Result<Permissions, ()> {
        let trusted = trusted_sids().ok_or(())?;
        let name = wide(path);
        // SAFETY: the descriptor is filled in by the call, the owner and the
        // list point into it, and both are read before it is released again.
        unsafe {
            let mut owner: PSID = std::ptr::null_mut();
            let mut list: *mut ACL = std::ptr::null_mut();
            let mut descriptor = std::ptr::null_mut();
            let status = GetNamedSecurityInfoW(
                name.as_ptr(),
                SE_FILE_OBJECT,
                OWNER_SECURITY_INFORMATION | DACL_SECURITY_INFORMATION,
                &mut owner,
                std::ptr::null_mut(),
                &mut list,
                std::ptr::null_mut(),
                &mut descriptor,
            );
            if UNPROTECTABLE_STATUS.contains(&status) {
                return Ok(Permissions::Unsupported);
            }
            if status != ERROR_SUCCESS {
                return Err(());
            }
            // The owner of a file may hand itself access back at any time, so
            // a file owned by another account is as wide as one listed for it.
            let owned_by_others = owner.is_null()
                || !trusted
                    .iter()
                    .any(|known| EqualSid(owner, known.pointer()) != 0);
            let verdict = grants_beyond(list, &trusted);
            LocalFree(descriptor as HLOCAL);
            match verdict? {
                true => Ok(Permissions::Wider),
                false if owned_by_others => Ok(Permissions::Wider),
                false => Ok(Permissions::OwnerOnly),
            }
        }
    }

    /// Walks the entries of the list. A file without a list at all is open to
    /// everyone, which is the widest case there is.
    unsafe fn grants_beyond(list: *const ACL, trusted: &[Sid]) -> Result<bool, ()> {
        if list.is_null() {
            return Ok(true);
        }
        for index in 0..u32::from((*list).AceCount) {
            let mut entry = std::ptr::null_mut();
            if GetAce(list, index, &mut entry) == 0 {
                return Err(());
            }
            let header = &*(entry as *const ACE_HEADER);
            if OPAQUE_ACE_TYPES.contains(&header.AceType) {
                return Ok(true);
            }
            if !GRANTING_ACE_TYPES.contains(&header.AceType) {
                continue;
            }
            let granted = &*(entry as *const ACCESS_ALLOWED_ACE);
            let sid = std::ptr::addr_of!(granted.SidStart) as PSID;
            if !trusted
                .iter()
                .any(|known| EqualSid(sid, known.pointer()) != 0)
            {
                return Ok(true);
            }
        }
        Ok(false)
    }

    /// Replaces the list of the file with one entry, the account of this
    /// process. The list is marked protected, so the folder the file sits in
    /// cannot hand its own permissions down onto it again.
    pub fn restrict_to_owner(path: &Path) -> io::Result<()> {
        let owner = current_user_sid()
            .ok_or_else(|| io::Error::other("the account of this process has no identifier"))?;
        let size = std::mem::size_of::<ACL>() + std::mem::size_of::<ACCESS_ALLOWED_ACE>()
            - std::mem::size_of::<u32>()
            + owner.length;
        // An access control list is read as words, so the buffer is one too.
        let mut buffer = vec![0u32; size.div_ceil(std::mem::size_of::<u32>())];
        let list = buffer.as_mut_ptr().cast::<ACL>();
        let name = wide(path);
        // SAFETY: the list is built in a buffer of the size the entry needs,
        // and the identifier outlives the call that copies it into the list.
        unsafe {
            if InitializeAcl(list, size as u32, ACL_REVISION) == 0
                || AddAccessAllowedAce(list, ACL_REVISION, FILE_ALL_ACCESS, owner.pointer()) == 0
            {
                return Err(io::Error::last_os_error());
            }
            let status = SetNamedSecurityInfoW(
                name.as_ptr(),
                SE_FILE_OBJECT,
                DACL_SECURITY_INFORMATION | PROTECTED_DACL_SECURITY_INFORMATION,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                list,
                std::ptr::null(),
            );
            if status != ERROR_SUCCESS {
                return Err(io::Error::from_raw_os_error(status as i32));
            }
        }
        Ok(())
    }

    /// An identifier of an account, held in a buffer of words so that it
    /// carries the alignment the Win32 API reads it with.
    struct Sid {
        buffer: Vec<u32>,
        length: usize,
    }

    impl Sid {
        fn of_length(length: usize) -> Self {
            Self {
                buffer: vec![0; length.div_ceil(std::mem::size_of::<u32>()).max(1)],
                length,
            }
        }

        fn pointer(&self) -> PSID {
            self.buffer.as_ptr() as PSID
        }

        fn pointer_mut(&mut self) -> PSID {
            self.buffer.as_mut_ptr().cast()
        }
    }

    /// The account of this process, the local system and the administrators of
    /// the machine.
    fn trusted_sids() -> Option<Vec<Sid>> {
        Some(vec![
            current_user_sid()?,
            well_known_sid(WinLocalSystemSid)?,
            well_known_sid(WinBuiltinAdministratorsSid)?,
        ])
    }

    /// The identifier of the account this process runs as, read from its token.
    fn current_user_sid() -> Option<Sid> {
        // SAFETY: the token is closed again, and the information is read into a
        // buffer of the length the first call reports and of the alignment the
        // structure needs.
        unsafe {
            let mut token: HANDLE = std::ptr::null_mut();
            if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) == 0 {
                return None;
            }
            let mut length = 0u32;
            GetTokenInformation(token, TokenUser, std::ptr::null_mut(), 0, &mut length);
            let mut buffer = vec![0u64; (length as usize).div_ceil(size_of::<u64>()).max(1)];
            let read = GetTokenInformation(
                token,
                TokenUser,
                buffer.as_mut_ptr().cast(),
                length,
                &mut length,
            );
            CloseHandle(token);
            if read == 0 {
                return None;
            }
            let user = &*(buffer.as_ptr() as *const TOKEN_USER);
            Some(copy_sid(user.User.Sid))
        }
    }

    /// The identifier of an authority every Windows installation knows.
    fn well_known_sid(kind: WELL_KNOWN_SID_TYPE) -> Option<Sid> {
        // SAFETY: the identifier is written into a buffer of the length the
        // first call reports.
        unsafe {
            let mut length = 0u32;
            CreateWellKnownSid(
                kind,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                &mut length,
            );
            let mut sid = Sid::of_length(length as usize);
            if CreateWellKnownSid(kind, std::ptr::null_mut(), sid.pointer_mut(), &mut length) == 0 {
                return None;
            }
            Some(sid)
        }
    }

    /// An identifier the caller owns, copied out of a structure it does not.
    unsafe fn copy_sid(sid: PSID) -> Sid {
        let length = GetLengthSid(sid) as usize;
        let mut copy = Sid::of_length(length);
        std::ptr::copy_nonoverlapping(sid.cast::<u8>(), copy.pointer_mut().cast::<u8>(), length);
        copy
    }

    /// The path in the spelling the Win32 API reads, terminated by a zero.
    fn wide(path: &Path) -> Vec<u16> {
        path.as_os_str().encode_wide().chain(Some(0)).collect()
    }
}

/// The name a secret is filed under in the credential store: the setting and a
/// fingerprint of the folder it was configured in. The store is shared by
/// every installation of this user account, so without the folder an installed
/// build that carries no file would remove the secrets of a portable one.
fn credential_name(directory: &Path, setting: &str) -> String {
    format!("{setting}@{}", fingerprint(directory))
}

/// FNV-1a over the folder the installation runs from. Symbolic links are
/// resolved first, so the same folder reached over different paths keeps its
/// credentials, and the spelling is folded to lower case only where the
/// filesystem itself ignores case. On a case-sensitive volume `Portable/Foo`
/// and `Portable/foo` are two installations that must not reach each other's
/// secrets. The fingerprint identifies an installation, it protects nothing,
/// and the folder itself is no secret.
fn fingerprint(directory: &Path) -> String {
    let canonical = std::fs::canonicalize(directory).unwrap_or_else(|_| directory.to_path_buf());
    let spelling = canonical.to_string_lossy();
    let spelling = if ignores_case(&canonical) {
        spelling.to_lowercase()
    } else {
        spelling.into_owned()
    };
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in spelling.bytes() {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("{hash:016x}")
}

/// Whether the filesystem of this folder reaches it under any spelling of its
/// case, which Windows does.
#[cfg(windows)]
fn ignores_case(_directory: &Path) -> bool {
    true
}

/// Whether the filesystem of this folder reaches it under any spelling of its
/// case. macOS formats a volume either way, so it is asked rather than assumed:
/// the folder is looked up again with every letter of its path in the other
/// case, and it is the same folder when both spellings name one inode. A folder
/// that cannot be looked up counts as case-sensitive, the answer that keeps two
/// installations apart.
#[cfg(unix)]
fn ignores_case(directory: &Path) -> bool {
    use std::os::unix::fs::MetadataExt;

    let flipped: String = directory
        .to_string_lossy()
        .chars()
        .map(|letter| {
            if letter.is_uppercase() {
                letter.to_lowercase().next().unwrap_or(letter)
            } else {
                letter.to_uppercase().next().unwrap_or(letter)
            }
        })
        .collect();
    let Ok(folder) = std::fs::metadata(directory) else {
        return false;
    };
    std::fs::metadata(Path::new(&flipped))
        .is_ok_and(|other| other.dev() == folder.dev() && other.ino() == folder.ino())
}

/// No portable archive is shipped for the platforms that are neither, so the
/// spelling is kept as it is.
#[cfg(not(any(windows, unix)))]
fn ignores_case(_directory: &Path) -> bool {
    false
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
        keeps: bool,
    }

    impl MemoryStore {
        fn refusing() -> Self {
            Self {
                refuses: true,
                ..Self::default()
            }
        }

        /// A store whose removal fails, as a locked Credential Manager does.
        fn forgetting_nothing() -> Self {
            Self {
                keeps: true,
                ..Self::default()
            }
        }

        /// Files a secret past `remember`, so that a store which refuses every
        /// change still holds one.
        fn keep(&self, name: &str, secret: &str) {
            self.secrets
                .borrow_mut()
                .insert(name.to_owned(), secret.to_owned());
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
            if self.keeps {
                return false;
            }
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
    fn the_process_environment_wins_over_a_secret_the_store_lost() {
        let folder = Folder::new("override-lost-secret");
        folder.write(&format!("{DATABASE_URL_ENV}={STORED}\n"));

        let settings = resolve(
            &folder.0,
            process(&[(DATABASE_URL_ENV, "local")]),
            &MemoryStore::default(),
        )
        .expect("the value of the process environment decides");

        assert_eq!(
            settings.get(DATABASE_URL_ENV).map(String::as_str),
            Some("local")
        );
    }

    #[test]
    fn a_secret_of_the_file_is_scrubbed_even_when_the_process_overrides_it() {
        let folder = Folder::new("override-scrub");
        folder.write(&format!("{DATABASE_URL_ENV}={REMOTE}\n"));
        let store = MemoryStore::default();

        resolve(&folder.0, process(&[(DATABASE_URL_ENV, "local")]), &store).unwrap();

        assert!(
            !folder.read().contains(REMOTE),
            "the file still carries a secret the process environment overrides"
        );
    }

    #[test]
    fn fails_when_a_secret_of_a_deleted_file_cannot_be_forgotten() {
        let folder = Folder::new("forget-failure");
        let store = MemoryStore::forgetting_nothing();
        store.keep(&credential_name(&folder.0, DATABASE_URL_ENV), REMOTE);

        let error = resolve(&folder.0, HashMap::new(), &store)
            .expect_err("a credential that survives its file must fail the start");

        assert_eq!(error, PortableError::NotForgotten(DATABASE_URL_ENV));
        assert!(error.to_string().contains(DATABASE_URL_ENV));
    }

    #[test]
    fn a_store_without_a_secret_of_this_folder_does_not_fail_the_start() {
        let folder = Folder::new("forget-nothing");

        let settings = resolve(
            &folder.0,
            process(&[(DB_HOST_ENV, "db.example.org")]),
            &MemoryStore::forgetting_nothing(),
        )
        .expect("a store that holds no secret of this folder is no failure");

        assert_eq!(settings, process(&[(DB_HOST_ENV, "db.example.org")]));
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
    fn two_folders_that_differ_only_in_case_are_two_installations() {
        let upper = Folder::new("Case-Split");
        let lower = Folder::new("case-split");
        // A volume that ignores case reaches one folder under both spellings,
        // so there is only one installation, and it keeps one set of secrets.
        if ignores_case(&upper.0) {
            return;
        }

        assert_ne!(
            credential_name(&upper.0, DATABASE_URL_ENV),
            credential_name(&lower.0, DATABASE_URL_ENV)
        );
    }

    #[cfg(unix)]
    #[test]
    fn a_link_to_the_folder_reaches_the_secrets_of_that_folder() {
        let folder = Folder::new("linked");
        let link = std::env::temp_dir().join("wtt-portable-link");
        let _ = std::fs::remove_file(&link);
        std::os::unix::fs::symlink(&folder.0, &link).expect("the test link is created");

        let same = credential_name(&link, DATABASE_URL_ENV)
            == credential_name(&folder.0, DATABASE_URL_ENV);
        let _ = std::fs::remove_file(&link);

        assert!(same, "the same folder was taken for two installations");
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

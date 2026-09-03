use tauri::{State, Webview};

use crate::{
    auth::{self, LoginAttempts, SessionId, Sessions},
    error::{AppError, AppResult},
    logging,
    models::{
        Absence, AbsenceAudit, AuditLogEntry, Credentials, ListRange, OvertimeAudit, OvertimeEntry,
        Project, ProjectBudget, SaveAbsence, SaveOvertimeEntry, SaveProject, SaveProjectBudget,
        SaveTimeEntry, SecurityAudit, TimeEntry, TimeEntryAudit, User, WorkSettings,
        LOCKED_OUT_ACTION, LOGIN_FAILED_ACTION,
    },
    store::{Database, OvertimeWriteError, StoreError, SwitchEntryError, TimeEntryWriteError},
};

const OVERLAP: &str = "This time overlaps with another time entry";
const DUPLICATE_BUDGET: &str = "This project already has a budget";
const DUPLICATE_ABSENCE: &str = "This day already has an absence";
const DUPLICATE_OVERTIME: &str = "This date already has an overtime record";
const SINGLE_OPENING: &str = "Only one opening balance can be set";
const INVALID_CREDENTIALS: &str = "Email or password is incorrect";
const DUPLICATE_EMAIL: &str = "An account with this email already exists";

fn unique_error(message: &'static str) -> impl Fn(StoreError) -> AppError {
    move |error| {
        if matches!(error, StoreError::UniqueViolation) {
            AppError::conflict(message)
        } else {
            AppError::from(error)
        }
    }
}

/// Verifies a password against the stored hash of the email. An unknown email
/// verifies a dummy hash instead of returning early, so both paths cost the
/// same Argon2 verification and cannot be told apart by their timing.
fn verify_credentials(record: Option<(i64, String)>, password: &str) -> Option<i64> {
    match record {
        Some((user_id, hash)) => auth::verify_password(password, &hash).then_some(user_id),
        None => {
            auth::verify_dummy_password(password);
            None
        }
    }
}

/// Every command works on the data of the signed in user only. The session is
/// named by the command instead of read from an ambient singleton, so a command
/// without an identity cannot compile. The label of the calling webview is
/// checked as well: the id is a bearer token, and binding it to the window it
/// was issued to keeps a leaked id useless everywhere else.
fn current_user(sessions: &Sessions, session_id: &SessionId, window: &str) -> AppResult<i64> {
    sessions
        .user_id(session_id, window)?
        .ok_or_else(AppError::not_signed_in)
}

/// Commands that run without a signed in user, each one deliberately public:
/// the three that create or end a session, the session probe that answers
/// `null` when nobody is signed in, the application version and the log sink of
/// the user interface. Every other command is written with `authed_command!`,
/// and the tests below fail when a hand written command is not listed here.
pub const PUBLIC_COMMANDS: [&str; 6] = [
    "register",
    "login",
    "logout",
    "current_session",
    "get_app_version",
    "log_client_error",
];

/// A list command without a window still answers a bounded number of rows, so
/// its cost never grows with the age of the account.
fn list_range(range: Option<ListRange>) -> AppResult<ListRange> {
    let mut range = range.unwrap_or_default();
    range.validate()?;
    Ok(range)
}

/// Answer of `register` and `login`: the account plus the id of the started
/// session, which the caller repeats with every following command.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SignedIn {
    user: User,
    session_id: SessionId,
}

#[tauri::command]
pub fn register(
    webview: Webview,
    database: State<'_, Database>,
    sessions: State<'_, Sessions>,
    mut credentials: Credentials,
) -> AppResult<SignedIn> {
    logging::logged("register", || {
        credentials.validate_registration()?;
        let password_hash = auth::hash_password(&credentials.password)?;
        let user = database
            .0
            .register_user(&credentials.email, &password_hash)
            .map_err(unique_error(DUPLICATE_EMAIL))?;
        let session_id = sessions.start(user.id, webview.label())?;
        Ok(SignedIn { user, session_id })
    })
}

#[tauri::command]
pub fn login(
    webview: Webview,
    database: State<'_, Database>,
    sessions: State<'_, Sessions>,
    mut credentials: Credentials,
) -> AppResult<SignedIn> {
    logging::logged("login", || {
        let attempts = LoginAttempts::new(database.0.as_ref());
        credentials
            .validate()
            .map_err(|_| AppError::validation(INVALID_CREDENTIALS))?;
        // The attempt is counted before the password is verified, so parallel
        // logins cannot verify more passwords together than the limit allows.
        // A rejected attempt is recorded as durable evidence: the counter of
        // the lockout is evicted once it expires, the audit record stays.
        if let Err(error) = attempts.begin(&credentials.email) {
            if matches!(error, AppError::RateLimited(_)) {
                database
                    .0
                    .record_auth_event(&credentials.email, LOCKED_OUT_ACTION)?;
            }
            return Err(error);
        }
        let record = database.0.read_password_hash(&credentials.email)?;
        let user = verify_credentials(record, &credentials.password)
            .and_then(|id| database.0.read_user(id).transpose())
            .transpose()?;
        let Some(user) = user else {
            database
                .0
                .record_auth_event(&credentials.email, LOGIN_FAILED_ACTION)?;
            return Err(AppError::validation(INVALID_CREDENTIALS));
        };
        attempts.record_success(&credentials.email)?;
        let session_id = sessions.start(user.id, webview.label())?;
        Ok(SignedIn { user, session_id })
    })
}

#[tauri::command]
pub fn logout(
    webview: Webview,
    sessions: State<'_, Sessions>,
    session_id: String,
) -> AppResult<()> {
    logging::logged("logout", || {
        sessions.end(&SessionId::from(session_id), webview.label())
    })
}

#[tauri::command]
pub fn current_session(
    webview: Webview,
    database: State<'_, Database>,
    sessions: State<'_, Sessions>,
    session_id: String,
) -> AppResult<Option<User>> {
    logging::logged("current_session", || {
        let Some(user_id) = sessions.user_id(&SessionId::from(session_id), webview.label())? else {
            return Ok(None);
        };
        Ok(database.0.read_user(user_id)?)
    })
}

fn map_overtime_write_error(error: OvertimeWriteError) -> AppError {
    match error {
        OvertimeWriteError::SecondOpening => AppError::conflict(SINGLE_OPENING),
        OvertimeWriteError::Store(StoreError::UniqueViolation) => {
            AppError::conflict(DUPLICATE_OVERTIME)
        }
        OvertimeWriteError::Store(error) => AppError::from(error),
    }
}

fn map_time_entry_write_error(error: TimeEntryWriteError) -> AppError {
    match error {
        TimeEntryWriteError::Overlap => AppError::conflict(OVERLAP),
        TimeEntryWriteError::InvalidBreak => {
            AppError::validation("a break is not booked on a project")
        }
        TimeEntryWriteError::Store(error) => AppError::from(error),
    }
}

/// Wraps a command with the three things every command needs: the log frame,
/// the lookup of the signed in user and the check that the call comes from the
/// window that session belongs to. The body only runs for a live session of the
/// calling webview, so an authorisation check cannot be forgotten. A command
/// that runs without a session has to be written by hand and named in
/// [`PUBLIC_COMMANDS`].
macro_rules! authed_command {
    (
        $(#[$meta:meta])*
        fn $name:ident($($params:tt)*) -> $ret:ty,
        |$db:ident, $user:ident| $body:expr
    ) => {
        $(#[$meta])*
        #[tauri::command]
        pub fn $name(
            webview: Webview,
            database: State<'_, Database>,
            sessions: State<'_, Sessions>,
            session_id: String,
            $($params)*
        ) -> AppResult<$ret> {
            logging::logged(stringify!($name), || {
                let $user = current_user(
                    &sessions,
                    &SessionId::from(session_id),
                    webview.label(),
                )?;
                let $db = &database;
                $body
            })
        }
    };
}

authed_command!(
    fn list_projects() -> Vec<Project>,
    |db, user| Ok(db.0.list_projects(user)?)
);

authed_command!(
    fn create_project(mut input: SaveProject) -> Project,
    |db, user| {
        input.validate()?;
        Ok(db.0.insert_project(user, &input)?)
    }
);

authed_command!(
    fn update_project(id: i64, mut input: SaveProject) -> Project,
    |db, user| {
        input.validate()?;
        Ok(db.0.update_project(id, user, &input)?)
    }
);

authed_command!(
    fn delete_project(id: i64) -> (),
    |db, user| Ok(db.0.delete_project(id, user)?)
);

authed_command!(
    fn list_time_entries(range: Option<ListRange>) -> Vec<TimeEntry>,
    |db, user| {
        let range = list_range(range)?;
        Ok(db.0.list_time_entries(user, &range)?)
    }
);

authed_command!(
    fn create_time_entry(mut input: SaveTimeEntry) -> TimeEntry,
    |db, user| {
        input.validate()?;
        if input.project_id.is_none() && !input.is_break() {
            return Err(AppError::validation("Project is required"));
        }
        db.0.create_time_entry(user, &input)
            .map_err(map_time_entry_write_error)
    }
);

authed_command!(
    fn update_time_entry(id: i64, mut input: SaveTimeEntry) -> TimeEntry,
    |db, user| {
        input.validate()?;
        db.0.update_time_entry(id, user, &input)
            .map_err(map_time_entry_write_error)
    }
);

authed_command!(
    fn update_time_entry_note(id: i64, note: Option<String>) -> TimeEntry,
    |db, user| {
        let note = note
            .map(|text| text.trim().to_owned())
            .filter(|text| !text.is_empty());
        if note.as_ref().is_some_and(|note| note.chars().count() > 500) {
            return Err(AppError::validation("invalid note"));
        }
        Ok(db.0.update_time_entry_note(id, user, note.as_deref())?)
    }
);

authed_command!(
    fn switch_running_time_entry(id: i64, mut input: SaveTimeEntry) -> TimeEntry,
    |db, user| {
        input.validate()?;
        if input.project_id.is_none() || input.end_time.is_some() {
            return Err(AppError::validation("invalid timer switch"));
        }
        db.0.switch_running_time_entry(id, user, &input)
            .map_err(|error| match error {
                SwitchEntryError::InvalidTimer => AppError::validation("invalid timer switch"),
                SwitchEntryError::Overlap => AppError::conflict(OVERLAP),
                SwitchEntryError::Store(error) => AppError::from(error),
            })
    }
);

authed_command!(
    fn delete_time_entry(id: i64) -> (),
    |db, user| Ok(db.0.delete_time_entry(id, user)?)
);

authed_command!(
    /// The audit trail is read only, it has no command that changes or removes it.
    fn list_time_entry_audits(range: Option<ListRange>) -> Vec<TimeEntryAudit>,
    |db, user| {
        let range = list_range(range)?;
        Ok(db.0.list_time_entry_audits(user, &range)?)
    }
);

authed_command!(
    fn list_audit_log(range: Option<ListRange>) -> Vec<AuditLogEntry>,
    |db, user| {
        let range = list_range(range)?;
        Ok(db.0.list_audit_log(user, &range)?)
    }
);

authed_command!(
    /// The identity and configuration records of the signed in user.
    fn list_security_audits(range: Option<ListRange>) -> Vec<SecurityAudit>,
    |db, user| {
        let range = list_range(range)?;
        Ok(db.0.list_security_audits(user, &range)?)
    }
);

authed_command!(
    fn list_project_budgets() -> Vec<ProjectBudget>,
    |db, user| Ok(db.0.list_project_budgets(user)?)
);

authed_command!(
    fn create_project_budget(mut input: SaveProjectBudget) -> ProjectBudget,
    |db, user| {
        input.validate()?;
        db.0.insert_project_budget(user, &input)
            .map_err(unique_error(DUPLICATE_BUDGET))
    }
);

authed_command!(
    fn update_project_budget(id: i64, mut input: SaveProjectBudget) -> ProjectBudget,
    |db, user| {
        input.validate()?;
        db.0.update_project_budget(id, user, &input)
            .map_err(unique_error(DUPLICATE_BUDGET))
    }
);

authed_command!(
    fn delete_project_budget(id: i64) -> (),
    |db, user| Ok(db.0.delete_project_budget(id, user)?)
);

authed_command!(
    fn list_absences(range: Option<ListRange>) -> Vec<Absence>,
    |db, user| {
        let range = list_range(range)?;
        Ok(db.0.list_absences(user, &range)?)
    }
);

authed_command!(
    fn create_absence(mut input: SaveAbsence) -> Absence,
    |db, user| {
        input.validate()?;
        db.0.insert_absence(user, &input)
            .map_err(unique_error(DUPLICATE_ABSENCE))
    }
);

authed_command!(
    fn update_absence(id: i64, mut input: SaveAbsence) -> Absence,
    |db, user| {
        input.validate()?;
        db.0.update_absence(id, user, &input)
            .map_err(unique_error(DUPLICATE_ABSENCE))
    }
);

authed_command!(
    fn save_absences(
        mut inputs: Vec<SaveAbsence>,
        replacement_ids: Vec<i64>,
        update_id: Option<i64>,
    ) -> Vec<Absence>,
    |db, user| {
        SaveAbsence::validate_range(&mut inputs).map_err(AppError::validation)?;
        db.0.save_absences(user, &inputs, &replacement_ids, update_id)
            .map_err(unique_error(DUPLICATE_ABSENCE))
    }
);

authed_command!(
    fn delete_absence(id: i64) -> (),
    |db, user| Ok(db.0.delete_absence(id, user)?)
);

authed_command!(
    /// The audit trail is read only, it has no command that changes or removes it.
    fn list_absence_audits(range: Option<ListRange>) -> Vec<AbsenceAudit>,
    |db, user| {
        let range = list_range(range)?;
        Ok(db.0.list_absence_audits(user, &range)?)
    }
);

authed_command!(
    fn list_overtime_entries() -> Vec<OvertimeEntry>,
    |db, user| Ok(db.0.list_overtime_entries(user)?)
);

authed_command!(
    fn create_overtime_entry(mut input: SaveOvertimeEntry) -> OvertimeEntry,
    |db, user| {
        input.validate()?;
        db.0.insert_overtime_entry(user, &input)
            .map_err(map_overtime_write_error)
    }
);

authed_command!(
    fn update_overtime_entry(id: i64, mut input: SaveOvertimeEntry) -> OvertimeEntry,
    |db, user| {
        input.validate()?;
        db.0.update_overtime_entry(id, user, &input)
            .map_err(map_overtime_write_error)
    }
);

authed_command!(
    fn delete_overtime_entry(id: i64) -> (),
    |db, user| Ok(db.0.delete_overtime_entry(id, user)?)
);

authed_command!(
    /// The audit trail is read only, it has no command that changes or removes it.
    fn list_overtime_audits(range: Option<ListRange>) -> Vec<OvertimeAudit>,
    |db, user| {
        let range = list_range(range)?;
        Ok(db.0.list_overtime_audits(user, &range)?)
    }
);

authed_command!(
    fn get_work_settings() -> WorkSettings,
    |db, user| Ok(db.0.read_settings(user)?)
);

authed_command!(
    fn update_work_settings(mut settings: WorkSettings) -> WorkSettings,
    |db, user| {
        settings.validate()?;
        Ok(db.0.write_settings(user, &settings)?)
    }
);

/// The version of the running binary. A deployed database is shared by every
/// installation, so the version is reported from the local build instead of
/// from the `app_metadata` row another installation may have written.
#[tauri::command]
pub fn get_app_version() -> AppResult<Option<String>> {
    logging::logged("get_app_version", || {
        Ok(Some(env!("CARGO_PKG_VERSION").to_owned()))
    })
}

/// Writes a failure of the user interface into the same log file. The message is
/// redacted by the logger, so client-side data cannot leak into the log either.
#[tauri::command]
pub fn log_client_error(source: String, message: String) -> AppResult<()> {
    let source: String = source
        .trim()
        .chars()
        .take(logging::MAX_MESSAGE_CHARS)
        .collect();
    let message: String = message
        .trim()
        .chars()
        .take(logging::MAX_MESSAGE_CHARS)
        .collect();
    logging::error(&format!("ui/{source}"), &message);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::Ordering;

    /// The command source without the test module, so that the scanning tests
    /// below do not read their own string literals as commands.
    fn command_source() -> &'static str {
        include_str!("commands.rs")
            .split("#[cfg(test)]")
            .next()
            .expect("the command source always has a first part")
    }

    /// The name declared by the first `fn` of a source block, whatever
    /// qualifiers (`pub`, `pub(crate)`, `async`, further attributes) stand in
    /// front of it. `None` when the block declares no function at all.
    fn declared_name(block: &str) -> Option<&str> {
        // `(` ends the name, so `fn login(` yields the tokens `fn` and `login`.
        let mut tokens = block
            .split(|character: char| character.is_whitespace() || character == '(')
            .filter(|token| !token.is_empty());
        tokens.find(|token| *token == "fn")?;
        tokens.next()
    }

    /// Names of the commands that are written by hand, that is every
    /// `#[tauri::command]` that survives in the source instead of being
    /// generated by `authed_command!`.
    fn hand_written_commands() -> Vec<String> {
        command_source()
            .split("#[tauri::command]")
            .skip(1)
            .filter_map(|block| {
                let name = declared_name(block).expect("a command attribute declares a function");
                // `pub fn $name` is the template inside `authed_command!` itself.
                (!name.starts_with('$')).then(|| name.to_owned())
            })
            .collect()
    }

    /// Names of the commands generated by `authed_command!`, read from the
    /// `fn <name>(...)` line of every invocation of the macro. The definition
    /// of the macro is written as `authed_command {`, so it is not an
    /// invocation and cannot be mistaken for one.
    fn generated_commands() -> Vec<String> {
        command_source()
            .split("authed_command!(")
            .skip(1)
            .map(|block| {
                declared_name(block)
                    .expect("an authed_command! invocation declares a function")
                    .to_owned()
            })
            .collect()
    }

    #[test]
    fn the_hand_written_commands_are_exactly_the_public_ones() {
        let mut hand_written = hand_written_commands();
        hand_written.sort();
        let mut public: Vec<String> = PUBLIC_COMMANDS
            .iter()
            .map(|name| (*name).to_owned())
            .collect();
        public.sort();

        assert_eq!(
            hand_written, public,
            "a command that skips authed_command! has to be listed in PUBLIC_COMMANDS, \
             and PUBLIC_COMMANDS may not name anything else"
        );
    }

    #[test]
    fn every_registered_command_is_authenticated_or_public() {
        let generated = generated_commands();
        let registered: Vec<String> = include_str!("lib.rs")
            .split("commands::")
            .skip(1)
            .filter_map(|rest| {
                rest.split(|c: char| !c.is_ascii_alphanumeric() && c != '_')
                    .next()
                    .map(str::to_owned)
            })
            .filter(|name| !name.is_empty())
            .collect();

        assert!(
            registered.len() > 20,
            "the handler list was not found: {registered:?}"
        );
        for name in registered {
            assert!(
                generated.contains(&name) || PUBLIC_COMMANDS.contains(&name.as_str()),
                "{name} is registered but neither wrapped by authed_command! nor public"
            );
        }
    }

    /// Every command that knows about sessions has to take the calling webview
    /// and pass its label on, so a session id cannot be used from a window it
    /// was never issued to. The template of `authed_command!` is scanned too,
    /// which covers every generated command at once.
    #[test]
    fn every_session_aware_command_binds_the_calling_window() {
        let mut checked = 0;
        for block in command_source().split("#[tauri::command]").skip(1) {
            if !block.contains("sessions: State<'_, Sessions>") {
                continue;
            }
            let name = declared_name(block).expect("a command attribute declares a function");
            assert!(
                block.contains("webview: Webview") && block.contains("webview.label()"),
                "{name} works with a session without binding the calling window"
            );
            checked += 1;
        }

        assert!(
            checked >= 5,
            "the session aware commands were not found: {checked}"
        );
    }

    #[test]
    fn rejects_a_session_id_replayed_from_another_window() {
        let sessions = Sessions::default();
        let id = sessions.start(7, "main").unwrap();

        assert_eq!(current_user(&sessions, &id, "main"), Ok(7));
        assert_eq!(
            current_user(&sessions, &id, "second"),
            Err(AppError::not_signed_in())
        );
    }

    #[test]
    fn verifies_a_dummy_hash_when_the_email_is_unknown() {
        let before = auth::DUMMY_VERIFICATIONS.load(Ordering::SeqCst);

        assert_eq!(verify_credentials(None, "Str0ng-Passphrase!!x"), None);

        assert_eq!(
            auth::DUMMY_VERIFICATIONS.load(Ordering::SeqCst),
            before + 1,
            "an unknown email must still verify a password"
        );
    }

    #[test]
    fn verifies_the_stored_hash_of_a_known_email() {
        let hash = auth::hash_password("Str0ng-Passphrase!!x").unwrap();
        let before = auth::DUMMY_VERIFICATIONS.load(Ordering::SeqCst);

        assert_eq!(
            verify_credentials(Some((7, hash.clone())), "Str0ng-Passphrase!!x"),
            Some(7)
        );
        assert_eq!(verify_credentials(Some((7, hash)), "wrong-password"), None);

        assert_eq!(auth::DUMMY_VERIFICATIONS.load(Ordering::SeqCst), before);
    }
}

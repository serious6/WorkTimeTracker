use tauri::State;

use crate::{
    auth::{self, LoginAttempts, SessionId, Sessions},
    error::{AppError, AppResult},
    logging,
    models::{
        Absence, AbsenceAudit, AuditLogEntry, Credentials, Project, ProjectBudget, SaveAbsence,
        SaveProject, SaveProjectBudget, SaveTimeEntry, TimeEntry, TimeEntryAudit, User,
        WorkSettings,
    },
    store::{Database, StoreError, SwitchEntryError, TimeEntryWriteError},
};

const OVERLAP: &str = "This time overlaps with another time entry";
const DUPLICATE_BUDGET: &str = "This project already has a budget";
const DUPLICATE_ABSENCE: &str = "This day already has an absence";
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
/// without an identity cannot compile.
fn current_user(sessions: &State<'_, Sessions>, session_id: &SessionId) -> AppResult<i64> {
    sessions
        .user_id(session_id)?
        .ok_or_else(AppError::not_signed_in)
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
        let session_id = sessions.start(user.id)?;
        Ok(SignedIn { user, session_id })
    })
}

#[tauri::command]
pub fn login(
    database: State<'_, Database>,
    sessions: State<'_, Sessions>,
    mut credentials: Credentials,
) -> AppResult<SignedIn> {
    logging::logged("login", || {
        let attempts = LoginAttempts::new(database.0.as_ref());
        credentials
            .validate()
            .map_err(|_| AppError::validation(INVALID_CREDENTIALS))?;
        attempts.check(&credentials.email)?;
        let record = database.0.read_password_hash(&credentials.email)?;
        let user = match verify_credentials(record, &credentials.password) {
            Some(user) => user,
            None => {
                attempts.record_failure(&credentials.email)?;
                return Err(AppError::validation(INVALID_CREDENTIALS));
            }
        };
        let user = database
            .0
            .read_user(user)?
            .ok_or_else(|| AppError::validation(INVALID_CREDENTIALS))?;
        attempts.record_success(&credentials.email)?;
        let session_id = sessions.start(user.id)?;
        Ok(SignedIn { user, session_id })
    })
}

#[tauri::command]
pub fn logout(sessions: State<'_, Sessions>, session_id: String) -> AppResult<()> {
    logging::logged("logout", || sessions.end(&SessionId::from(session_id)))
}

#[tauri::command]
pub fn current_session(
    database: State<'_, Database>,
    sessions: State<'_, Sessions>,
    session_id: String,
) -> AppResult<Option<User>> {
    logging::logged("current_session", || {
        let Some(user_id) = sessions.user_id(&SessionId::from(session_id))? else {
            return Ok(None);
        };
        Ok(database.0.read_user(user_id)?)
    })
}

#[tauri::command]
pub fn list_projects(
    database: State<'_, Database>,
    sessions: State<'_, Sessions>,
    session_id: String,
) -> AppResult<Vec<Project>> {
    logging::logged("list_projects", || {
        let user_id = current_user(&sessions, &SessionId::from(session_id))?;
        Ok(database.0.list_projects(user_id)?)
    })
}

#[tauri::command]
pub fn create_project(
    database: State<'_, Database>,
    sessions: State<'_, Sessions>,
    session_id: String,
    mut input: SaveProject,
) -> AppResult<Project> {
    logging::logged("create_project", || {
        input.validate()?;
        let user_id = current_user(&sessions, &SessionId::from(session_id))?;
        Ok(database.0.insert_project(user_id, &input)?)
    })
}

#[tauri::command]
pub fn update_project(
    database: State<'_, Database>,
    sessions: State<'_, Sessions>,
    session_id: String,
    id: i64,
    mut input: SaveProject,
) -> AppResult<Project> {
    logging::logged("update_project", || {
        input.validate()?;
        let user_id = current_user(&sessions, &SessionId::from(session_id))?;
        Ok(database.0.update_project(id, user_id, &input)?)
    })
}

#[tauri::command]
pub fn delete_project(
    database: State<'_, Database>,
    sessions: State<'_, Sessions>,
    session_id: String,
    id: i64,
) -> AppResult<()> {
    logging::logged("delete_project", || {
        let user_id = current_user(&sessions, &SessionId::from(session_id))?;
        Ok(database.0.delete_project(id, user_id)?)
    })
}

#[tauri::command]
pub fn list_time_entries(
    database: State<'_, Database>,
    sessions: State<'_, Sessions>,
    session_id: String,
) -> AppResult<Vec<TimeEntry>> {
    logging::logged("list_time_entries", || {
        let user_id = current_user(&sessions, &SessionId::from(session_id))?;
        Ok(database.0.list_time_entries(user_id)?)
    })
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

#[tauri::command]
pub fn create_time_entry(
    database: State<'_, Database>,
    sessions: State<'_, Sessions>,
    session_id: String,
    mut input: SaveTimeEntry,
) -> AppResult<TimeEntry> {
    logging::logged("create_time_entry", || {
        input.validate()?;
        if input.project_id.is_none() && !input.is_break() {
            return Err(AppError::validation("Project is required"));
        }
        let user_id = current_user(&sessions, &SessionId::from(session_id))?;
        database
            .0
            .create_time_entry(user_id, &input)
            .map_err(map_time_entry_write_error)
    })
}

#[tauri::command]
pub fn update_time_entry(
    database: State<'_, Database>,
    sessions: State<'_, Sessions>,
    session_id: String,
    id: i64,
    mut input: SaveTimeEntry,
) -> AppResult<TimeEntry> {
    logging::logged("update_time_entry", || {
        input.validate()?;
        let user_id = current_user(&sessions, &SessionId::from(session_id))?;
        database
            .0
            .update_time_entry(id, user_id, &input)
            .map_err(map_time_entry_write_error)
    })
}

#[tauri::command]
pub fn update_time_entry_note(
    database: State<'_, Database>,
    sessions: State<'_, Sessions>,
    session_id: String,
    id: i64,
    note: Option<String>,
) -> AppResult<TimeEntry> {
    logging::logged("update_time_entry_note", || {
        let note = note
            .map(|text| text.trim().to_owned())
            .filter(|text| !text.is_empty());
        if note.as_ref().is_some_and(|note| note.chars().count() > 500) {
            return Err(AppError::validation("invalid note"));
        }
        let user_id = current_user(&sessions, &SessionId::from(session_id))?;
        Ok(database
            .0
            .update_time_entry_note(id, user_id, note.as_deref())?)
    })
}

#[tauri::command]
pub fn switch_running_time_entry(
    database: State<'_, Database>,
    sessions: State<'_, Sessions>,
    session_id: String,
    id: i64,
    mut input: SaveTimeEntry,
) -> AppResult<TimeEntry> {
    logging::logged("switch_running_time_entry", || {
        input.validate()?;
        if input.project_id.is_none() || input.end_time.is_some() {
            return Err(AppError::validation("invalid timer switch"));
        }
        let user_id = current_user(&sessions, &SessionId::from(session_id))?;
        database
            .0
            .switch_running_time_entry(id, user_id, &input)
            .map_err(|error| match error {
                SwitchEntryError::InvalidTimer => AppError::validation("invalid timer switch"),
                SwitchEntryError::Overlap => AppError::conflict(OVERLAP),
                SwitchEntryError::Store(error) => AppError::from(error),
            })
    })
}

#[tauri::command]
pub fn delete_time_entry(
    database: State<'_, Database>,
    sessions: State<'_, Sessions>,
    session_id: String,
    id: i64,
) -> AppResult<()> {
    logging::logged("delete_time_entry", || {
        let user_id = current_user(&sessions, &SessionId::from(session_id))?;
        Ok(database.0.delete_time_entry(id, user_id)?)
    })
}

/// The audit trail is read only, it has no command that changes or removes it.
#[tauri::command]
pub fn list_time_entry_audits(
    database: State<'_, Database>,
    sessions: State<'_, Sessions>,
    session_id: String,
) -> AppResult<Vec<TimeEntryAudit>> {
    logging::logged("list_time_entry_audits", || {
        let user_id = current_user(&sessions, &SessionId::from(session_id))?;
        Ok(database.0.list_time_entry_audits(user_id)?)
    })
}

#[tauri::command]
pub fn list_audit_log(
    database: State<'_, Database>,
    sessions: State<'_, Sessions>,
    session_id: String,
) -> AppResult<Vec<AuditLogEntry>> {
    logging::logged("list_audit_log", || {
        let user_id = current_user(&sessions, &SessionId::from(session_id))?;
        Ok(database.0.list_audit_log(user_id)?)
    })
}

#[tauri::command]
pub fn list_project_budgets(
    database: State<'_, Database>,
    sessions: State<'_, Sessions>,
    session_id: String,
) -> AppResult<Vec<ProjectBudget>> {
    logging::logged("list_project_budgets", || {
        let user_id = current_user(&sessions, &SessionId::from(session_id))?;
        Ok(database.0.list_project_budgets(user_id)?)
    })
}

#[tauri::command]
pub fn create_project_budget(
    database: State<'_, Database>,
    sessions: State<'_, Sessions>,
    session_id: String,
    mut input: SaveProjectBudget,
) -> AppResult<ProjectBudget> {
    logging::logged("create_project_budget", || {
        input.validate()?;
        let user_id = current_user(&sessions, &SessionId::from(session_id))?;
        database
            .0
            .insert_project_budget(user_id, &input)
            .map_err(unique_error(DUPLICATE_BUDGET))
    })
}

#[tauri::command]
pub fn update_project_budget(
    database: State<'_, Database>,
    sessions: State<'_, Sessions>,
    session_id: String,
    id: i64,
    mut input: SaveProjectBudget,
) -> AppResult<ProjectBudget> {
    logging::logged("update_project_budget", || {
        input.validate()?;
        let user_id = current_user(&sessions, &SessionId::from(session_id))?;
        database
            .0
            .update_project_budget(id, user_id, &input)
            .map_err(unique_error(DUPLICATE_BUDGET))
    })
}

#[tauri::command]
pub fn delete_project_budget(
    database: State<'_, Database>,
    sessions: State<'_, Sessions>,
    session_id: String,
    id: i64,
) -> AppResult<()> {
    logging::logged("delete_project_budget", || {
        let user_id = current_user(&sessions, &SessionId::from(session_id))?;
        Ok(database.0.delete_project_budget(id, user_id)?)
    })
}

#[tauri::command]
pub fn list_absences(
    database: State<'_, Database>,
    sessions: State<'_, Sessions>,
    session_id: String,
) -> AppResult<Vec<Absence>> {
    logging::logged("list_absences", || {
        let user_id = current_user(&sessions, &SessionId::from(session_id))?;
        Ok(database.0.list_absences(user_id)?)
    })
}

#[tauri::command]
pub fn create_absence(
    database: State<'_, Database>,
    sessions: State<'_, Sessions>,
    session_id: String,
    mut input: SaveAbsence,
) -> AppResult<Absence> {
    logging::logged("create_absence", || {
        input.validate()?;
        let user_id = current_user(&sessions, &SessionId::from(session_id))?;
        database
            .0
            .insert_absence(user_id, &input)
            .map_err(unique_error(DUPLICATE_ABSENCE))
    })
}

#[tauri::command]
pub fn update_absence(
    database: State<'_, Database>,
    sessions: State<'_, Sessions>,
    session_id: String,
    id: i64,
    mut input: SaveAbsence,
) -> AppResult<Absence> {
    logging::logged("update_absence", || {
        input.validate()?;
        let user_id = current_user(&sessions, &SessionId::from(session_id))?;
        database
            .0
            .update_absence(id, user_id, &input)
            .map_err(unique_error(DUPLICATE_ABSENCE))
    })
}

#[tauri::command]
pub fn save_absences(
    database: State<'_, Database>,
    sessions: State<'_, Sessions>,
    session_id: String,
    mut inputs: Vec<SaveAbsence>,
    replacement_ids: Vec<i64>,
    update_id: Option<i64>,
) -> AppResult<Vec<Absence>> {
    logging::logged("save_absences", || {
        if inputs.is_empty()
            || inputs.iter_mut().any(|input| input.validate().is_err())
            || inputs
                .iter()
                .map(|input| &input.date)
                .collect::<std::collections::HashSet<_>>()
                .len()
                != inputs.len()
        {
            return Err(AppError::validation("invalid absence range"));
        }
        let user_id = current_user(&sessions, &SessionId::from(session_id))?;
        database
            .0
            .save_absences(user_id, &inputs, &replacement_ids, update_id)
            .map_err(unique_error(DUPLICATE_ABSENCE))
    })
}

#[tauri::command]
pub fn delete_absence(
    database: State<'_, Database>,
    sessions: State<'_, Sessions>,
    session_id: String,
    id: i64,
) -> AppResult<()> {
    logging::logged("delete_absence", || {
        let user_id = current_user(&sessions, &SessionId::from(session_id))?;
        Ok(database.0.delete_absence(id, user_id)?)
    })
}

#[tauri::command]
pub fn list_absence_audits(
    database: State<'_, Database>,
    sessions: State<'_, Sessions>,
    session_id: String,
) -> AppResult<Vec<AbsenceAudit>> {
    logging::logged("list_absence_audits", || {
        let user_id = current_user(&sessions, &SessionId::from(session_id))?;
        Ok(database.0.list_absence_audits(user_id)?)
    })
}

#[tauri::command]
pub fn get_work_settings(
    database: State<'_, Database>,
    sessions: State<'_, Sessions>,
    session_id: String,
) -> AppResult<WorkSettings> {
    logging::logged("get_work_settings", || {
        let user_id = current_user(&sessions, &SessionId::from(session_id))?;
        Ok(database.0.read_settings(user_id)?)
    })
}

#[tauri::command]
pub fn update_work_settings(
    database: State<'_, Database>,
    sessions: State<'_, Sessions>,
    session_id: String,
    mut settings: WorkSettings,
) -> AppResult<WorkSettings> {
    logging::logged("update_work_settings", || {
        settings.validate()?;
        let user_id = current_user(&sessions, &SessionId::from(session_id))?;
        Ok(database.0.write_settings(user_id, &settings)?)
    })
}

#[tauri::command]
pub fn get_app_version(database: State<'_, Database>) -> AppResult<Option<String>> {
    logging::logged("get_app_version", || Ok(database.0.read_app_version()?))
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

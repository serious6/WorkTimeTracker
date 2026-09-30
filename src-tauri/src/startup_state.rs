//! The outcome of the application startup, kept so the window can show it.
//!
//! A failing database or configuration no longer ends the process before a
//! window exists: the setup records the failure here, the window opens and the
//! user interface renders it in the look and feel of the application. The
//! stored message is the same redacted text the startup dialog would have
//! shown, so no credential, hash, e-mail address or token reaches the window.

use std::error::Error;
use std::sync::{Arc, Condvar, Mutex, MutexGuard, PoisonError};
use std::thread::JoinHandle;

use crate::config::DbConfig;
use crate::store::Database;

/// What the user interface asks for while it boots.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum StartupStatus {
    Ready,
    Failed { message: String },
}

/// The startup outcome while the start is still running: the database is opened
/// on a background thread, so `None` means "not settled yet".
struct Outcome {
    status: Mutex<Option<StartupStatus>>,
    settled: Condvar,
}

/// The startup outcome in Tauri managed state, shared with the thread that
/// opens the database. It is written once by that thread and again by every
/// retry, so the mutex is never contended for long.
#[derive(Clone)]
pub struct StartupState(Arc<Outcome>);

impl Default for StartupState {
    fn default() -> Self {
        Self(Arc::new(Outcome {
            status: Mutex::new(Some(StartupStatus::Ready)),
            settled: Condvar::new(),
        }))
    }
}

impl StartupState {
    /// A start whose outcome is still open. [`status`](Self::status) waits for
    /// it, so the window keeps showing its loading page instead of a state the
    /// backend has not decided yet.
    pub fn starting() -> Self {
        let state = Self::default();
        *state.lock() = None;
        state
    }

    /// The outcome of the start, waited for while it is still running. Only
    /// callers off the main thread may block here; the commands do so on a
    /// blocking task, so the event loop keeps painting the window.
    pub fn status(&self) -> StartupStatus {
        let mut status = self.lock();
        while status.is_none() {
            status = self
                .0
                .settled
                .wait(status)
                .unwrap_or_else(PoisonError::into_inner);
        }
        status.clone().unwrap_or(StartupStatus::Ready)
    }

    /// Records a failure of the startup. The message is redacted like a log
    /// line and names the log file once the logger writes one.
    pub fn record_failure(&self, error: &dyn Error) {
        let (_, message) = crate::startup_failure::format_startup_failure(
            error,
            crate::logging::file_path().as_deref(),
        );
        self.settle(StartupStatus::Failed { message });
    }

    pub fn mark_ready(&self) {
        self.settle(StartupStatus::Ready);
    }

    fn settle(&self, status: StartupStatus) {
        *self.lock() = Some(status);
        self.0.settled.notify_all();
    }

    fn lock(&self) -> MutexGuard<'_, Option<StartupStatus>> {
        self.0.status.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

/// Opens the database on a background thread and records the outcome, `ready`
/// first taking the open database into the managed state of the application.
///
/// The Tauri setup hook runs on the main thread before the event loop starts,
/// so a database that answers slowly — or not at all — would hold back the
/// first frame of the window. Opening it beside the setup keeps the boot budget
/// of `boot::BUDGET` independent of the database, and the window shows its
/// loading page until this thread settles the state.
pub fn open_in_background<T: Send + 'static>(
    startup: &StartupState,
    open: impl FnOnce() -> Result<T, Box<dyn Error>> + Send + 'static,
    ready: impl FnOnce(T) + Send + 'static,
) -> JoinHandle<()> {
    let startup = startup.clone();
    std::thread::spawn(move || {
        // A panic of this thread must not leave the window waiting forever, so
        // it settles the state like any other failed start.
        let opened = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let value = open()?;
            ready(value);
            Ok::<(), Box<dyn Error>>(())
        }));
        match opened {
            Ok(Ok(())) => startup.mark_ready(),
            Ok(Err(error)) => {
                log_failure(error.as_ref());
                startup.record_failure(error.as_ref());
            }
            Err(payload) => {
                let error = crate::startup_panic_error(payload.as_ref());
                log_failure(&error);
                startup.record_failure(&error);
            }
        }
    })
}

/// Resolves the settings and opens the configured database. Shared by the
/// setup and by the retry of a failed start, so both report the same failures.
pub fn open_database() -> Result<Database, Box<dyn Error>> {
    let settings = crate::portable::settings()?;
    let config = DbConfig::resolve(&settings)?;
    Ok(Database::open(&config)?)
}

/// Logs a startup failure under one source before it reaches the window.
pub fn log_failure(error: &dyn Error) {
    crate::logging::error("setup", &format!("database: {error}"));
}

#[cfg(test)]
mod tests {
    use std::sync::mpsc;
    use std::time::Duration;

    use super::*;
    use crate::config::ConfigError;
    use crate::store::OpenError;

    /// How long a test waits for the background start before it fails. Long
    /// enough that a loaded machine does not turn a correct run into a failure.
    const WAIT: Duration = Duration::from_secs(5);

    #[test]
    fn starts_ready() {
        assert_eq!(StartupState::default().status(), StartupStatus::Ready);
    }

    #[test]
    fn records_a_failure_with_its_message() {
        let state = StartupState::default();

        state.record_failure(&ConfigError::MissingDatabaseUrl);

        let StartupStatus::Failed { message } = state.status() else {
            panic!("the failure has to be recorded");
        };
        assert!(message.contains("DATABASE_URL"));
    }

    #[test]
    fn redacts_credentials_of_a_recorded_failure() {
        let password = "top-secret-password";
        let state = StartupState::default();

        state.record_failure(&OpenError(format!(
            "postgres: could not connect to postgresql://user:{password}@localhost/work"
        )));

        let StartupStatus::Failed { message } = state.status() else {
            panic!("the failure has to be recorded");
        };
        assert!(!message.contains(password), "{message}");
        assert!(message.contains("could not connect"), "{message}");
    }

    #[test]
    fn a_successful_retry_returns_to_ready() {
        let state = StartupState::default();
        state.record_failure(&ConfigError::MissingDatabaseUrl);

        state.mark_ready();

        assert_eq!(state.status(), StartupStatus::Ready);
    }

    #[test]
    fn serializes_the_status_for_the_user_interface() {
        assert_eq!(
            serde_json::to_string(&StartupStatus::Ready).unwrap_or_default(),
            r#"{"status":"ready"}"#
        );
        assert_eq!(
            serde_json::to_string(&StartupStatus::Failed {
                message: "no database".to_owned()
            })
            .unwrap_or_default(),
            r#"{"status":"failed","message":"no database"}"#
        );
    }

    /// The guard of the boot budget: the setup must not wait for the database.
    /// The opener here never finishes on its own, so the call can only return
    /// while the database is still being opened.
    #[test]
    fn opening_the_database_does_not_hold_up_the_setup() {
        let state = StartupState::starting();
        let (release, blocked) = mpsc::channel::<()>();
        let (opened, opening) = mpsc::channel::<()>();

        let thread = open_in_background(
            &state,
            move || {
                opened.send(()).expect("the test waits for the open");
                blocked.recv().expect("the test releases the open");
                Ok(())
            },
            |()| {},
        );

        opening.recv_timeout(WAIT).expect("the open has started");
        release.send(()).expect("the open is still waiting");
        thread.join().expect("the background start finishes");
        assert_eq!(state.status(), StartupStatus::Ready);
    }

    #[test]
    fn manages_the_database_before_the_start_reads_as_ready() {
        let state = StartupState::starting();
        let (managed, handed_over) = mpsc::channel::<&str>();

        let thread = open_in_background(
            &state,
            || Ok("database"),
            move |database| managed.send(database).expect("the test reads the database"),
        );
        thread.join().expect("the background start finishes");

        assert_eq!(handed_over.try_recv(), Ok("database"));
        assert_eq!(state.status(), StartupStatus::Ready);
    }

    #[test]
    fn waits_for_the_outcome_of_a_running_start() {
        let state = StartupState::starting();
        let (release, blocked) = mpsc::channel::<()>();

        let thread = open_in_background(
            &state,
            move || {
                blocked.recv().expect("the test releases the open");
                Err::<(), _>(Box::new(ConfigError::MissingDatabaseUrl) as Box<dyn Error>)
            },
            |()| {},
        );
        let waiting = std::thread::spawn({
            let state = state.clone();
            move || state.status()
        });
        release.send(()).expect("the open is still waiting");
        thread.join().expect("the background start finishes");

        let StartupStatus::Failed { message } = waiting.join().expect("the waiter returns") else {
            panic!("the waiter has to see the failure of the start");
        };
        assert!(message.contains("DATABASE_URL"), "{message}");
    }

    /// A panicking start must settle the state as well, otherwise the window
    /// would wait for an outcome that never comes.
    #[test]
    fn reports_a_panicking_start_as_a_failure() {
        let state = StartupState::starting();

        let thread = open_in_background(
            &state,
            || -> Result<(), Box<dyn Error>> { panic!("the connection pool gave up") },
            |()| {},
        );
        let _ = thread.join();

        let StartupStatus::Failed { message } = state.status() else {
            panic!("a panicking start has to be recorded as a failure");
        };
        assert!(message.contains("gave up"), "{message}");
    }

    #[test]
    fn reports_a_panicking_handoff_as_a_failure() {
        let state = StartupState::starting();
        let (settled, outcome) = mpsc::channel();
        let waiter = std::thread::spawn({
            let state = state.clone();
            move || settled.send(state.status())
        });

        let thread = open_in_background(
            &state,
            || Ok(()),
            |()| panic!("the database handoff gave up"),
        );
        thread.join().expect("the handoff panic is caught");

        let StartupStatus::Failed { message } = outcome
            .recv_timeout(WAIT)
            .expect("a handoff panic must wake the waiting status call")
        else {
            panic!("a panicking handoff has to be recorded as a failure");
        };
        waiter
            .join()
            .expect("the waiter returns")
            .expect("received");
        assert!(message.contains("handoff gave up"), "{message}");
    }
}

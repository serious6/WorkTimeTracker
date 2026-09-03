//! Applies the schema migrations to the configured database.
//!
//! A deployed database is shared by every installation, so the application
//! itself only verifies that the migrations are applied. Applying them is this
//! separate step, run with the environment of the target database and
//! `WORK_TIME_TRACKER_DB_MIGRATE=true`:
//!
//! ```sh
//! cargo run --manifest-path src-tauri/Cargo.toml --example migrate
//! ```
//!
//! It prints no connection details, so it is safe to run in a workflow log.

fn main() -> std::process::ExitCode {
    match work_time_tracker_lib::migrate() {
        Ok(()) => {
            println!("the database is migrated");
            std::process::ExitCode::SUCCESS
        }
        Err(error) => {
            eprintln!("the database could not be migrated: {error}");
            std::process::ExitCode::FAILURE
        }
    }
}

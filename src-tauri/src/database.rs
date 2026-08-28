use std::{path::Path, sync::Mutex};

use rusqlite::{params, Connection, OptionalExtension, Result, Row};
use rusqlite_migration::{Migrations, M};

use crate::models::{
    Project, ProjectBudget, SaveProject, SaveProjectBudget, SaveTimeEntry, TimeEntry, User,
    WorkSettings, DEFAULT_WORKING_DAYS,
};

const OPEN_END: &str = "9999-12-31T23:59:59.999Z";
const APP_VERSION_KEY: &str = "app_version";

/// Version of the released application, taken from `Cargo.toml` at build time.
pub const APP_VERSION: &str = env!("CARGO_PKG_VERSION");

pub struct Database(pub Mutex<Connection>);

fn migrations() -> Migrations<'static> {
    Migrations::new(vec![
        M::up(include_str!("../../drizzle/0000_create_time_entries.sql")),
        M::up(include_str!("../../drizzle/0000_create_schema.sql")),
        M::up(include_str!(
            "../../drizzle/0001_create_project_budgets.sql"
        )),
        M::up(include_str!("../../drizzle/0002_create_app_metadata.sql")),
        M::up(include_str!(
            "../../drizzle/0002_work_settings_working_days.sql"
        )),
        M::up(include_str!("../../drizzle/0003_create_users.sql")),
    ])
}

impl Database {
    pub fn open(path: impl AsRef<Path>) -> std::result::Result<Self, Box<dyn std::error::Error>> {
        let mut connection = Connection::open(path)?;
        connection.pragma_update(None, "foreign_keys", "ON")?;
        migrate(&mut connection)?;
        write_app_version(&connection, APP_VERSION)?;
        Ok(Self(Mutex::new(connection)))
    }
}

pub fn migrate(connection: &mut Connection) -> rusqlite_migration::Result<()> {
    migrations().to_latest(connection)
}

fn project_from_row(row: &Row<'_>) -> Result<Project> {
    Ok(Project {
        id: row.get(0)?,
        name: row.get(1)?,
        description: row.get(2)?,
        color: row.get(3)?,
        active: row.get(4)?,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
    })
}

fn entry_from_row(row: &Row<'_>) -> Result<TimeEntry> {
    Ok(TimeEntry {
        id: row.get(0)?,
        project_id: row.get(1)?,
        start_time: row.get(2)?,
        end_time: row.get(3)?,
        note: row.get(4)?,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
    })
}

/// Guards against writing a record that points at a project of another user.
fn assert_owns_project(
    connection: &Connection,
    user_id: i64,
    project_id: Option<i64>,
) -> Result<()> {
    let Some(project_id) = project_id else {
        return Ok(());
    };
    let owned: bool = connection.query_row(
        "SELECT EXISTS (SELECT 1 FROM projects WHERE id = ?1 AND user_id = ?2)",
        [project_id, user_id],
        |row| row.get(0),
    )?;
    if owned {
        Ok(())
    } else {
        Err(rusqlite::Error::QueryReturnedNoRows)
    }
}

const PROJECT_COLUMNS: &str = "id, name, description, color, active, created_at, updated_at";
const ENTRY_COLUMNS: &str = "id, project_id, start_time, end_time, note, created_at, updated_at";

pub fn list_projects(connection: &Connection, user_id: i64) -> Result<Vec<Project>> {
    let mut statement = connection.prepare(&format!(
        "SELECT {PROJECT_COLUMNS} FROM projects WHERE user_id = ?1 ORDER BY name"
    ))?;
    let projects = statement.query_map([user_id], project_from_row)?;
    projects.collect()
}

fn read_project(connection: &Connection, id: i64, user_id: i64) -> Result<Project> {
    connection.query_row(
        &format!("SELECT {PROJECT_COLUMNS} FROM projects WHERE id = ?1 AND user_id = ?2"),
        [id, user_id],
        project_from_row,
    )
}

pub fn insert_project(
    connection: &Connection,
    user_id: i64,
    input: &SaveProject,
) -> Result<Project> {
    connection.execute(
        "INSERT INTO projects (user_id, name, description, color, active, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
        params![
            user_id,
            input.name,
            input.description,
            input.color,
            input.active
        ],
    )?;
    read_project(connection, connection.last_insert_rowid(), user_id)
}

pub fn update_project(
    connection: &Connection,
    id: i64,
    user_id: i64,
    input: &SaveProject,
) -> Result<Project> {
    connection.execute(
        "UPDATE projects
     SET name = ?3, description = ?4, color = ?5, active = ?6,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE id = ?1 AND user_id = ?2",
        params![
            id,
            user_id,
            input.name,
            input.description,
            input.color,
            input.active
        ],
    )?;
    read_project(connection, id, user_id)
}

pub fn delete_project(connection: &Connection, id: i64, user_id: i64) -> Result<()> {
    connection.execute(
        "DELETE FROM projects WHERE id = ?1 AND user_id = ?2",
        [id, user_id],
    )?;
    Ok(())
}

pub fn list_time_entries(connection: &Connection, user_id: i64) -> Result<Vec<TimeEntry>> {
    let mut statement = connection.prepare(&format!(
        "SELECT {ENTRY_COLUMNS} FROM time_entries WHERE user_id = ?1 ORDER BY start_time"
    ))?;
    let entries = statement.query_map([user_id], entry_from_row)?;
    entries.collect()
}

fn read_entry(connection: &Connection, id: i64, user_id: i64) -> Result<TimeEntry> {
    connection.query_row(
        &format!("SELECT {ENTRY_COLUMNS} FROM time_entries WHERE id = ?1 AND user_id = ?2"),
        [id, user_id],
        entry_from_row,
    )
}

pub fn overlaps(
    connection: &Connection,
    user_id: i64,
    start_time: &str,
    end_time: Option<&str>,
    exclude_id: Option<i64>,
) -> Result<bool> {
    connection.query_row(
        "SELECT EXISTS (
       SELECT 1 FROM time_entries
       WHERE user_id = ?5
         AND (?3 IS NULL OR id <> ?3)
         AND start_time < ?2
         AND COALESCE(end_time, ?4) > ?1
     )",
        params![
            start_time,
            end_time.unwrap_or(OPEN_END),
            exclude_id,
            OPEN_END,
            user_id
        ],
        |row| row.get(0),
    )
}

pub fn insert_time_entry(
    connection: &Connection,
    user_id: i64,
    input: &SaveTimeEntry,
) -> Result<TimeEntry> {
    assert_owns_project(connection, user_id, input.project_id)?;
    connection.execute(
        "INSERT INTO time_entries (user_id, project_id, start_time, end_time, note, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
        params![
            user_id,
            input.project_id,
            input.start_time,
            input.end_time,
            input.note
        ],
    )?;
    read_entry(connection, connection.last_insert_rowid(), user_id)
}

pub fn update_time_entry(
    connection: &Connection,
    id: i64,
    user_id: i64,
    input: &SaveTimeEntry,
) -> Result<TimeEntry> {
    assert_owns_project(connection, user_id, input.project_id)?;
    connection.execute(
        "UPDATE time_entries
     SET project_id = ?3, start_time = ?4, end_time = ?5, note = ?6,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE id = ?1 AND user_id = ?2",
        params![
            id,
            user_id,
            input.project_id,
            input.start_time,
            input.end_time,
            input.note
        ],
    )?;
    read_entry(connection, id, user_id)
}

pub fn update_time_entry_note(
    connection: &Connection,
    id: i64,
    user_id: i64,
    note: Option<&str>,
) -> Result<TimeEntry> {
    connection.execute(
        "UPDATE time_entries
     SET note = ?3, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE id = ?1 AND user_id = ?2",
        params![id, user_id, note],
    )?;
    read_entry(connection, id, user_id)
}

pub fn switch_running_time_entry(
    connection: &Connection,
    id: i64,
    user_id: i64,
    input: &SaveTimeEntry,
) -> Result<TimeEntry> {
    let transaction = connection.unchecked_transaction()?;
    let current = read_entry(&transaction, id, user_id)?;
    if current.end_time.is_some()
        || input.project_id.is_none()
        || input.end_time.is_some()
        || input.start_time <= current.start_time
    {
        return Err(rusqlite::Error::InvalidQuery);
    }

    transaction.execute(
        "UPDATE time_entries
     SET end_time = ?3, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE id = ?1 AND user_id = ?2",
        params![id, user_id, input.start_time],
    )?;
    if overlaps(
        &transaction,
        user_id,
        &input.start_time,
        input.end_time.as_deref(),
        None,
    )? {
        return Err(rusqlite::Error::InvalidQuery);
    }
    let created = insert_time_entry(&transaction, user_id, input)?;
    transaction.commit()?;
    Ok(created)
}

pub fn delete_time_entry(connection: &Connection, id: i64, user_id: i64) -> Result<()> {
    connection.execute(
        "DELETE FROM time_entries WHERE id = ?1 AND user_id = ?2",
        [id, user_id],
    )?;
    Ok(())
}

const BUDGET_COLUMNS: &str = "id, project_id, budget_minutes, due_date, created_at, updated_at";

fn budget_from_row(row: &Row<'_>) -> Result<ProjectBudget> {
    Ok(ProjectBudget {
        id: row.get(0)?,
        project_id: row.get(1)?,
        budget_minutes: row.get(2)?,
        due_date: row.get(3)?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
    })
}

pub fn list_project_budgets(connection: &Connection, user_id: i64) -> Result<Vec<ProjectBudget>> {
    let mut statement = connection.prepare(&format!(
        "SELECT {BUDGET_COLUMNS} FROM project_budgets WHERE user_id = ?1 ORDER BY due_date"
    ))?;
    let budgets = statement.query_map([user_id], budget_from_row)?;
    budgets.collect()
}

fn read_budget(connection: &Connection, id: i64, user_id: i64) -> Result<ProjectBudget> {
    connection.query_row(
        &format!("SELECT {BUDGET_COLUMNS} FROM project_budgets WHERE id = ?1 AND user_id = ?2"),
        [id, user_id],
        budget_from_row,
    )
}

pub fn insert_project_budget(
    connection: &Connection,
    user_id: i64,
    input: &SaveProjectBudget,
) -> Result<ProjectBudget> {
    assert_owns_project(connection, user_id, Some(input.project_id))?;
    connection.execute(
        "INSERT INTO project_budgets (user_id, project_id, budget_minutes, due_date, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
        params![
            user_id,
            input.project_id,
            input.budget_minutes,
            input.due_date
        ],
    )?;
    read_budget(connection, connection.last_insert_rowid(), user_id)
}

pub fn update_project_budget(
    connection: &Connection,
    id: i64,
    user_id: i64,
    input: &SaveProjectBudget,
) -> Result<ProjectBudget> {
    assert_owns_project(connection, user_id, Some(input.project_id))?;
    connection.execute(
        "UPDATE project_budgets
     SET project_id = ?3, budget_minutes = ?4, due_date = ?5,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE id = ?1 AND user_id = ?2",
        params![
            id,
            user_id,
            input.project_id,
            input.budget_minutes,
            input.due_date
        ],
    )?;
    read_budget(connection, id, user_id)
}

pub fn delete_project_budget(connection: &Connection, id: i64, user_id: i64) -> Result<()> {
    connection.execute(
        "DELETE FROM project_budgets WHERE id = ?1 AND user_id = ?2",
        [id, user_id],
    )?;
    Ok(())
}

fn default_working_days() -> Vec<String> {
    DEFAULT_WORKING_DAYS
        .iter()
        .map(|day| (*day).to_owned())
        .collect()
}

fn working_days_from_text(value: &str) -> Vec<String> {
    value
        .split(',')
        .map(str::trim)
        .filter(|day| !day.is_empty())
        .map(str::to_owned)
        .collect()
}

pub fn read_settings(connection: &Connection, user_id: i64) -> Result<WorkSettings> {
    let settings = connection
        .query_row(
            "SELECT weekly_target_minutes, working_days, week_starts_on
       FROM work_settings WHERE user_id = ?1",
            [user_id],
            |row| {
                let working_days = working_days_from_text(&row.get::<_, String>(1)?);
                Ok(WorkSettings {
                    weekly_target_minutes: row.get(0)?,
                    working_days: if working_days.is_empty() {
                        default_working_days()
                    } else {
                        working_days
                    },
                    week_starts_on: row.get(2)?,
                })
            },
        )
        .optional()?;
    Ok(settings.unwrap_or_else(|| WorkSettings {
        weekly_target_minutes: 2_400,
        working_days: default_working_days(),
        week_starts_on: "monday".into(),
    }))
}

pub fn write_settings(
    connection: &Connection,
    user_id: i64,
    settings: &WorkSettings,
) -> Result<WorkSettings> {
    connection.execute(
        "INSERT INTO work_settings (user_id, weekly_target_minutes, working_days, week_starts_on)
     VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT (user_id) DO UPDATE
     SET weekly_target_minutes = ?2, working_days = ?3, week_starts_on = ?4",
        params![
            user_id,
            settings.weekly_target_minutes,
            settings.working_days.join(","),
            settings.week_starts_on
        ],
    )?;
    read_settings(connection, user_id)
}

/// Stores the released version so the UI can report it without hardcoding.
pub fn write_app_version(connection: &Connection, version: &str) -> Result<String> {
    connection.execute(
        "INSERT INTO app_metadata (key, value) VALUES (?1, ?2)
     ON CONFLICT (key) DO UPDATE SET value = ?2 WHERE value <> ?2",
        params![APP_VERSION_KEY, version],
    )?;
    Ok(version.to_owned())
}

pub fn read_app_version(connection: &Connection) -> Result<Option<String>> {
    connection
        .query_row(
            "SELECT value FROM app_metadata WHERE key = ?1",
            [APP_VERSION_KEY],
            |row| row.get(0),
        )
        .optional()
}

const USER_COLUMNS: &str = "id, email, created_at";

fn user_from_row(row: &Row<'_>) -> Result<User> {
    Ok(User {
        id: row.get(0)?,
        email: row.get(1)?,
        created_at: row.get(2)?,
    })
}

pub fn read_user(connection: &Connection, id: i64) -> Result<Option<User>> {
    connection
        .query_row(
            &format!("SELECT {USER_COLUMNS} FROM users WHERE id = ?1"),
            [id],
            user_from_row,
        )
        .optional()
}

/// Returns the stored password hash of the user with the given email.
pub fn read_password_hash(connection: &Connection, email: &str) -> Result<Option<(i64, String)>> {
    connection
        .query_row(
            "SELECT id, password_hash FROM users WHERE email = ?1",
            [email],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
}

pub fn count_users(connection: &Connection) -> Result<i64> {
    connection.query_row("SELECT COUNT(*) FROM users", [], |row| row.get(0))
}

/// Creates a user. Fails with a unique constraint violation for a known email.
pub fn insert_user(connection: &Connection, email: &str, password_hash: &str) -> Result<User> {
    connection.execute(
        "INSERT INTO users (email, password_hash, created_at)
     VALUES (?1, ?2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
        params![email, password_hash],
    )?;
    let id = connection.last_insert_rowid();
    read_user(connection, id)?.ok_or(rusqlite::Error::QueryReturnedNoRows)
}

/// Hands the data of the former single-user database to the first user.
pub fn claim_unowned_data(connection: &Connection, user_id: i64) -> Result<()> {
    for table in [
        "projects",
        "time_entries",
        "project_budgets",
        "work_settings",
    ] {
        connection.execute(
            &format!("UPDATE {table} SET user_id = ?1 WHERE user_id IS NULL"),
            [user_id],
        )?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    static NEXT_DATABASE_TEST_ID: std::sync::atomic::AtomicUsize =
        std::sync::atomic::AtomicUsize::new(0);

    fn open() -> Connection {
        let mut connection = Connection::open_in_memory().unwrap();
        connection
            .pragma_update(None, "foreign_keys", "ON")
            .unwrap();
        migrate(&mut connection).unwrap();
        connection
    }

    fn user(connection: &Connection, email: &str) -> i64 {
        insert_user(connection, email, "argon2-hash").unwrap().id
    }

    /// A migrated database with one registered user.
    fn connect() -> (Connection, i64) {
        let connection = open();
        let user_id = user(&connection, "first@example.com");
        (connection, user_id)
    }

    fn project(connection: &Connection, user_id: i64) -> Project {
        insert_project(
            connection,
            user_id,
            &SaveProject {
                name: "Website Redesign".into(),
                description: None,
                color: "#3b82f6".into(),
                active: true,
            },
        )
        .unwrap()
    }

    fn entry(project_id: i64, start_time: &str, end_time: Option<&str>) -> SaveTimeEntry {
        SaveTimeEntry {
            project_id: Some(project_id),
            start_time: start_time.into(),
            end_time: end_time.map(str::to_owned),
            note: None,
        }
    }

    #[test]
    fn validates_all_migrations() {
        migrations().validate().unwrap();
    }

    #[test]
    fn migrates_only_once() {
        let mut connection = open();
        migrate(&mut connection).unwrap();
        assert_eq!(
            connection.pragma_query_value(None, "user_version", |row| row.get::<_, i64>(0)),
            Ok(6)
        );
    }

    #[test]
    fn upgrades_from_the_previous_sample_schema() {
        let mut connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch(include_str!("../../drizzle/0000_create_time_entries.sql"))
            .unwrap();
        connection.pragma_update(None, "user_version", 1).unwrap();

        migrate(&mut connection).unwrap();

        assert_eq!(
            connection.pragma_query_value(None, "user_version", |row| row.get::<_, i64>(0)),
            Ok(6)
        );
        let user_id = user(&connection, "first@example.com");
        assert!(list_projects(&connection, user_id).unwrap().is_empty());
        assert!(list_time_entries(&connection, user_id).unwrap().is_empty());
        assert_eq!(
            read_settings(&connection, user_id)
                .unwrap()
                .weekly_target_minutes,
            2_400
        );
    }

    #[test]
    fn hands_data_of_the_former_single_user_database_to_the_first_user() {
        let mut connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch(include_str!("../../drizzle/0000_create_time_entries.sql"))
            .unwrap();
        connection
            .execute_batch(include_str!("../../drizzle/0000_create_schema.sql"))
            .unwrap();
        connection
            .execute_batch(include_str!(
                "../../drizzle/0001_create_project_budgets.sql"
            ))
            .unwrap();
        connection
            .execute_batch(include_str!("../../drizzle/0002_create_app_metadata.sql"))
            .unwrap();
        connection
            .execute_batch(include_str!(
                "../../drizzle/0002_work_settings_working_days.sql"
            ))
            .unwrap();
        connection.pragma_update(None, "user_version", 5).unwrap();
        connection
            .execute("UPDATE work_settings SET weekly_target_minutes = 1800", [])
            .unwrap();
        connection
            .execute(
                "INSERT INTO projects (name, description, color, active, created_at, updated_at)
             VALUES ('Website Redesign', NULL, '#3b82f6', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
                [],
            )
            .unwrap();

        migrate(&mut connection).unwrap();
        let user_id = user(&connection, "first@example.com");
        claim_unowned_data(&connection, user_id).unwrap();

        let settings = read_settings(&connection, user_id).unwrap();
        assert_eq!(settings.weekly_target_minutes, 1_800);
        assert_eq!(settings.working_days, DEFAULT_WORKING_DAYS.to_vec());
        assert_eq!(list_projects(&connection, user_id).unwrap().len(), 1);
    }

    #[test]
    fn seeds_the_default_work_settings() {
        let (connection, user_id) = connect();
        assert_eq!(
            read_settings(&connection, user_id).unwrap(),
            WorkSettings {
                weekly_target_minutes: 2_400,
                working_days: DEFAULT_WORKING_DAYS
                    .iter()
                    .map(|day| (*day).to_owned())
                    .collect(),
                week_starts_on: "monday".into(),
            }
        );
    }

    #[test]
    fn round_trips_projects_and_entries() {
        let (connection, user_id) = connect();
        let project = project(&connection, user_id);
        let created = insert_time_entry(
            &connection,
            user_id,
            &entry(
                project.id,
                "2026-08-27T08:00:00.000Z",
                Some("2026-08-27T09:00:00.000Z"),
            ),
        )
        .unwrap();

        assert_eq!(
            list_time_entries(&connection, user_id).unwrap(),
            vec![created]
        );
        assert_eq!(list_projects(&connection, user_id).unwrap(), vec![project]);
    }

    #[test]
    fn keeps_entries_of_deleted_projects() {
        let (connection, user_id) = connect();
        let project = project(&connection, user_id);
        insert_time_entry(
            &connection,
            user_id,
            &entry(
                project.id,
                "2026-08-27T08:00:00.000Z",
                Some("2026-08-27T09:00:00.000Z"),
            ),
        )
        .unwrap();

        delete_project(&connection, project.id, user_id).unwrap();

        let entries = list_time_entries(&connection, user_id).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].project_id, None);
    }

    #[test]
    fn detects_overlapping_entries() {
        let (connection, user_id) = connect();
        let project = project(&connection, user_id);
        let existing = insert_time_entry(
            &connection,
            user_id,
            &entry(
                project.id,
                "2026-08-27T08:00:00.000Z",
                Some("2026-08-27T09:00:00.000Z"),
            ),
        )
        .unwrap();

        assert!(overlaps(
            &connection,
            user_id,
            "2026-08-27T08:30:00.000Z",
            Some("2026-08-27T09:30:00.000Z"),
            None
        )
        .unwrap());
        assert!(!overlaps(
            &connection,
            user_id,
            "2026-08-27T09:00:00.000Z",
            Some("2026-08-27T10:00:00.000Z"),
            None
        )
        .unwrap());
        assert!(!overlaps(
            &connection,
            user_id,
            "2026-08-27T08:30:00.000Z",
            Some("2026-08-27T09:30:00.000Z"),
            Some(existing.id)
        )
        .unwrap());
    }

    #[test]
    fn ignores_entries_of_other_users_when_detecting_overlaps() {
        let (connection, user_id) = connect();
        let project = project(&connection, user_id);
        insert_time_entry(
            &connection,
            user_id,
            &entry(
                project.id,
                "2026-08-27T08:00:00.000Z",
                Some("2026-08-27T09:00:00.000Z"),
            ),
        )
        .unwrap();
        let other = user(&connection, "second@example.com");

        assert!(!overlaps(
            &connection,
            other,
            "2026-08-27T08:30:00.000Z",
            Some("2026-08-27T09:30:00.000Z"),
            None
        )
        .unwrap());
    }

    #[test]
    fn treats_a_running_entry_as_open_ended() {
        let (connection, user_id) = connect();
        let project = project(&connection, user_id);
        insert_time_entry(
            &connection,
            user_id,
            &entry(project.id, "2026-08-27T08:00:00.000Z", None),
        )
        .unwrap();

        assert!(overlaps(&connection, user_id, "2026-08-27T12:00:00.000Z", None, None).unwrap());
    }

    #[test]
    fn updates_and_deletes_entries() {
        let (connection, user_id) = connect();
        let project = project(&connection, user_id);
        let created = insert_time_entry(
            &connection,
            user_id,
            &entry(project.id, "2026-08-27T08:00:00.000Z", None),
        )
        .unwrap();

        let stopped = update_time_entry(
            &connection,
            created.id,
            user_id,
            &entry(
                project.id,
                "2026-08-27T08:00:00.000Z",
                Some("2026-08-27T08:45:00.000Z"),
            ),
        )
        .unwrap();
        assert_eq!(
            stopped.end_time.as_deref(),
            Some("2026-08-27T08:45:00.000Z")
        );

        delete_time_entry(&connection, created.id, user_id).unwrap();
        assert!(list_time_entries(&connection, user_id).unwrap().is_empty());
    }

    #[test]
    fn updates_only_the_entry_note() {
        let (connection, user_id) = connect();
        let project = project(&connection, user_id);
        let created = insert_time_entry(
            &connection,
            user_id,
            &entry(project.id, "2026-08-27T08:00:00.000Z", None),
        )
        .unwrap();

        let updated =
            update_time_entry_note(&connection, created.id, user_id, Some("Updated")).unwrap();

        assert_eq!(updated.note.as_deref(), Some("Updated"));
        assert_eq!(updated.end_time, None);
    }

    #[test]
    fn switches_running_entries_in_one_transaction() {
        let (connection, user_id) = connect();
        let first = project(&connection, user_id);
        let second = insert_project(
            &connection,
            user_id,
            &SaveProject {
                name: "Mobile App".into(),
                description: None,
                color: "#22c55e".into(),
                active: true,
            },
        )
        .unwrap();
        let running = insert_time_entry(
            &connection,
            user_id,
            &entry(first.id, "2026-08-27T08:00:00.000Z", None),
        )
        .unwrap();

        let created = switch_running_time_entry(
            &connection,
            running.id,
            user_id,
            &entry(second.id, "2026-08-27T09:00:00.000Z", None),
        )
        .unwrap();

        assert_eq!(created.project_id, Some(second.id));
        let entries = list_time_entries(&connection, user_id).unwrap();
        assert_eq!(
            entries
                .iter()
                .find(|entry| entry.id == running.id)
                .and_then(|entry| entry.end_time.as_deref()),
            Some("2026-08-27T09:00:00.000Z")
        );
    }

    #[test]
    fn round_trips_and_deletes_project_budgets() {
        let (connection, user_id) = connect();
        let project = project(&connection, user_id);
        let created = insert_project_budget(
            &connection,
            user_id,
            &SaveProjectBudget {
                project_id: project.id,
                budget_minutes: 4_800,
                due_date: "2026-12-31".into(),
            },
        )
        .unwrap();

        let id = created.id;
        assert_eq!(
            list_project_budgets(&connection, user_id).unwrap(),
            vec![created]
        );

        let updated = update_project_budget(
            &connection,
            id,
            user_id,
            &SaveProjectBudget {
                project_id: project.id,
                budget_minutes: 6_000,
                due_date: "2027-01-31".into(),
            },
        )
        .unwrap();
        assert_eq!(updated.budget_minutes, 6_000);

        delete_project_budget(&connection, updated.id, user_id).unwrap();
        assert!(list_project_budgets(&connection, user_id)
            .unwrap()
            .is_empty());
    }

    #[test]
    fn removes_budgets_of_deleted_projects() {
        let (connection, user_id) = connect();
        let project = project(&connection, user_id);
        insert_project_budget(
            &connection,
            user_id,
            &SaveProjectBudget {
                project_id: project.id,
                budget_minutes: 4_800,
                due_date: "2026-12-31".into(),
            },
        )
        .unwrap();

        delete_project(&connection, project.id, user_id).unwrap();

        assert!(list_project_budgets(&connection, user_id)
            .unwrap()
            .is_empty());
    }

    #[test]
    fn writes_work_settings() {
        let (connection, user_id) = connect();
        let settings = write_settings(
            &connection,
            user_id,
            &WorkSettings {
                weekly_target_minutes: 2_100,
                working_days: vec!["monday".into(), "saturday".into()],
                week_starts_on: "sunday".into(),
            },
        )
        .unwrap();

        assert_eq!(settings.working_days, vec!["monday", "saturday"]);
        assert_eq!(read_settings(&connection, user_id).unwrap(), settings);
    }

    #[test]
    fn keeps_the_data_of_every_user_separate() {
        let (connection, first) = connect();
        let second = user(&connection, "second@example.com");
        let owned = project(&connection, first);
        insert_time_entry(
            &connection,
            first,
            &entry(
                owned.id,
                "2026-08-27T08:00:00.000Z",
                Some("2026-08-27T09:00:00.000Z"),
            ),
        )
        .unwrap();
        write_settings(
            &connection,
            first,
            &WorkSettings {
                weekly_target_minutes: 2_100,
                working_days: vec!["monday".into()],
                week_starts_on: "monday".into(),
            },
        )
        .unwrap();

        assert!(list_projects(&connection, second).unwrap().is_empty());
        assert!(list_time_entries(&connection, second).unwrap().is_empty());
        assert_eq!(
            read_settings(&connection, second)
                .unwrap()
                .weekly_target_minutes,
            2_400
        );
        assert!(read_project(&connection, owned.id, second).is_err());
        assert!(insert_time_entry(
            &connection,
            second,
            &entry(owned.id, "2026-08-27T08:00:00.000Z", None)
        )
        .is_err());
        assert!(insert_project_budget(
            &connection,
            second,
            &SaveProjectBudget {
                project_id: owned.id,
                budget_minutes: 600,
                due_date: "2026-12-31".into(),
            }
        )
        .is_err());
    }

    #[test]
    fn keeps_emails_unique() {
        let (connection, _) = connect();

        assert!(insert_user(&connection, "first@example.com", "argon2-hash").is_err());
    }

    #[test]
    fn reads_users_and_their_password_hash() {
        let (connection, user_id) = connect();

        assert_eq!(count_users(&connection).unwrap(), 1);
        assert_eq!(
            read_user(&connection, user_id)
                .unwrap()
                .map(|user| user.email),
            Some("first@example.com".to_owned())
        );
        assert_eq!(
            read_password_hash(&connection, "first@example.com").unwrap(),
            Some((user_id, "argon2-hash".to_owned()))
        );
        assert_eq!(
            read_password_hash(&connection, "unknown@example.com").unwrap(),
            None
        );
    }

    #[test]
    fn removes_the_data_of_a_deleted_user() {
        let (connection, user_id) = connect();
        let owned = project(&connection, user_id);
        insert_time_entry(
            &connection,
            user_id,
            &entry(owned.id, "2026-08-27T08:00:00.000Z", None),
        )
        .unwrap();

        connection
            .execute("DELETE FROM users WHERE id = ?1", [user_id])
            .unwrap();

        assert_eq!(
            connection
                .query_row("SELECT COUNT(*) FROM projects", [], |row| row
                    .get::<_, i64>(0))
                .unwrap(),
            0
        );
    }

    #[test]
    fn stores_and_reads_the_app_version() {
        let connection = open();
        assert_eq!(read_app_version(&connection).unwrap(), None);

        write_app_version(&connection, "1.4.2").unwrap();
        assert_eq!(
            read_app_version(&connection).unwrap(),
            Some("1.4.2".to_owned())
        );

        write_app_version(&connection, "1.5.0").unwrap();
        assert_eq!(
            read_app_version(&connection).unwrap(),
            Some("1.5.0".to_owned())
        );
    }

    #[test]
    fn synchronizes_the_app_version_when_opening_a_database() {
        let path = std::env::temp_dir().join(format!(
            "work-time-tracker-database-{}-{}.sqlite",
            std::process::id(),
            NEXT_DATABASE_TEST_ID.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ));
        let _ = std::fs::remove_file(&path);

        let database = Database::open(&path).unwrap();
        {
            let connection = database.0.lock().unwrap();
            assert_eq!(
                read_app_version(&connection).unwrap(),
                Some(APP_VERSION.into())
            );
            write_app_version(&connection, "stale").unwrap();
        }
        drop(database);

        let database = Database::open(&path).unwrap();
        assert_eq!(
            read_app_version(&database.0.lock().unwrap()).unwrap(),
            Some(APP_VERSION.into())
        );
        drop(database);
        std::fs::remove_file(path).unwrap();
    }
}

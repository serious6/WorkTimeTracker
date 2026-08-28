use std::{path::Path, sync::Mutex};

use rusqlite::{params, Connection, OptionalExtension, Result, Row};
use rusqlite_migration::{Migrations, M};

use crate::models::{
    Project, ProjectBudget, SaveProject, SaveProjectBudget, SaveTimeEntry, TimeEntry, WorkSettings,
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

const PROJECT_COLUMNS: &str = "id, name, description, color, active, created_at, updated_at";
const ENTRY_COLUMNS: &str = "id, project_id, start_time, end_time, note, created_at, updated_at";

pub fn list_projects(connection: &Connection) -> Result<Vec<Project>> {
    let mut statement = connection.prepare(&format!(
        "SELECT {PROJECT_COLUMNS} FROM projects ORDER BY name"
    ))?;
    let projects = statement.query_map([], project_from_row)?;
    projects.collect()
}

fn read_project(connection: &Connection, id: i64) -> Result<Project> {
    connection.query_row(
        &format!("SELECT {PROJECT_COLUMNS} FROM projects WHERE id = ?1"),
        [id],
        project_from_row,
    )
}

pub fn insert_project(connection: &Connection, input: &SaveProject) -> Result<Project> {
    connection.execute(
        "INSERT INTO projects (name, description, color, active, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
        params![input.name, input.description, input.color, input.active],
    )?;
    read_project(connection, connection.last_insert_rowid())
}

pub fn update_project(connection: &Connection, id: i64, input: &SaveProject) -> Result<Project> {
    connection.execute(
        "UPDATE projects
     SET name = ?2, description = ?3, color = ?4, active = ?5,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE id = ?1",
        params![id, input.name, input.description, input.color, input.active],
    )?;
    read_project(connection, id)
}

pub fn delete_project(connection: &Connection, id: i64) -> Result<()> {
    connection.execute("DELETE FROM projects WHERE id = ?1", [id])?;
    Ok(())
}

pub fn list_time_entries(connection: &Connection) -> Result<Vec<TimeEntry>> {
    let mut statement = connection.prepare(&format!(
        "SELECT {ENTRY_COLUMNS} FROM time_entries ORDER BY start_time"
    ))?;
    let entries = statement.query_map([], entry_from_row)?;
    entries.collect()
}

fn read_entry(connection: &Connection, id: i64) -> Result<TimeEntry> {
    connection.query_row(
        &format!("SELECT {ENTRY_COLUMNS} FROM time_entries WHERE id = ?1"),
        [id],
        entry_from_row,
    )
}

pub fn overlaps(
    connection: &Connection,
    start_time: &str,
    end_time: Option<&str>,
    exclude_id: Option<i64>,
) -> Result<bool> {
    connection.query_row(
        "SELECT EXISTS (
       SELECT 1 FROM time_entries
       WHERE (?3 IS NULL OR id <> ?3)
         AND start_time < ?2
         AND COALESCE(end_time, ?4) > ?1
     )",
        params![
            start_time,
            end_time.unwrap_or(OPEN_END),
            exclude_id,
            OPEN_END
        ],
        |row| row.get(0),
    )
}

pub fn insert_time_entry(connection: &Connection, input: &SaveTimeEntry) -> Result<TimeEntry> {
    connection.execute(
        "INSERT INTO time_entries (project_id, start_time, end_time, note, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
        params![
            input.project_id,
            input.start_time,
            input.end_time,
            input.note
        ],
    )?;
    read_entry(connection, connection.last_insert_rowid())
}

pub fn update_time_entry(
    connection: &Connection,
    id: i64,
    input: &SaveTimeEntry,
) -> Result<TimeEntry> {
    connection.execute(
        "UPDATE time_entries
     SET project_id = ?2, start_time = ?3, end_time = ?4, note = ?5,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE id = ?1",
        params![
            id,
            input.project_id,
            input.start_time,
            input.end_time,
            input.note
        ],
    )?;
    read_entry(connection, id)
}

pub fn update_time_entry_note(
    connection: &Connection,
    id: i64,
    note: Option<&str>,
) -> Result<TimeEntry> {
    connection.execute(
        "UPDATE time_entries
     SET note = ?2, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE id = ?1",
        params![id, note],
    )?;
    read_entry(connection, id)
}

pub fn switch_running_time_entry(
    connection: &Connection,
    id: i64,
    input: &SaveTimeEntry,
) -> Result<TimeEntry> {
    let transaction = connection.unchecked_transaction()?;
    let current = read_entry(&transaction, id)?;
    if current.end_time.is_some()
        || input.project_id.is_none()
        || input.end_time.is_some()
        || input.start_time <= current.start_time
    {
        return Err(rusqlite::Error::InvalidQuery);
    }

    transaction.execute(
        "UPDATE time_entries
     SET end_time = ?2, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE id = ?1",
        params![id, input.start_time],
    )?;
    if overlaps(
        &transaction,
        &input.start_time,
        input.end_time.as_deref(),
        None,
    )? {
        return Err(rusqlite::Error::InvalidQuery);
    }
    let created = insert_time_entry(&transaction, input)?;
    transaction.commit()?;
    Ok(created)
}

pub fn delete_time_entry(connection: &Connection, id: i64) -> Result<()> {
    connection.execute("DELETE FROM time_entries WHERE id = ?1", [id])?;
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

pub fn list_project_budgets(connection: &Connection) -> Result<Vec<ProjectBudget>> {
    let mut statement = connection.prepare(&format!(
        "SELECT {BUDGET_COLUMNS} FROM project_budgets ORDER BY due_date"
    ))?;
    let budgets = statement.query_map([], budget_from_row)?;
    budgets.collect()
}

fn read_budget(connection: &Connection, id: i64) -> Result<ProjectBudget> {
    connection.query_row(
        &format!("SELECT {BUDGET_COLUMNS} FROM project_budgets WHERE id = ?1"),
        [id],
        budget_from_row,
    )
}

pub fn insert_project_budget(
    connection: &Connection,
    input: &SaveProjectBudget,
) -> Result<ProjectBudget> {
    connection.execute(
        "INSERT INTO project_budgets (project_id, budget_minutes, due_date, created_at, updated_at)
     VALUES (?1, ?2, ?3, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
        params![input.project_id, input.budget_minutes, input.due_date],
    )?;
    read_budget(connection, connection.last_insert_rowid())
}

pub fn update_project_budget(
    connection: &Connection,
    id: i64,
    input: &SaveProjectBudget,
) -> Result<ProjectBudget> {
    connection.execute(
        "UPDATE project_budgets
     SET project_id = ?2, budget_minutes = ?3, due_date = ?4,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE id = ?1",
        params![id, input.project_id, input.budget_minutes, input.due_date],
    )?;
    read_budget(connection, id)
}

pub fn delete_project_budget(connection: &Connection, id: i64) -> Result<()> {
    connection.execute("DELETE FROM project_budgets WHERE id = ?1", [id])?;
    Ok(())
}

pub fn read_settings(connection: &Connection) -> Result<WorkSettings> {
    let settings = connection
        .query_row(
            "SELECT daily_target_minutes, weekly_target_minutes, week_starts_on
       FROM work_settings WHERE id = 1",
            [],
            |row| {
                Ok(WorkSettings {
                    daily_target_minutes: row.get(0)?,
                    weekly_target_minutes: row.get(1)?,
                    week_starts_on: row.get(2)?,
                })
            },
        )
        .optional()?;
    Ok(settings.unwrap_or(WorkSettings {
        daily_target_minutes: 480,
        weekly_target_minutes: 2_400,
        week_starts_on: "monday".into(),
    }))
}

pub fn write_settings(connection: &Connection, settings: &WorkSettings) -> Result<WorkSettings> {
    connection.execute(
        "INSERT INTO work_settings (id, daily_target_minutes, weekly_target_minutes, week_starts_on)
     VALUES (1, ?1, ?2, ?3)
     ON CONFLICT (id) DO UPDATE
     SET daily_target_minutes = ?1, weekly_target_minutes = ?2, week_starts_on = ?3",
        params![
            settings.daily_target_minutes,
            settings.weekly_target_minutes,
            settings.week_starts_on
        ],
    )?;
    read_settings(connection)
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

#[cfg(test)]
mod tests {
    use super::*;

    fn connect() -> Connection {
        let mut connection = Connection::open_in_memory().unwrap();
        connection
            .pragma_update(None, "foreign_keys", "ON")
            .unwrap();
        migrate(&mut connection).unwrap();
        connection
    }

    fn project(connection: &Connection) -> Project {
        insert_project(
            connection,
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
        let mut connection = connect();
        migrate(&mut connection).unwrap();
        assert_eq!(
            connection.pragma_query_value(None, "user_version", |row| row.get::<_, i64>(0)),
            Ok(4)
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
            Ok(4)
        );
        assert!(list_projects(&connection).unwrap().is_empty());
        assert!(list_time_entries(&connection).unwrap().is_empty());
        assert_eq!(
            read_settings(&connection).unwrap().daily_target_minutes,
            480
        );
    }

    #[test]
    fn seeds_the_default_work_settings() {
        assert_eq!(
            read_settings(&connect()).unwrap(),
            WorkSettings {
                daily_target_minutes: 480,
                weekly_target_minutes: 2_400,
                week_starts_on: "monday".into(),
            }
        );
    }

    #[test]
    fn round_trips_projects_and_entries() {
        let connection = connect();
        let project = project(&connection);
        let created = insert_time_entry(
            &connection,
            &entry(
                project.id,
                "2026-08-27T08:00:00.000Z",
                Some("2026-08-27T09:00:00.000Z"),
            ),
        )
        .unwrap();

        assert_eq!(list_time_entries(&connection).unwrap(), vec![created]);
        assert_eq!(list_projects(&connection).unwrap(), vec![project]);
    }

    #[test]
    fn keeps_entries_of_deleted_projects() {
        let connection = connect();
        let project = project(&connection);
        insert_time_entry(
            &connection,
            &entry(
                project.id,
                "2026-08-27T08:00:00.000Z",
                Some("2026-08-27T09:00:00.000Z"),
            ),
        )
        .unwrap();

        delete_project(&connection, project.id).unwrap();

        let entries = list_time_entries(&connection).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].project_id, None);
    }

    #[test]
    fn detects_overlapping_entries() {
        let connection = connect();
        let project = project(&connection);
        let existing = insert_time_entry(
            &connection,
            &entry(
                project.id,
                "2026-08-27T08:00:00.000Z",
                Some("2026-08-27T09:00:00.000Z"),
            ),
        )
        .unwrap();

        assert!(overlaps(
            &connection,
            "2026-08-27T08:30:00.000Z",
            Some("2026-08-27T09:30:00.000Z"),
            None
        )
        .unwrap());
        assert!(!overlaps(
            &connection,
            "2026-08-27T09:00:00.000Z",
            Some("2026-08-27T10:00:00.000Z"),
            None
        )
        .unwrap());
        assert!(!overlaps(
            &connection,
            "2026-08-27T08:30:00.000Z",
            Some("2026-08-27T09:30:00.000Z"),
            Some(existing.id)
        )
        .unwrap());
    }

    #[test]
    fn treats_a_running_entry_as_open_ended() {
        let connection = connect();
        let project = project(&connection);
        insert_time_entry(
            &connection,
            &entry(project.id, "2026-08-27T08:00:00.000Z", None),
        )
        .unwrap();

        assert!(overlaps(&connection, "2026-08-27T12:00:00.000Z", None, None).unwrap());
    }

    #[test]
    fn updates_and_deletes_entries() {
        let connection = connect();
        let project = project(&connection);
        let created = insert_time_entry(
            &connection,
            &entry(project.id, "2026-08-27T08:00:00.000Z", None),
        )
        .unwrap();

        let stopped = update_time_entry(
            &connection,
            created.id,
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

        delete_time_entry(&connection, created.id).unwrap();
        assert!(list_time_entries(&connection).unwrap().is_empty());
    }

    #[test]
    fn updates_only_the_entry_note() {
        let connection = connect();
        let project = project(&connection);
        let created = insert_time_entry(
            &connection,
            &entry(project.id, "2026-08-27T08:00:00.000Z", None),
        )
        .unwrap();

        let updated = update_time_entry_note(&connection, created.id, Some("Updated")).unwrap();

        assert_eq!(updated.note.as_deref(), Some("Updated"));
        assert_eq!(updated.end_time, None);
    }

    #[test]
    fn switches_running_entries_in_one_transaction() {
        let connection = connect();
        let first = project(&connection);
        let second = insert_project(
            &connection,
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
            &entry(first.id, "2026-08-27T08:00:00.000Z", None),
        )
        .unwrap();

        let created = switch_running_time_entry(
            &connection,
            running.id,
            &entry(second.id, "2026-08-27T09:00:00.000Z", None),
        )
        .unwrap();

        assert_eq!(created.project_id, Some(second.id));
        let entries = list_time_entries(&connection).unwrap();
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
        let connection = connect();
        let project = project(&connection);
        let created = insert_project_budget(
            &connection,
            &SaveProjectBudget {
                project_id: project.id,
                budget_minutes: 4_800,
                due_date: "2026-12-31".into(),
            },
        )
        .unwrap();

        let id = created.id;
        assert_eq!(list_project_budgets(&connection).unwrap(), vec![created]);

        let updated = update_project_budget(
            &connection,
            id,
            &SaveProjectBudget {
                project_id: project.id,
                budget_minutes: 6_000,
                due_date: "2027-01-31".into(),
            },
        )
        .unwrap();
        assert_eq!(updated.budget_minutes, 6_000);

        delete_project_budget(&connection, updated.id).unwrap();
        assert!(list_project_budgets(&connection).unwrap().is_empty());
    }

    #[test]
    fn removes_budgets_of_deleted_projects() {
        let connection = connect();
        let project = project(&connection);
        insert_project_budget(
            &connection,
            &SaveProjectBudget {
                project_id: project.id,
                budget_minutes: 4_800,
                due_date: "2026-12-31".into(),
            },
        )
        .unwrap();

        delete_project(&connection, project.id).unwrap();

        assert!(list_project_budgets(&connection).unwrap().is_empty());
    }

    #[test]
    fn writes_work_settings() {
        let connection = connect();
        let settings = write_settings(
            &connection,
            &WorkSettings {
                daily_target_minutes: 420,
                weekly_target_minutes: 2_100,
                week_starts_on: "sunday".into(),
            },
        )
        .unwrap();

        assert_eq!(settings.daily_target_minutes, 420);
        assert_eq!(read_settings(&connection).unwrap(), settings);
    }

    #[test]
    fn stores_and_reads_the_app_version() {
        let connection = connect();
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
}

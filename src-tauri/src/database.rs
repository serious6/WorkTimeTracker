use std::{path::Path, sync::Mutex};

use rusqlite::{params, Connection, Result};
use rusqlite_migration::{Migrations, M};

use crate::models::{CreateTimeEntry, TimeEntry};

pub struct Database(pub Mutex<Connection>);

fn migrations() -> Migrations<'static> {
    Migrations::new(vec![M::up(include_str!(
        "../../drizzle/0000_create_time_entries.sql"
    ))])
}

impl Database {
    pub fn open(path: impl AsRef<Path>) -> std::result::Result<Self, Box<dyn std::error::Error>> {
        let mut connection = Connection::open(path)?;
        migrate(&mut connection)?;
        Ok(Self(Mutex::new(connection)))
    }
}

pub fn migrate(connection: &mut Connection) -> rusqlite_migration::Result<()> {
    migrations().to_latest(connection)
}

pub fn list(connection: &Connection) -> Result<Vec<TimeEntry>> {
    let mut statement = connection.prepare(
        "SELECT id, project, started_at, ended_at, duration_minutes, notes
     FROM time_entries ORDER BY started_at DESC",
    )?;
    let entries = statement.query_map([], |row| {
        Ok(TimeEntry {
            id: row.get(0)?,
            project: row.get(1)?,
            started_at: row.get(2)?,
            ended_at: row.get(3)?,
            duration_minutes: row.get(4)?,
            notes: row.get(5)?,
        })
    })?;
    entries.collect()
}

pub fn insert(connection: &Connection, input: &CreateTimeEntry) -> Result<TimeEntry> {
    connection.execute(
        "INSERT INTO time_entries (project, started_at, ended_at, duration_minutes, notes)
     VALUES (
       ?1,
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now', printf('-%d minutes', ?2)),
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
       ?2,
       ?3
     )",
        params![input.project, input.duration_minutes, input.notes],
    )?;
    let id = connection.last_insert_rowid();
    connection.query_row(
        "SELECT id, project, started_at, ended_at, duration_minutes, notes
     FROM time_entries WHERE id = ?1",
        [id],
        |row| {
            Ok(TimeEntry {
                id: row.get(0)?,
                project: row.get(1)?,
                started_at: row.get(2)?,
                ended_at: row.get(3)?,
                duration_minutes: row.get(4)?,
                notes: row.get(5)?,
            })
        },
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_all_migrations() {
        migrations().validate().unwrap();
    }

    #[test]
    fn adopts_an_existing_unversioned_database() {
        let mut connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch(include_str!("../../drizzle/0000_create_time_entries.sql"))
            .unwrap();

        migrate(&mut connection).unwrap();

        assert_eq!(
            connection.pragma_query_value(None, "user_version", |row| row.get::<_, i64>(0)),
            Ok(1)
        );
    }

    #[test]
    fn migrates_and_round_trips_an_entry() {
        let mut connection = Connection::open_in_memory().unwrap();
        migrate(&mut connection).unwrap();
        migrate(&mut connection).unwrap();
        assert_eq!(
            connection.pragma_query_value(None, "user_version", |row| row.get::<_, i64>(0)),
            Ok(1)
        );
        let created = insert(
            &connection,
            &CreateTimeEntry {
                project: "Documentation".into(),
                duration_minutes: 45,
                notes: Some("Architecture".into()),
            },
        )
        .unwrap();

        assert_eq!(created.project, "Documentation");
        assert_eq!(list(&connection).unwrap(), vec![created]);
    }
}

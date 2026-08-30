//! Postgres backend, used when `WTT_DB_BACKEND=postgres`. Talks to the
//! database with the synchronous `postgres` crate through a small `r2d2`
//! connection pool (see `Cargo.toml` for why this crate was chosen over
//! `sqlx`/`tokio-postgres`+`deadpool`).

use std::time::Duration;

use chrono::Utc;
use postgres::{error::SqlState, NoTls};
use r2d2::{Pool, PooledConnection};
use r2d2_postgres::PostgresConnectionManager;

use crate::{
    models::{
        AuditLogEntry, Project, ProjectBudget, SaveProject, SaveProjectBudget, SaveTimeEntry,
        TimeEntry, User, WorkSettings, DEFAULT_WORKING_DAYS,
    },
    store::{Store, StoreError, SwitchEntryError, TimeEntryWriteError},
};

const OPEN_END: &str = "9999-12-31T23:59:59.999Z";
const AUDIT_LOG_LIMIT: i64 = 200;
const TIME_ENTRY_ENTITY: &str = "timeEntry";

type Manager = PostgresConnectionManager<NoTls>;

pub struct PostgresStore {
    pool: Pool<Manager>,
}

/// Timestamp string in the same ISO 8601 UTC/millisecond format that the
/// SQLite backend produces via `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`.
fn now_iso() -> String {
    Utc::now().format("%Y-%m-%dT%H:%M:%.3fZ").to_string()
}

impl From<postgres::Error> for StoreError {
    fn from(error: postgres::Error) -> Self {
        if error
            .code()
            .is_some_and(|code| *code == SqlState::UNIQUE_VIOLATION)
        {
            Self::UniqueViolation
        } else {
            Self::Backend(error.to_string())
        }
    }
}

impl From<r2d2::Error> for StoreError {
    fn from(error: r2d2::Error) -> Self {
        Self::Backend(error.to_string())
    }
}

impl PostgresStore {
    pub fn connect(database_url: &str) -> Result<Self, Box<dyn std::error::Error>> {
        let config: postgres::Config = database_url.parse()?;
        let manager = PostgresConnectionManager::new(config, NoTls);
        let pool = Pool::builder()
            .max_size(4)
            .connection_timeout(Duration::from_secs(5))
            .build(manager)?;
        let store = Self { pool };
        store
            .conn()?
            .batch_execute(include_str!("../../drizzle/postgres/0000_init.sql"))?;
        Ok(store)
    }

    fn conn(&self) -> Result<PooledConnection<Manager>, StoreError> {
        Ok(self.pool.get()?)
    }

    fn assert_owns_project(
        client: &mut impl postgres::GenericClient,
        user_id: i64,
        project_id: Option<i64>,
    ) -> Result<(), StoreError> {
        let Some(project_id) = project_id else {
            return Ok(());
        };
        let owned: bool = client
            .query_one(
                "SELECT EXISTS (SELECT 1 FROM projects WHERE id = $1 AND user_id = $2)",
                &[&project_id, &user_id],
            )?
            .get(0);
        if owned {
            Ok(())
        } else {
            Err(StoreError::NotFound)
        }
    }
}

fn project_from_row(row: &postgres::Row) -> Project {
    Project {
        id: row.get(0),
        name: row.get(1),
        description: row.get(2),
        color: row.get(3),
        active: row.get(4),
        created_at: row.get(5),
        updated_at: row.get(6),
    }
}

fn entry_from_row(row: &postgres::Row) -> TimeEntry {
    TimeEntry {
        id: row.get(0),
        project_id: row.get(1),
        start_time: row.get(2),
        end_time: row.get(3),
        note: row.get(4),
        created_at: row.get(5),
        updated_at: row.get(6),
    }
}

fn budget_from_row(row: &postgres::Row) -> ProjectBudget {
    ProjectBudget {
        id: row.get(0),
        project_id: row.get(1),
        budget_minutes: row.get(2),
        due_date: row.get(3),
        created_at: row.get(4),
        updated_at: row.get(5),
    }
}

fn audit_from_row(row: &postgres::Row) -> AuditLogEntry {
    AuditLogEntry {
        id: row.get(0),
        entity: row.get(1),
        entity_id: row.get(2),
        action: row.get(3),
        old_value: row.get(4),
        new_value: row.get(5),
        created_at: row.get(6),
    }
}

const PROJECT_COLUMNS: &str = "id, name, description, color, active, created_at, updated_at";
const ENTRY_COLUMNS: &str = "id, project_id, start_time, end_time, note, created_at, updated_at";
const BUDGET_COLUMNS: &str = "id, project_id, budget_minutes, due_date, created_at, updated_at";
const AUDIT_LOG_COLUMNS: &str = "id, entity, entity_id, action, old_value, new_value, created_at";

fn entry_snapshot(entry: &TimeEntry) -> String {
    serde_json::json!({
        "projectId": entry.project_id,
        "startTime": entry.start_time,
        "endTime": entry.end_time,
        "note": entry.note,
    })
    .to_string()
}

fn record_audit(
    transaction: &mut postgres::Transaction,
    user_id: i64,
    entity_id: i64,
    action: &str,
    old_value: Option<&TimeEntry>,
    new_value: Option<&TimeEntry>,
) -> Result<(), StoreError> {
    transaction.execute(
        "INSERT INTO audit_log (user_id, entity, entity_id, action, old_value, new_value, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)",
        &[
            &user_id,
            &TIME_ENTRY_ENTITY,
            &entity_id,
            &action,
            &old_value.map(entry_snapshot),
            &new_value.map(entry_snapshot),
            &now_iso(),
        ],
    )?;
    Ok(())
}

fn read_entry(
    client: &mut impl postgres::GenericClient,
    id: i64,
    user_id: i64,
) -> Result<TimeEntry, StoreError> {
    let row = client
        .query_opt(
            &format!("SELECT {ENTRY_COLUMNS} FROM time_entries WHERE id = $1 AND user_id = $2"),
            &[&id, &user_id],
        )?
        .ok_or(StoreError::NotFound)?;
    Ok(entry_from_row(&row))
}

fn overlaps_tx(
    client: &mut impl postgres::GenericClient,
    user_id: i64,
    start_time: &str,
    end_time: Option<&str>,
    exclude_id: Option<i64>,
) -> Result<bool, StoreError> {
    let row = client.query_one(
        "SELECT EXISTS (
           SELECT 1 FROM time_entries
           WHERE user_id = $5
             AND ($3::BIGINT IS NULL OR id <> $3)
             AND start_time < $2
             AND COALESCE(end_time, $4) > $1
         )",
        &[
            &start_time,
            &end_time.unwrap_or(OPEN_END),
            &exclude_id,
            &OPEN_END,
            &user_id,
        ],
    )?;
    Ok(row.get(0))
}

impl Store for PostgresStore {
    fn list_projects(&self, user_id: i64) -> Result<Vec<Project>, StoreError> {
        let mut client = self.conn()?;
        let rows = client.query(
            &format!("SELECT {PROJECT_COLUMNS} FROM projects WHERE user_id = $1 ORDER BY name"),
            &[&user_id],
        )?;
        Ok(rows.iter().map(project_from_row).collect())
    }

    fn insert_project(&self, user_id: i64, input: &SaveProject) -> Result<Project, StoreError> {
        let mut client = self.conn()?;
        let now = now_iso();
        let row = client.query_one(
            &format!(
                "INSERT INTO projects (user_id, name, description, color, active, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $6) RETURNING {PROJECT_COLUMNS}"
            ),
            &[
                &user_id,
                &input.name,
                &input.description,
                &input.color,
                &input.active,
                &now,
            ],
        )?;
        Ok(project_from_row(&row))
    }

    fn update_project(
        &self,
        id: i64,
        user_id: i64,
        input: &SaveProject,
    ) -> Result<Project, StoreError> {
        let mut client = self.conn()?;
        let row = client
            .query_opt(
                &format!(
                    "UPDATE projects SET name = $3, description = $4, color = $5, active = $6, updated_at = $7
                     WHERE id = $1 AND user_id = $2 RETURNING {PROJECT_COLUMNS}"
                ),
                &[
                    &id,
                    &user_id,
                    &input.name,
                    &input.description,
                    &input.color,
                    &input.active,
                    &now_iso(),
                ],
            )?
            .ok_or(StoreError::NotFound)?;
        Ok(project_from_row(&row))
    }

    fn delete_project(&self, id: i64, user_id: i64) -> Result<(), StoreError> {
        let mut client = self.conn()?;
        let mut transaction = client.transaction()?;
        let affected: Vec<TimeEntry> = transaction
            .query(
                &format!(
                    "SELECT {ENTRY_COLUMNS} FROM time_entries WHERE project_id = $1 AND user_id = $2"
                ),
                &[&id, &user_id],
            )?
            .iter()
            .map(entry_from_row)
            .collect();
        transaction.execute(
            "DELETE FROM projects WHERE id = $1 AND user_id = $2",
            &[&id, &user_id],
        )?;
        for current in affected {
            let updated = read_entry(&mut transaction, current.id, user_id)?;
            record_audit(
                &mut transaction,
                user_id,
                current.id,
                "update",
                Some(&current),
                Some(&updated),
            )?;
        }
        transaction.commit()?;
        Ok(())
    }

    fn list_time_entries(&self, user_id: i64) -> Result<Vec<TimeEntry>, StoreError> {
        let mut client = self.conn()?;
        let rows = client.query(
            &format!(
                "SELECT {ENTRY_COLUMNS} FROM time_entries WHERE user_id = $1 ORDER BY start_time"
            ),
            &[&user_id],
        )?;
        Ok(rows.iter().map(entry_from_row).collect())
    }

    fn overlaps(
        &self,
        user_id: i64,
        start_time: &str,
        end_time: Option<&str>,
        exclude_id: Option<i64>,
    ) -> Result<bool, StoreError> {
        let mut client = self.conn()?;
        overlaps_tx(&mut *client, user_id, start_time, end_time, exclude_id)
    }

    fn create_time_entry(
        &self,
        user_id: i64,
        input: &SaveTimeEntry,
    ) -> Result<TimeEntry, TimeEntryWriteError> {
        let mut client = self.conn()?;
        let mut transaction = client.transaction().map_err(StoreError::from)?;
        if overlaps_tx(
            &mut transaction,
            user_id,
            &input.start_time,
            input.end_time.as_deref(),
            None,
        )? {
            return Err(TimeEntryWriteError::Overlap);
        }
        PostgresStore::assert_owns_project(&mut transaction, user_id, input.project_id)?;
        let now = now_iso();
        let row = transaction.query_one(
            &format!(
                "INSERT INTO time_entries (user_id, project_id, start_time, end_time, note, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $6) RETURNING {ENTRY_COLUMNS}"
            ),
            &[
                &user_id,
                &input.project_id,
                &input.start_time,
                &input.end_time,
                &input.note,
                &now,
            ],
        ).map_err(StoreError::from)?;
        let entry = entry_from_row(&row);
        record_audit(
            &mut transaction,
            user_id,
            entry.id,
            "create",
            None,
            Some(&entry),
        )
        .map_err(TimeEntryWriteError::from)?;
        transaction.commit().map_err(StoreError::from)?;
        Ok(entry)
    }

    fn update_time_entry(
        &self,
        id: i64,
        user_id: i64,
        input: &SaveTimeEntry,
    ) -> Result<TimeEntry, TimeEntryWriteError> {
        let mut client = self.conn()?;
        let mut transaction = client.transaction().map_err(StoreError::from)?;
        if overlaps_tx(
            &mut transaction,
            user_id,
            &input.start_time,
            input.end_time.as_deref(),
            Some(id),
        )? {
            return Err(TimeEntryWriteError::Overlap);
        }
        PostgresStore::assert_owns_project(&mut transaction, user_id, input.project_id)?;
        let current = read_entry(&mut transaction, id, user_id)?;
        transaction
            .execute(
                "UPDATE time_entries SET project_id = $3, start_time = $4, end_time = $5, note = $6, updated_at = $7
                 WHERE id = $1 AND user_id = $2",
                &[
                    &id,
                    &user_id,
                    &input.project_id,
                    &input.start_time,
                    &input.end_time,
                    &input.note,
                    &now_iso(),
                ],
            )
            .map_err(StoreError::from)?;
        let updated = read_entry(&mut transaction, id, user_id)?;
        record_audit(
            &mut transaction,
            user_id,
            id,
            "update",
            Some(&current),
            Some(&updated),
        )?;
        transaction.commit().map_err(StoreError::from)?;
        Ok(updated)
    }

    fn update_time_entry_note(
        &self,
        id: i64,
        user_id: i64,
        note: Option<&str>,
    ) -> Result<TimeEntry, StoreError> {
        let mut client = self.conn()?;
        let mut transaction = client.transaction()?;
        let current = read_entry(&mut transaction, id, user_id)?;
        transaction.execute(
            "UPDATE time_entries SET note = $3, updated_at = $4 WHERE id = $1 AND user_id = $2",
            &[&id, &user_id, &note, &now_iso()],
        )?;
        let updated = read_entry(&mut transaction, id, user_id)?;
        record_audit(
            &mut transaction,
            user_id,
            id,
            "update",
            Some(&current),
            Some(&updated),
        )?;
        transaction.commit()?;
        Ok(updated)
    }

    fn switch_running_time_entry(
        &self,
        id: i64,
        user_id: i64,
        input: &SaveTimeEntry,
    ) -> Result<TimeEntry, SwitchEntryError> {
        let mut client = self.conn().map_err(SwitchEntryError::from)?;
        let mut transaction = client.transaction().map_err(StoreError::from)?;
        let current = read_entry(&mut transaction, id, user_id).map_err(SwitchEntryError::from)?;
        if current.end_time.is_some()
            || input.project_id.is_none()
            || input.end_time.is_some()
            || input.start_time <= current.start_time
        {
            return Err(SwitchEntryError::InvalidTimer);
        }
        transaction
            .execute(
                "UPDATE time_entries SET end_time = $3, updated_at = $4 WHERE id = $1 AND user_id = $2",
                &[&id, &user_id, &input.start_time, &now_iso()],
            )
            .map_err(StoreError::from)?;
        if overlaps_tx(
            &mut transaction,
            user_id,
            &input.start_time,
            input.end_time.as_deref(),
            None,
        )
        .map_err(SwitchEntryError::from)?
        {
            return Err(SwitchEntryError::Overlap);
        }
        let closed = read_entry(&mut transaction, id, user_id).map_err(SwitchEntryError::from)?;
        record_audit(
            &mut transaction,
            user_id,
            id,
            "update",
            Some(&current),
            Some(&closed),
        )
        .map_err(SwitchEntryError::from)?;
        PostgresStore::assert_owns_project(&mut transaction, user_id, input.project_id)
            .map_err(SwitchEntryError::from)?;
        let now = now_iso();
        let row = transaction
            .query_one(
                &format!(
                    "INSERT INTO time_entries (user_id, project_id, start_time, end_time, note, created_at, updated_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $6) RETURNING {ENTRY_COLUMNS}"
                ),
                &[
                    &user_id,
                    &input.project_id,
                    &input.start_time,
                    &input.end_time,
                    &input.note,
                    &now,
                ],
            )
            .map_err(StoreError::from)?;
        let created = entry_from_row(&row);
        record_audit(
            &mut transaction,
            user_id,
            created.id,
            "create",
            None,
            Some(&created),
        )
        .map_err(SwitchEntryError::from)?;
        transaction.commit().map_err(StoreError::from)?;
        Ok(created)
    }

    fn delete_time_entry(&self, id: i64, user_id: i64) -> Result<(), StoreError> {
        let mut client = self.conn()?;
        let mut transaction = client.transaction()?;
        let current = read_entry(&mut transaction, id, user_id).ok();
        transaction.execute(
            "DELETE FROM time_entries WHERE id = $1 AND user_id = $2",
            &[&id, &user_id],
        )?;
        if let Some(current) = current {
            record_audit(
                &mut transaction,
                user_id,
                id,
                "delete",
                Some(&current),
                None,
            )?;
        }
        transaction.commit()?;
        Ok(())
    }

    fn list_audit_log(&self, user_id: i64) -> Result<Vec<AuditLogEntry>, StoreError> {
        let mut client = self.conn()?;
        let rows = client.query(
            &format!(
                "SELECT {AUDIT_LOG_COLUMNS} FROM audit_log WHERE user_id = $1 ORDER BY id DESC LIMIT $2"
            ),
            &[&user_id, &AUDIT_LOG_LIMIT],
        )?;
        Ok(rows.iter().map(audit_from_row).collect())
    }

    fn list_project_budgets(&self, user_id: i64) -> Result<Vec<ProjectBudget>, StoreError> {
        let mut client = self.conn()?;
        let rows = client.query(
            &format!(
                "SELECT {BUDGET_COLUMNS} FROM project_budgets WHERE user_id = $1 ORDER BY due_date"
            ),
            &[&user_id],
        )?;
        Ok(rows.iter().map(budget_from_row).collect())
    }

    fn insert_project_budget(
        &self,
        user_id: i64,
        input: &SaveProjectBudget,
    ) -> Result<ProjectBudget, StoreError> {
        let mut client = self.conn()?;
        let mut transaction = client.transaction()?;
        PostgresStore::assert_owns_project(&mut transaction, user_id, Some(input.project_id))?;
        let now = now_iso();
        let row = transaction.query_one(
            &format!(
                "INSERT INTO project_budgets (user_id, project_id, budget_minutes, due_date, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $5) RETURNING {BUDGET_COLUMNS}"
            ),
            &[&user_id, &input.project_id, &input.budget_minutes, &input.due_date, &now],
        )?;
        transaction.commit()?;
        Ok(budget_from_row(&row))
    }

    fn update_project_budget(
        &self,
        id: i64,
        user_id: i64,
        input: &SaveProjectBudget,
    ) -> Result<ProjectBudget, StoreError> {
        let mut client = self.conn()?;
        let mut transaction = client.transaction()?;
        PostgresStore::assert_owns_project(&mut transaction, user_id, Some(input.project_id))?;
        let row = transaction
            .query_opt(
                &format!(
                    "UPDATE project_budgets SET project_id = $3, budget_minutes = $4, due_date = $5, updated_at = $6
                     WHERE id = $1 AND user_id = $2 RETURNING {BUDGET_COLUMNS}"
                ),
                &[
                    &id,
                    &user_id,
                    &input.project_id,
                    &input.budget_minutes,
                    &input.due_date,
                    &now_iso(),
                ],
            )?
            .ok_or(StoreError::NotFound)?;
        transaction.commit()?;
        Ok(budget_from_row(&row))
    }

    fn delete_project_budget(&self, id: i64, user_id: i64) -> Result<(), StoreError> {
        let mut client = self.conn()?;
        client.execute(
            "DELETE FROM project_budgets WHERE id = $1 AND user_id = $2",
            &[&id, &user_id],
        )?;
        Ok(())
    }

    fn read_settings(&self, user_id: i64) -> Result<WorkSettings, StoreError> {
        let mut client = self.conn()?;
        let row = client.query_opt(
            "SELECT weekly_target_minutes, working_days, week_starts_on FROM work_settings WHERE user_id = $1",
            &[&user_id],
        )?;
        let Some(row) = row else {
            return Ok(WorkSettings {
                weekly_target_minutes: 2_400,
                working_days: DEFAULT_WORKING_DAYS
                    .iter()
                    .map(|day| (*day).to_owned())
                    .collect(),
                week_starts_on: "monday".into(),
            });
        };
        let working_days_text: String = row.get(1);
        let working_days: Vec<String> = working_days_text
            .split(',')
            .map(str::trim)
            .filter(|day| !day.is_empty())
            .map(str::to_owned)
            .collect();
        Ok(WorkSettings {
            weekly_target_minutes: row.get(0),
            working_days: if working_days.is_empty() {
                DEFAULT_WORKING_DAYS
                    .iter()
                    .map(|day| (*day).to_owned())
                    .collect()
            } else {
                working_days
            },
            week_starts_on: row.get(2),
        })
    }

    fn write_settings(
        &self,
        user_id: i64,
        settings: &WorkSettings,
    ) -> Result<WorkSettings, StoreError> {
        let mut client = self.conn()?;
        client.execute(
            "INSERT INTO work_settings (user_id, weekly_target_minutes, working_days, week_starts_on)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (user_id) DO UPDATE
             SET weekly_target_minutes = $2, working_days = $3, week_starts_on = $4",
            &[
                &user_id,
                &settings.weekly_target_minutes,
                &settings.working_days.join(","),
                &settings.week_starts_on,
            ],
        )?;
        drop(client);
        self.read_settings(user_id)
    }

    fn read_app_version(&self) -> Result<Option<String>, StoreError> {
        let mut client = self.conn()?;
        Ok(client
            .query_opt(
                "SELECT value FROM app_metadata WHERE key = 'app_version'",
                &[],
            )?
            .map(|row| row.get(0)))
    }

    fn read_user(&self, id: i64) -> Result<Option<User>, StoreError> {
        let mut client = self.conn()?;
        Ok(client
            .query_opt(
                "SELECT id, email, created_at FROM users WHERE id = $1",
                &[&id],
            )?
            .map(|row| User {
                id: row.get(0),
                email: row.get(1),
                created_at: row.get(2),
            }))
    }

    fn read_password_hash(&self, email: &str) -> Result<Option<(i64, String)>, StoreError> {
        let mut client = self.conn()?;
        Ok(client
            .query_opt(
                "SELECT id, password_hash FROM users WHERE email = $1",
                &[&email],
            )?
            .map(|row| (row.get(0), row.get(1))))
    }

    fn register_user(&self, email: &str, password_hash: &str) -> Result<User, StoreError> {
        let mut client = self.conn()?;
        let mut transaction = client.transaction()?;
        let first_user: i64 = transaction
            .query_one("SELECT COUNT(*) FROM users", &[])?
            .get(0);
        let now = now_iso();
        let row = transaction.query_one(
            "INSERT INTO users (email, password_hash, created_at) VALUES ($1, $2, $3)
             RETURNING id, email, created_at",
            &[&email, &password_hash, &now],
        )?;
        let user = User {
            id: row.get(0),
            email: row.get(1),
            created_at: row.get(2),
        };
        if first_user == 0 {
            for table in [
                "projects",
                "time_entries",
                "project_budgets",
                "work_settings",
            ] {
                transaction.execute(
                    &format!("UPDATE {table} SET user_id = $1 WHERE user_id IS NULL"),
                    &[&user.id],
                )?;
            }
        }
        transaction.commit()?;
        Ok(user)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{SaveProject, SaveTimeEntry};
    use std::sync::atomic::{AtomicU64, Ordering};

    static NEXT_TEST_ID: AtomicU64 = AtomicU64::new(0);

    /// Reads `DATABASE_URL` for the integration tests below, so they only run
    /// when a real Postgres server is reachable (see README for how to start
    /// one via `podman compose --profile postgres up -d`).
    fn test_store() -> Option<PostgresStore> {
        let url = std::env::var("DATABASE_URL").ok()?;
        PostgresStore::connect(&url).ok()
    }

    fn unique_email() -> String {
        let id = NEXT_TEST_ID.fetch_add(1, Ordering::Relaxed);
        format!(
            "postgres-store-test-{}-{id}@example.com",
            std::process::id()
        )
    }

    #[test]
    #[ignore = "requires a reachable Postgres (DATABASE_URL)"]
    fn maps_a_duplicate_email_to_a_unique_violation() {
        let Some(store) = test_store() else {
            eprintln!("skipping: DATABASE_URL is not reachable");
            return;
        };
        let email = unique_email();
        store.register_user(&email, "hash-one").unwrap();

        let error = store.register_user(&email, "hash-two").unwrap_err();

        assert!(matches!(error, StoreError::UniqueViolation));
    }

    #[test]
    #[ignore = "requires a reachable Postgres (DATABASE_URL)"]
    fn round_trips_a_project_through_postgres() {
        let Some(store) = test_store() else {
            eprintln!("skipping: DATABASE_URL is not reachable");
            return;
        };
        let user = store.register_user(&unique_email(), "hash").unwrap();

        let created = store
            .insert_project(
                user.id,
                &SaveProject {
                    name: "Postgres project".into(),
                    description: None,
                    color: "#336699".into(),
                    active: true,
                },
            )
            .unwrap();
        assert_eq!(created.name, "Postgres project");
        // ISO 8601 UTC with milliseconds, matching the SQLite backend's format.
        assert!(created.created_at.ends_with('Z'));

        let listed = store.list_projects(user.id).unwrap();
        assert!(listed.iter().any(|project| project.id == created.id));

        store.delete_project(created.id, user.id).unwrap();
        assert!(store.list_projects(user.id).unwrap().is_empty());
    }

    #[test]
    #[ignore = "requires a reachable Postgres (DATABASE_URL)"]
    fn detects_overlapping_time_entries() {
        let Some(store) = test_store() else {
            eprintln!("skipping: DATABASE_URL is not reachable");
            return;
        };
        let user = store.register_user(&unique_email(), "hash").unwrap();
        let project = store
            .insert_project(
                user.id,
                &SaveProject {
                    name: "Overlap project".into(),
                    description: None,
                    color: "#336699".into(),
                    active: true,
                },
            )
            .unwrap();

        store
            .create_time_entry(
                user.id,
                &SaveTimeEntry {
                    project_id: Some(project.id),
                    start_time: "2024-01-01T09:00:00.000Z".into(),
                    end_time: Some("2024-01-01T10:00:00.000Z".into()),
                    note: None,
                },
            )
            .unwrap();

        let error = store
            .create_time_entry(
                user.id,
                &SaveTimeEntry {
                    project_id: Some(project.id),
                    start_time: "2024-01-01T09:30:00.000Z".into(),
                    end_time: Some("2024-01-01T10:30:00.000Z".into()),
                    note: None,
                },
            )
            .unwrap_err();

        assert!(matches!(error, TimeEntryWriteError::Overlap));
    }
}

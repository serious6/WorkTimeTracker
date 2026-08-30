use chrono::{DateTime, NaiveDate, SecondsFormat};
use serde::{Deserialize, Serialize};

const MAX_NAME: usize = 100;
const MAX_DESCRIPTION: usize = 500;
const MAX_NOTE: usize = 500;

fn normalize(value: &mut String) {
    *value = value.trim().to_owned();
}

fn normalize_optional(value: &mut Option<String>) {
    *value = value
        .take()
        .map(|text| text.trim().to_owned())
        .filter(|text| !text.is_empty());
}

fn is_timestamp(value: &str) -> bool {
    DateTime::parse_from_rfc3339(value)
        .is_ok_and(|date| date.to_utc().to_rfc3339_opts(SecondsFormat::Millis, true) == value)
}

fn is_color(value: &str) -> bool {
    value.len() == 7
        && value.starts_with('#')
        && value[1..].chars().all(|char| char.is_ascii_hexdigit())
}

fn is_date(value: &str) -> bool {
    NaiveDate::parse_from_str(value, "%Y-%m-%d").is_ok_and(|date| date.to_string() == value)
}

const MAX_EMAIL: usize = 254;

/// Minimum length required by the password policy.
pub const MIN_PASSWORD_LENGTH: usize = 20;
/// Number of special characters required by the password policy.
pub const MIN_PASSWORD_SPECIAL_CHARACTERS: usize = 2;

fn is_email(value: &str) -> bool {
    let mut parts = value.split('@');
    let (Some(local), Some(domain), None) = (parts.next(), parts.next(), parts.next()) else {
        return false;
    };
    let mut labels = domain.split('.');
    !local.is_empty()
        && domain.contains('.')
        && labels.all(|label| !label.is_empty())
        && !value.chars().any(char::is_whitespace)
        && value.len() <= MAX_EMAIL
}

fn is_special(character: char) -> bool {
    !character.is_alphanumeric() && !character.is_whitespace()
}

/// Mirrors the policy that the user creation page validates while typing.
pub fn check_password_policy(password: &str) -> Result<(), &'static str> {
    if password.chars().count() < MIN_PASSWORD_LENGTH {
        return Err("password must have at least 20 characters");
    }
    if !password.chars().any(char::is_uppercase) {
        return Err("password must contain an uppercase letter");
    }
    if !password.chars().any(char::is_lowercase) {
        return Err("password must contain a lowercase letter");
    }
    if password
        .chars()
        .filter(|character| is_special(*character))
        .count()
        < MIN_PASSWORD_SPECIAL_CHARACTERS
    {
        return Err("password must contain at least two special characters");
    }
    Ok(())
}

/// Login and registration input. The password is only used to derive a hash.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Credentials {
    pub email: String,
    pub password: String,
}

impl Credentials {
    pub fn validate(&mut self) -> Result<(), &'static str> {
        normalize(&mut self.email);
        self.email = self.email.to_lowercase();
        if !is_email(&self.email) {
            return Err("invalid email");
        }
        if self.password.is_empty() {
            return Err("password is required");
        }
        Ok(())
    }

    pub fn validate_registration(&mut self) -> Result<(), &'static str> {
        self.validate()?;
        check_password_policy(&self.password)
    }
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct User {
    pub id: i64,
    pub email: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveProject {
    pub name: String,
    pub description: Option<String>,
    pub color: String,
    pub active: bool,
}

impl SaveProject {
    pub fn validate(&mut self) -> Result<(), &'static str> {
        normalize(&mut self.name);
        normalize(&mut self.color);
        normalize_optional(&mut self.description);
        if self.name.is_empty() || self.name.chars().count() > MAX_NAME {
            return Err("invalid project name");
        }
        if !is_color(&self.color) {
            return Err("invalid project color");
        }
        if self
            .description
            .as_ref()
            .is_some_and(|text| text.chars().count() > MAX_DESCRIPTION)
        {
            return Err("invalid project description");
        }
        Ok(())
    }
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub color: String,
    pub active: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveTimeEntry {
    pub project_id: Option<i64>,
    pub start_time: String,
    pub end_time: Option<String>,
    pub note: Option<String>,
}

impl SaveTimeEntry {
    pub fn validate(&mut self) -> Result<(), &'static str> {
        normalize(&mut self.start_time);
        normalize_optional(&mut self.end_time);
        normalize_optional(&mut self.note);
        if self.project_id.is_some_and(|project_id| project_id <= 0) {
            return Err("invalid project");
        }
        if !is_timestamp(&self.start_time) {
            return Err("invalid start time");
        }
        if let Some(end_time) = &self.end_time {
            if !is_timestamp(end_time) {
                return Err("invalid end time");
            }
            if end_time.as_str() <= self.start_time.as_str() {
                return Err("end time must be later than start time");
            }
        }
        if self
            .note
            .as_ref()
            .is_some_and(|note| note.chars().count() > MAX_NOTE)
        {
            return Err("invalid note");
        }
        Ok(())
    }
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeEntry {
    pub id: i64,
    pub project_id: Option<i64>,
    pub start_time: String,
    pub end_time: Option<String>,
    pub note: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// One recorded change of a time entry. Values are JSON snapshots of the entry.
#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditLogEntry {
    pub id: i64,
    pub entity: String,
    pub entity_id: i64,
    pub action: String,
    pub old_value: Option<String>,
    pub new_value: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveProjectBudget {
    pub project_id: i64,
    pub budget_minutes: i64,
    pub due_date: String,
}

impl SaveProjectBudget {
    pub fn validate(&mut self) -> Result<(), &'static str> {
        normalize(&mut self.due_date);
        if self.project_id <= 0 {
            return Err("invalid project");
        }
        if self.budget_minutes <= 0 {
            return Err("budget must be greater than zero");
        }
        if !is_date(&self.due_date) {
            return Err("invalid due date");
        }
        Ok(())
    }
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectBudget {
    pub id: i64,
    pub project_id: i64,
    pub budget_minutes: i64,
    pub due_date: String,
    pub created_at: String,
    pub updated_at: String,
}

pub const WEEKDAYS: [&str; 7] = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
];

pub const DEFAULT_WORKING_DAYS: [&str; 5] =
    ["monday", "tuesday", "wednesday", "thursday", "friday"];

/// General settings of the application, persisted as a single record.
#[derive(Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkSettings {
    pub weekly_target_minutes: i64,
    pub working_days: Vec<String>,
    pub week_starts_on: String,
}

impl WorkSettings {
    pub fn validate(&mut self) -> Result<(), &'static str> {
        normalize(&mut self.week_starts_on);
        for day in &mut self.working_days {
            normalize(day);
        }
        if self
            .working_days
            .iter()
            .any(|day| !WEEKDAYS.contains(&day.as_str()))
        {
            return Err("invalid working day");
        }
        self.working_days = WEEKDAYS
            .iter()
            .filter(|day| self.working_days.iter().any(|selected| selected == *day))
            .map(|day| (*day).to_owned())
            .collect();
        if self.working_days.is_empty() {
            return Err("select at least one working day");
        }
        if !(1..=10_080).contains(&self.weekly_target_minutes)
            || !matches!(self.week_starts_on.as_str(), "monday" | "sunday")
        {
            return Err("invalid work settings");
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_and_normalizes_project_input() {
        let mut input = SaveProject {
            name: " Website Redesign ".into(),
            description: Some("  ".into()),
            color: "#22c55e".into(),
            active: true,
        };
        input.validate().unwrap();
        assert_eq!(input.name, "Website Redesign");
        assert_eq!(input.description, None);
    }

    #[test]
    fn rejects_projects_without_a_hex_color() {
        let mut input = SaveProject {
            name: "Project".into(),
            description: None,
            color: "green".into(),
            active: true,
        };
        assert!(input.validate().is_err());
    }

    #[test]
    fn rejects_entries_that_end_before_they_start() {
        let mut input = SaveTimeEntry {
            project_id: Some(1),
            start_time: "2026-08-27T10:00:00.000Z".into(),
            end_time: Some("2026-08-27T09:00:00.000Z".into()),
            note: None,
        };
        assert_eq!(
            input.validate(),
            Err("end time must be later than start time")
        );
    }

    #[test]
    fn accepts_a_running_entry_without_an_end_time() {
        let mut input = SaveTimeEntry {
            project_id: Some(1),
            start_time: "2026-08-27T10:00:00.000Z".into(),
            end_time: None,
            note: Some(" Design ".into()),
        };
        input.validate().unwrap();
        assert_eq!(input.note.as_deref(), Some("Design"));
    }

    #[test]
    fn rejects_malformed_timestamp_strings() {
        let mut input = SaveTimeEntry {
            project_id: Some(1),
            start_time: "xxxxxxxxxxxxTxxxxxxxxxxZ".into(),
            end_time: None,
            note: None,
        };

        assert_eq!(input.validate(), Err("invalid start time"));
    }

    #[test]
    fn validates_project_budget_input() {
        let mut input = SaveProjectBudget {
            project_id: 1,
            budget_minutes: 4_800,
            due_date: " 2026-12-31 ".into(),
        };
        input.validate().unwrap();
        assert_eq!(input.due_date, "2026-12-31");
    }

    #[test]
    fn rejects_invalid_project_budgets() {
        let budget = |project_id, budget_minutes, due_date: &str| {
            SaveProjectBudget {
                project_id,
                budget_minutes,
                due_date: due_date.into(),
            }
            .validate()
        };

        assert_eq!(budget(0, 60, "2026-12-31"), Err("invalid project"));
        assert_eq!(
            budget(1, 0, "2026-12-31"),
            Err("budget must be greater than zero")
        );
        assert_eq!(budget(1, 60, "2026-13-31"), Err("invalid due date"));
    }

    fn settings(weekly_target_minutes: i64, working_days: &[&str]) -> WorkSettings {
        WorkSettings {
            weekly_target_minutes,
            working_days: working_days.iter().map(|day| (*day).to_owned()).collect(),
            week_starts_on: "monday".into(),
        }
    }

    #[test]
    fn rejects_settings_outside_the_supported_range() {
        assert!(settings(0, &DEFAULT_WORKING_DAYS).validate().is_err());
    }

    #[test]
    fn rejects_an_empty_working_day_selection() {
        assert_eq!(
            settings(2_400, &[]).validate(),
            Err("select at least one working day")
        );
    }

    #[test]
    fn sorts_and_deduplicates_working_days() {
        let mut input = settings(2_400, &["sunday", " monday ", "monday"]);
        input.validate().unwrap();
        assert_eq!(input.working_days, vec!["monday", "sunday"]);
    }

    #[test]
    fn rejects_unknown_working_days() {
        assert_eq!(
            settings(2_400, &["someday"]).validate(),
            Err("invalid working day")
        );
    }

    fn credentials(email: &str, password: &str) -> Credentials {
        Credentials {
            email: email.into(),
            password: password.into(),
        }
    }

    #[test]
    fn normalizes_the_email_of_credentials() {
        let mut input = credentials(" User@Example.COM ", "secret");
        input.validate().unwrap();
        assert_eq!(input.email, "user@example.com");
    }

    #[test]
    fn rejects_malformed_emails() {
        for email in [
            "user",
            "user@example",
            "user@@example.com",
            "@example.com",
            "user@example..com",
            "user@.example.com",
        ] {
            assert_eq!(
                credentials(email, "secret").validate(),
                Err("invalid email"),
                "{email}"
            );
        }
    }

    #[test]
    fn accepts_a_policy_compliant_password() {
        check_password_policy("Str0ng-Passphrase!!x").unwrap();
    }

    #[test]
    fn rejects_passwords_that_break_the_policy() {
        assert_eq!(
            check_password_policy("Short!!a"),
            Err("password must have at least 20 characters")
        );
        assert_eq!(
            check_password_policy("str0ng-passphrase!!x"),
            Err("password must contain an uppercase letter")
        );
        assert_eq!(
            check_password_policy("STR0NG-PASSPHRASE!!X"),
            Err("password must contain a lowercase letter")
        );
        assert_eq!(
            check_password_policy("Str0ngPassphrase!xxxx"),
            Err("password must contain at least two special characters")
        );
    }

    #[test]
    fn rejects_registrations_that_break_the_password_policy() {
        assert_eq!(
            credentials("user@example.com", "secret").validate_registration(),
            Err("password must have at least 20 characters")
        );
    }
}

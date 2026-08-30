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

/// Rows a list command returns when the caller names no limit.
pub const DEFAULT_LIST_LIMIT: i64 = 1000;
/// Hard ceiling of a list command, a larger limit is capped to it.
pub const MAX_LIST_LIMIT: i64 = 5000;
/// Rows the combined audit log returns, it only feeds the recent-changes card.
pub const AUDIT_LOG_LIMIT: i64 = 200;

/// Window of a list command: `from` is inclusive, `to` is exclusive, both an
/// ISO date or timestamp. Without a window the command still answers at most
/// [`DEFAULT_LIST_LIMIT`] rows, so the cost of a list never grows with the age
/// of the account. `contract/domain-rules.json` pins all three numbers.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListRange {
    pub from: Option<String>,
    pub to: Option<String>,
    pub limit: Option<i64>,
}

fn is_range_bound(value: &str) -> bool {
    value.len() >= 10 && value.is_char_boundary(10) && is_date(&value[..10])
}

impl ListRange {
    pub fn validate(&mut self) -> Result<(), &'static str> {
        normalize_optional(&mut self.from);
        normalize_optional(&mut self.to);
        if [&self.from, &self.to]
            .into_iter()
            .flatten()
            .any(|bound| !is_range_bound(bound))
        {
            return Err("invalid list range");
        }
        if let (Some(from), Some(to)) = (&self.from, &self.to) {
            if from > to {
                return Err("invalid list range");
            }
        }
        if self.limit.is_some_and(|limit| limit <= 0) {
            return Err("invalid list range");
        }
        Ok(())
    }

    /// The bounded number of rows, never above [`MAX_LIST_LIMIT`].
    pub fn limit(&self) -> i64 {
        self.limit.unwrap_or(DEFAULT_LIST_LIMIT).min(MAX_LIST_LIMIT)
    }
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

/// Working time and break time are recorded as entries of the same table.
pub const ENTRY_TYPE_WORK: &str = "work";
pub const ENTRY_TYPE_BREAK: &str = "break";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveTimeEntry {
    pub project_id: Option<i64>,
    pub start_time: String,
    pub end_time: Option<String>,
    /// Missing input records work, breaks have to be requested explicitly.
    #[serde(default)]
    pub entry_type: Option<String>,
    pub note: Option<String>,
}

impl SaveTimeEntry {
    /// The requested kind of entry, `work` unless a break was requested.
    pub fn entry_type(&self) -> &str {
        self.entry_type.as_deref().unwrap_or(ENTRY_TYPE_WORK)
    }

    pub fn is_break(&self) -> bool {
        self.entry_type() == ENTRY_TYPE_BREAK
    }

    pub fn validate(&mut self) -> Result<(), &'static str> {
        normalize(&mut self.start_time);
        normalize_optional(&mut self.end_time);
        normalize_optional(&mut self.note);
        normalize_optional(&mut self.entry_type);
        if !matches!(self.entry_type(), ENTRY_TYPE_WORK | ENTRY_TYPE_BREAK) {
            return Err("invalid entry type");
        }
        if self.is_break() && self.project_id.is_some() {
            return Err("a break is not booked on a project");
        }
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
    pub entry_type: String,
    pub note: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Append-only trail of every change to a time entry.
#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeEntryAudit {
    pub id: i64,
    pub time_entry_id: i64,
    pub action: String,
    pub actor: String,
    pub old_value: Option<String>,
    pub new_value: Option<String>,
    pub recorded_at: String,
}

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

/// Reasons that excuse a day from the working-time target.
pub const ABSENCE_TYPES: [&str; 4] = ["vacation", "sick", "unpaid", "halfDay"];

/// The only absence type that keeps part of the target.
pub const HALF_DAY_ABSENCE: &str = "halfDay";

/// Target of a day after an absence: a full-day absence neutralises it, a half
/// day halves it rounded to whole minutes. A day outside the schedule has no
/// target, so marking it as an absence changes nothing.
///
/// `adjustedDailyTarget` in `src/features/settings/work-schedule.ts` implements
/// the same rule; both sides are driven by `contract/domain-rules.json`.
pub fn adjusted_daily_target(daily_target: f64, working_day: bool, absence: Option<&str>) -> f64 {
    if !working_day {
        return 0.0;
    }
    match absence {
        None => daily_target,
        Some(HALF_DAY_ABSENCE) => (daily_target / 2.0).round(),
        Some(_) => 0.0,
    }
}

/// A single day excused from the working-time target. A range is stored as one
/// record per day, so a day can never carry two absences.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveAbsence {
    #[serde(rename = "type")]
    pub absence_type: String,
    pub date: String,
}

impl SaveAbsence {
    pub fn validate(&mut self) -> Result<(), &'static str> {
        normalize(&mut self.absence_type);
        normalize(&mut self.date);
        if !ABSENCE_TYPES.contains(&self.absence_type.as_str()) {
            return Err("invalid absence type");
        }
        if !is_date(&self.date) {
            return Err("invalid absence date");
        }
        Ok(())
    }

    /// A saved range must hold at least one day, every day must be valid and no
    /// day may repeat, because one day can only carry one absence.
    pub fn validate_range(inputs: &mut [SaveAbsence]) -> Result<(), &'static str> {
        if inputs.is_empty() {
            return Err("invalid absence range");
        }
        for input in inputs.iter_mut() {
            input.validate().map_err(|_| "invalid absence range")?;
        }
        let days: std::collections::HashSet<&str> =
            inputs.iter().map(|input| input.date.as_str()).collect();
        if days.len() != inputs.len() {
            return Err("invalid absence range");
        }
        Ok(())
    }
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Absence {
    pub id: i64,
    #[serde(rename = "type")]
    pub absence_type: String,
    pub date: String,
    pub created_at: String,
    pub updated_at: String,
}

/// Audit record of one change to an absence, kept after the absence is gone.
#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AbsenceAudit {
    pub id: i64,
    pub absence_id: i64,
    pub action: String,
    pub actor: String,
    pub old_value: Option<String>,
    pub new_value: Option<String>,
    pub recorded_at: String,
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

/// Legal limits behind the compliance warnings. The defaults follow the German
/// ArbZG and are restored from the settings.
#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ComplianceLimits {
    pub break_threshold_minutes: i64,
    pub required_break_minutes: i64,
    pub long_break_threshold_minutes: i64,
    pub required_long_break_minutes: i64,
    pub min_break_block_minutes: i64,
    pub max_continuous_work_minutes: i64,
    pub max_daily_work_minutes: i64,
    pub min_rest_minutes: i64,
}

pub const GERMAN_COMPLIANCE_LIMITS: ComplianceLimits = ComplianceLimits {
    break_threshold_minutes: 360,
    required_break_minutes: 30,
    long_break_threshold_minutes: 540,
    required_long_break_minutes: 45,
    min_break_block_minutes: 15,
    max_continuous_work_minutes: 360,
    max_daily_work_minutes: 600,
    min_rest_minutes: 660,
};

impl Default for ComplianceLimits {
    fn default() -> Self {
        GERMAN_COMPLIANCE_LIMITS
    }
}

impl ComplianceLimits {
    fn values(&self) -> [i64; 8] {
        [
            self.break_threshold_minutes,
            self.required_break_minutes,
            self.long_break_threshold_minutes,
            self.required_long_break_minutes,
            self.min_break_block_minutes,
            self.max_continuous_work_minutes,
            self.max_daily_work_minutes,
            self.min_rest_minutes,
        ]
    }

    pub fn validate(&self) -> Result<(), &'static str> {
        if self
            .values()
            .iter()
            .any(|value| !(1..=1_440).contains(value))
        {
            return Err("invalid working time limit");
        }
        if self.long_break_threshold_minutes < self.break_threshold_minutes
            || self.required_long_break_minutes < self.required_break_minutes
        {
            return Err("invalid working time limit order");
        }
        Ok(())
    }
}

/// General settings of the application, persisted as a single record.
#[derive(Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkSettings {
    pub weekly_target_minutes: i64,
    pub working_days: Vec<String>,
    pub week_starts_on: String,
    #[serde(default)]
    pub compliance_limits: ComplianceLimits,
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
        self.compliance_limits.validate()
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
            entry_type: None,
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
            entry_type: None,
            note: Some(" Design ".into()),
        };
        input.validate().unwrap();
        assert_eq!(input.note.as_deref(), Some("Design"));
        assert_eq!(input.entry_type(), ENTRY_TYPE_WORK);
    }

    #[test]
    fn accepts_a_break_without_a_project() {
        let mut input = SaveTimeEntry {
            project_id: None,
            start_time: "2026-08-27T12:00:00.000Z".into(),
            end_time: Some("2026-08-27T12:30:00.000Z".into()),
            entry_type: Some(" break ".into()),
            note: None,
        };
        input.validate().unwrap();
        assert!(input.is_break());
    }

    #[test]
    fn rejects_breaks_that_are_booked_on_a_project() {
        let mut input = SaveTimeEntry {
            project_id: Some(1),
            start_time: "2026-08-27T12:00:00.000Z".into(),
            end_time: Some("2026-08-27T12:30:00.000Z".into()),
            entry_type: Some(ENTRY_TYPE_BREAK.into()),
            note: None,
        };
        assert_eq!(input.validate(), Err("a break is not booked on a project"));
    }

    #[test]
    fn rejects_an_unknown_entry_type() {
        let mut input = SaveTimeEntry {
            project_id: Some(1),
            start_time: "2026-08-27T12:00:00.000Z".into(),
            end_time: None,
            entry_type: Some("holiday".into()),
            note: None,
        };
        assert_eq!(input.validate(), Err("invalid entry type"));
    }

    #[test]
    fn rejects_malformed_timestamp_strings() {
        let mut input = SaveTimeEntry {
            project_id: Some(1),
            start_time: "xxxxxxxxxxxxTxxxxxxxxxxZ".into(),
            end_time: None,
            entry_type: None,
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

    #[test]
    fn validates_and_normalizes_absence_input() {
        let mut input = SaveAbsence {
            absence_type: " vacation ".into(),
            date: " 2026-09-01 ".into(),
        };
        input.validate().unwrap();
        assert_eq!(input.absence_type, "vacation");
        assert_eq!(input.date, "2026-09-01");
    }

    #[test]
    fn rejects_invalid_absences() {
        let absence = |absence_type: &str, date: &str| {
            SaveAbsence {
                absence_type: absence_type.into(),
                date: date.into(),
            }
            .validate()
        };

        assert_eq!(
            absence("holiday", "2026-09-01"),
            Err("invalid absence type")
        );
        assert_eq!(
            absence("vacation", "2026-02-30"),
            Err("invalid absence date")
        );
        assert_eq!(
            absence("vacation", "01.09.2026"),
            Err("invalid absence date")
        );
    }

    #[test]
    fn bounds_and_validates_a_list_range() {
        let range = |from: Option<&str>, to: Option<&str>, limit: Option<i64>| {
            let mut range = ListRange {
                from: from.map(str::to_owned),
                to: to.map(str::to_owned),
                limit,
            };
            range.validate().map(|()| range)
        };

        assert_eq!(range(None, None, None).unwrap().limit(), DEFAULT_LIST_LIMIT);
        assert_eq!(
            range(None, None, Some(MAX_LIST_LIMIT + 1)).unwrap().limit(),
            MAX_LIST_LIMIT
        );
        assert_eq!(range(None, None, Some(10)).unwrap().limit(), 10);

        let window = range(Some(" 2026-09-01 "), Some("2026-10-01T00:00:00.000Z"), None).unwrap();
        assert_eq!(window.from.as_deref(), Some("2026-09-01"));

        assert!(range(Some("2026-13-01"), None, None).is_err());
        assert!(range(Some("2026-10-01"), Some("2026-09-01"), None).is_err());
        assert!(range(None, None, Some(0)).is_err());
    }

    #[test]
    fn rejects_an_invalid_absence_range() {
        let range = |days: &[(&str, &str)]| {
            let mut inputs: Vec<SaveAbsence> = days
                .iter()
                .map(|(absence_type, date)| SaveAbsence {
                    absence_type: (*absence_type).into(),
                    date: (*date).into(),
                })
                .collect();
            SaveAbsence::validate_range(&mut inputs)
        };

        assert_eq!(range(&[]), Err("invalid absence range"));
        assert_eq!(
            range(&[("vacation", "2026-09-01"), ("sick", "2026-09-01")]),
            Err("invalid absence range"),
            "a day can only carry one absence"
        );
        assert_eq!(
            range(&[("holiday", "2026-09-01")]),
            Err("invalid absence range")
        );
        assert_eq!(
            range(&[("vacation", " 2026-09-01 "), ("sick", "2026-09-02")]),
            Ok(())
        );
    }

    #[test]
    fn neutralises_the_target_of_an_absence_day() {
        assert_eq!(adjusted_daily_target(480.0, true, None), 480.0);
        assert_eq!(adjusted_daily_target(480.0, true, Some("vacation")), 0.0);
        assert_eq!(adjusted_daily_target(480.0, true, Some("sick")), 0.0);
        assert_eq!(adjusted_daily_target(480.0, true, Some("unpaid")), 0.0);
        assert_eq!(adjusted_daily_target(480.0, true, Some("halfDay")), 240.0);
        assert_eq!(adjusted_daily_target(461.0, true, Some("halfDay")), 231.0);
        assert_eq!(adjusted_daily_target(480.0, false, Some("vacation")), 0.0);
        assert_eq!(adjusted_daily_target(480.0, false, None), 0.0);
    }

    fn settings(weekly_target_minutes: i64, working_days: &[&str]) -> WorkSettings {
        WorkSettings {
            weekly_target_minutes,
            working_days: working_days.iter().map(|day| (*day).to_owned()).collect(),
            week_starts_on: "monday".into(),
            compliance_limits: GERMAN_COMPLIANCE_LIMITS,
        }
    }

    #[test]
    fn rejects_working_time_limits_outside_the_supported_range() {
        let mut input = settings(2_400, &DEFAULT_WORKING_DAYS);
        input.compliance_limits.max_daily_work_minutes = 0;
        assert_eq!(input.validate(), Err("invalid working time limit"));
    }

    #[test]
    fn rejects_a_long_break_below_the_short_break() {
        let mut input = settings(2_400, &DEFAULT_WORKING_DAYS);
        input.compliance_limits.required_long_break_minutes = 15;
        assert_eq!(input.validate(), Err("invalid working time limit order"));
    }

    #[test]
    fn defaults_the_working_time_limits_to_german_law() {
        assert_eq!(ComplianceLimits::default(), GERMAN_COMPLIANCE_LIMITS);
        assert_eq!(GERMAN_COMPLIANCE_LIMITS.validate(), Ok(()));
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

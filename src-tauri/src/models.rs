use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTimeEntry {
    pub project: String,
    pub duration_minutes: i64,
    pub notes: Option<String>,
}

impl CreateTimeEntry {
    pub fn validate(&mut self) -> Result<(), &'static str> {
        self.project = self.project.trim().to_owned();
        self.notes = self.notes.take().map(|notes| notes.trim().to_owned());
        if self.project.is_empty()
            || self.project.chars().count() > 100
            || !(1..=1_440).contains(&self.duration_minutes)
            || self
                .notes
                .as_ref()
                .is_some_and(|notes| notes.chars().count() > 500)
        {
            return Err("invalid time entry");
        }
        Ok(())
    }
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeEntry {
    pub id: i64,
    pub project: String,
    pub started_at: String,
    pub ended_at: String,
    pub duration_minutes: i64,
    pub notes: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_and_normalizes_command_input() {
        let mut input = CreateTimeEntry {
            project: " Project ".into(),
            duration_minutes: 30,
            notes: Some(" Notes ".into()),
        };
        input.validate().unwrap();
        assert_eq!(input.project, "Project");
        assert_eq!(input.notes.as_deref(), Some("Notes"));
    }

    #[test]
    fn rejects_input_outside_schema_limits() {
        let mut input = CreateTimeEntry {
            project: "a".repeat(101),
            duration_minutes: 1_441,
            notes: None,
        };
        assert!(input.validate().is_err());
    }
}

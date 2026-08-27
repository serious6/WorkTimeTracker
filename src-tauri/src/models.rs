use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTimeEntry {
    pub project: String,
    pub duration_minutes: i64,
    pub notes: Option<String>,
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

#![no_main]

use arbitrary::Arbitrary;
use chrono::{DateTime, NaiveDate, SecondsFormat};
use libfuzzer_sys::fuzz_target;
use work_time_tracker_lib::fuzzing::{SaveAbsence, SaveProject, SaveTimeEntry};

/// Length of a canonical UTC timestamp, `2026-08-27T08:00:00.000Z`.
const TIMESTAMP_LENGTH: usize = 24;

#[derive(Arbitrary, Debug)]
struct Input {
    project_id: Option<i64>,
    start_time: String,
    end_time: Option<String>,
    entry_type: Option<String>,
    note: Option<String>,
    name: String,
    description: Option<String>,
    color: String,
    absence_type: String,
    date: String,
}

/// Re-derives the timestamp rule of `models.rs` instead of calling it: a value
/// is only canonical when parsing and formatting it again yields the very same
/// text, so no second spelling of an instant can reach the database.
fn is_canonical_timestamp(value: &str) -> bool {
    DateTime::parse_from_rfc3339(value)
        .is_ok_and(|date| date.to_utc().to_rfc3339_opts(SecondsFormat::Millis, true) == value)
}

fn check_time_entry(input: &Input) {
    let mut entry = SaveTimeEntry {
        project_id: input.project_id,
        start_time: input.start_time.clone(),
        end_time: input.end_time.clone(),
        entry_type: input.entry_type.clone(),
        note: input.note.clone(),
    };
    if entry.validate().is_err() {
        return;
    }

    assert!(
        is_canonical_timestamp(&entry.start_time),
        "accepted a start time that is no canonical UTC timestamp: {:?}",
        entry.start_time
    );
    assert!(
        matches!(entry.entry_type(), "work" | "break"),
        "accepted an unknown entry type"
    );
    assert!(
        !entry.is_break() || entry.project_id.is_none(),
        "accepted a break that is booked on a project"
    );
    assert!(
        entry.project_id.is_none_or(|project_id| project_id > 0),
        "accepted a project reference that cannot exist"
    );

    if let Some(end_time) = entry.end_time.clone() {
        assert!(
            is_canonical_timestamp(&end_time),
            "accepted an end time that is no canonical UTC timestamp: {end_time:?}"
        );
        // Ranges are compared as text in SQL, so text order has to agree with
        // time order for every pair of timestamps the validator lets through.
        if end_time.len() == TIMESTAMP_LENGTH && entry.start_time.len() == TIMESTAMP_LENGTH {
            let start = DateTime::parse_from_rfc3339(&entry.start_time).expect("canonical start");
            let end = DateTime::parse_from_rfc3339(&end_time).expect("canonical end");
            assert!(end > start, "accepted an entry that ends before it starts");
        }
    }

    if let Some(note) = &entry.note {
        assert!(!note.is_empty(), "kept an empty note instead of dropping it");
        assert_eq!(note.trim(), note, "kept an untrimmed note");
        assert!(note.chars().count() <= 500, "kept an oversized note");
    }

    // Validation runs again on the stored value in some paths, so normalizing
    // an already normalized input must neither change nor reject it.
    let normalized = format!("{entry:?}");
    assert!(entry.validate().is_ok(), "rejected its own normalized input");
    assert_eq!(format!("{entry:?}"), normalized, "normalization is not stable");
}

fn check_project(input: &Input) {
    let mut project = SaveProject {
        name: input.name.clone(),
        description: input.description.clone(),
        color: input.color.clone(),
        active: true,
        archived: false,
    };
    if project.validate().is_err() {
        return;
    }

    assert!(!project.name.is_empty(), "accepted an empty project name");
    assert_eq!(project.name.trim(), project.name, "kept an untrimmed name");
    assert!(
        project.name.chars().count() <= 100,
        "accepted an oversized project name"
    );
    assert!(
        project.color.len() == 7
            && project.color.starts_with('#')
            && project.color[1..].chars().all(|c| c.is_ascii_hexdigit()),
        "accepted a colour that is no `#rrggbb` value: {:?}",
        project.color
    );
    assert!(
        project
            .description
            .as_ref()
            .is_none_or(|text| !text.is_empty() && text.chars().count() <= 500),
        "kept an empty or oversized description"
    );
}

fn check_absence(input: &Input) {
    let mut absence = SaveAbsence {
        absence_type: input.absence_type.clone(),
        date: input.date.clone(),
    };
    if absence.validate().is_err() {
        return;
    }

    assert!(
        NaiveDate::parse_from_str(&absence.date, "%Y-%m-%d")
            .is_ok_and(|date| date.to_string() == absence.date),
        "accepted a date that is no calendar day: {:?}",
        absence.date
    );

    // One day carries at most one absence, so a range that repeats a day has
    // to be rejected however it was spelled.
    let mut range = [
        SaveAbsence {
            absence_type: absence.absence_type.clone(),
            date: absence.date.clone(),
        },
        SaveAbsence {
            absence_type: absence.absence_type.clone(),
            date: input.date.clone(),
        },
    ];
    assert!(
        SaveAbsence::validate_range(&mut range).is_err(),
        "accepted the same day twice in one range"
    );
}

// The `Save*` inputs are the outer edge of every write command: whatever the
// frontend sends is deserialized into them and only their validation stands
// between it and the database.
fuzz_target!(|input: Input| {
    check_time_entry(&input);
    check_project(&input);
    check_absence(&input);
});

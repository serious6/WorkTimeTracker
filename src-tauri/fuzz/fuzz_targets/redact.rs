#![no_main]

use libfuzzer_sys::fuzz_target;
use work_time_tracker_lib::fuzzing::{leaks_secret, redact, redact_keeping_layout};

// Redaction is the last thing that touches a message before it reaches the log
// file or an error dialog, and that message can be anything a driver, the
// operating system or a panic produced. So it has to hold for arbitrary text:
// never panic, never leave an e-mail address, password hash or path behind,
// and settle after one pass instead of changing on every further one.
fuzz_target!(|message: &str| {
    let redacted = redact(message);
    assert!(
        !leaks_secret(&redacted),
        "redact left a secret behind: {redacted:?}"
    );
    assert_eq!(
        redact(&redacted),
        redacted,
        "redact is not idempotent for {message:?}"
    );

    let kept = redact_keeping_layout(message);
    assert!(
        !leaks_secret(&kept),
        "redact_keeping_layout left a secret behind: {kept:?}"
    );
    assert_eq!(
        redact(&kept),
        redacted,
        "redact_keeping_layout redacted other tokens than redact for {message:?}"
    );
});

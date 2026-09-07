#![no_main]

use arbitrary::Arbitrary;
use libfuzzer_sys::fuzz_target;
use work_time_tracker_lib::fuzzing::redact_database_url;

#[derive(Arbitrary, Debug)]
struct Input<'a> {
    user: &'a str,
    password: &'a str,
    host: &'a str,
    /// Whatever the deployment put in the environment, including strings that
    /// are no connection string at all.
    raw: &'a str,
}

fuzz_target!(|input: Input| {
    // A connection URL ends up in start-up errors and in the log, so the
    // password must never survive redaction, whatever characters it holds.
    // The driver reads everything between `://` and the first `@` as the
    // credentials; a user or host that breaks that split is the caller's
    // error, not the redactor's, so those shapes are skipped.
    if !input.user.contains([':', '@', '/', '?'])
        && !input.password.contains('@')
        && !input.host.contains(['/', '?'])
    {
        let Input {
            user, password, host, ..
        } = input;
        let redacted = redact_database_url(&format!("postgres://{user}:{password}@{host}/app"));
        assert_eq!(
            redacted,
            format!("postgres://{user}:***@{host}/app"),
            "the password was not redacted as a whole"
        );
    }

    // Redaction also has to survive a value that is no URL: it must not panic
    // on a multi-byte boundary and must settle after one pass.
    let redacted = redact_database_url(input.raw);
    assert_eq!(
        redact_database_url(&redacted),
        redacted,
        "redact_database_url is not idempotent for {:?}",
        input.raw
    );
});

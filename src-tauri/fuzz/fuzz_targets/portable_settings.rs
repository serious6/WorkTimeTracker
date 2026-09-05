#![no_main]

use libfuzzer_sys::fuzz_target;
use work_time_tracker_lib::fuzzing::{parse_portable_settings, ENV_KEYS};

// `WorkTimeTracker.env` sits next to a portable installation, so its contents
// are whatever an editor, a deployment script or a broken transfer left there.
// Parsing it must not panic, must accept nothing but the settings the
// application knows, and must read the same file the same way twice.
fuzz_target!(|contents: &str| {
    let Some(settings) = parse_portable_settings(contents) else {
        return;
    };

    for (key, value) in &settings {
        assert!(
            ENV_KEYS.contains(&key.as_str()),
            "accepted the unknown setting {key:?}"
        );
        assert!(!value.is_empty(), "kept an empty value for {key:?}");
    }

    assert_eq!(
        parse_portable_settings(contents).as_ref(),
        Some(&settings),
        "the same file was read differently twice"
    );
});

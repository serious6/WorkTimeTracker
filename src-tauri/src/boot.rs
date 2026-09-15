//! The boot budget of the application and the measurement that guards it.
//!
//! The start has to reach the loading page of the window within one second,
//! measured from the launch of the process. The process start is taken as the
//! first statement of `run`, the window reports the paint of its loading page
//! through the `loading_page_shown` command, and the difference is written to
//! the log file. A run that misses the budget says so in the same line, so the
//! budget can be checked on every supported platform without a profiler.

use std::sync::OnceLock;
use std::time::{Duration, Instant};

/// The time the start may take from the launch of the process until the
/// loading page of the window is shown.
pub const BUDGET: Duration = Duration::from_millis(1000);

/// The launch of the process. Written once by [`mark_process_start`]; a later
/// call keeps the first value, so a measurement never restarts mid-run.
static PROCESS_START: OnceLock<Instant> = OnceLock::new();

/// Remembers the launch of the process as the start of the boot measurement.
pub fn mark_process_start() {
    let _ = PROCESS_START.set(Instant::now());
}

/// The time since the launch of the process, `None` outside a run that called
/// [`mark_process_start`], such as a test or a fuzz target.
pub fn since_process_start() -> Option<Duration> {
    PROCESS_START.get().map(Instant::elapsed)
}

/// The log line of a boot that reached its loading page.
fn loading_page_line(elapsed: Duration) -> String {
    let milliseconds = elapsed.as_millis();
    if elapsed > BUDGET {
        format!(
            "loading page shown after {milliseconds} ms, over the {} ms boot budget",
            BUDGET.as_millis()
        )
    } else {
        format!("loading page shown after {milliseconds} ms")
    }
}

/// Records that the window painted its loading page. Called once per run by the
/// window itself, because only the webview knows when its first frame is on
/// screen.
pub fn record_loading_page() {
    let Some(elapsed) = since_process_start() else {
        return;
    };
    crate::logging::info("boot", &loading_page_line(elapsed));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_budget_is_one_second() {
        assert_eq!(BUDGET, Duration::from_millis(1000));
    }

    #[test]
    fn reports_a_boot_inside_the_budget_without_a_complaint() {
        let line = loading_page_line(Duration::from_millis(420));

        assert_eq!(line, "loading page shown after 420 ms");
    }

    #[test]
    fn names_the_budget_a_slow_boot_missed() {
        let line = loading_page_line(BUDGET + Duration::from_millis(1));

        assert!(line.contains("1001 ms"), "{line}");
        assert!(line.contains("over the 1000 ms boot budget"), "{line}");
    }

    #[test]
    fn measures_from_the_marked_process_start() {
        mark_process_start();

        let first = since_process_start().expect("the process start is marked");
        // A second call must not restart the measurement, otherwise a boot
        // would always look fast.
        mark_process_start();
        let second = since_process_start().expect("the process start stays marked");

        assert!(second >= first, "{second:?} < {first:?}");
    }
}

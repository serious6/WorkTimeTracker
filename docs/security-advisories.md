# Security advisories

Known advisories against dependencies that cannot be resolved by an upgrade, with the reason why
they are accepted and the condition that lifts the exception.

## RUSTSEC-2024-0429 — `glib` `VariantStrIter` unsoundness

- **Advisory:** [RUSTSEC-2024-0429](https://rustsec.org/advisories/RUSTSEC-2024-0429),
  [GHSA-wrw7-89jp-8q8g](https://github.com/advisories/GHSA-wrw7-89jp-8q8g)
- **Affected:** `glib` >= 0.15.0, < 0.20.0 — patched in 0.20.0
- **In this project:** `glib` 0.18.5 (Linux only, transitive)

`VariantStrIter::impl_get` passed a `*mut c_char` out-argument to the variadic
`g_variant_get_child` as `&p` instead of `&mut p`. With optimizations the write through the shared
reference can be discarded, so `CStr::from_ptr` receives `NULL` and the iterator dereferences a
null pointer.

**Status: accepted, no upgrade available.**

`glib` 0.18 is pinned by the GTK 3 bindings that Tauri uses on Linux
(`tauri` → `gtk`/`webkit2gtk`/`wry` → `glib` `^0.18`). The fix was never backported: the 0.18 line
ends at 0.18.5, and moving to `glib` 0.20 requires the whole gtk-rs stack to move with it.

The unsound code is unreachable here. Neither this repository nor any crate in the dependency tree
constructs a `VariantStrIter` (`Variant::array_iter_str`); it is only reachable through
`Iterator`/`DoubleEndedIterator` on that type. Windows and macOS builds do not link `glib` at all.

**Re-evaluate when** Tauri ships a release whose Linux backend depends on `glib` >= 0.20; then drop
this entry and take the upgrade via the weekly `cargo` Dependabot group.

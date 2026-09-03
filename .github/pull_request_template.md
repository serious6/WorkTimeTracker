## Summary

<!-- What changes and why. Link the issue with "Closes #123". -->

## Checklist

- [ ] The pull request title follows Conventional Commits (see `CONTRIBUTING.md`); it becomes the squashed commit message.
- [ ] Unit tests added or updated for the new logic.
- [ ] End-to-end test added for user-facing behaviour (happy path and one failure case) and listed in `docs/e2e-test-cases.md`.
- [ ] `npm run lint`, `npm run typecheck`, `npm run test:coverage`, `npm run test:e2e`, `npm run architecture:check`, `npm run licenses:check` and `npm run build` pass locally.
- [ ] `cargo fmt --check` and `cargo test` pass for changes under `src-tauri/`.
- [ ] Documentation updated where the change invalidates it.
- [ ] A schema change updates the migration in `drizzle/`.

# GitHub Pages website

The static landing page lives in `docs/site/`. It has no build step, dependencies, or backend:
`index.html` contains the page content, `style.css` its responsive styles, and `releases.js`
renders releases using the small testable helpers in `release-data.js`.

At load time the page calls GitHub’s public Releases API for this repository. Successful responses are cached in `localStorage` for 20 minutes; a saved response is shown if a later request fails. The latest non-draft release and its assets are rendered at runtime, so publishing a release needs no website update. Installer platform labels are inferred from their filename. With no releases, the intentional “No releases yet” panel remains visible.

## Deploy

1. One-time setup: in GitHub open **Settings → Pages**, then set **Source** to
   **GitHub Actions**.
2. The workflow in [`.github/workflows/pages.yml`](../.github/workflows/pages.yml) deploys on
   pushes to `main` that touch `docs/site/**`, and it can also be started manually with
   **Run workflow** (`workflow_dispatch`).
3. The published URL is `https://serious6.github.io/WorkTimeTracker/`.
4. Only `docs/site/` is published; Markdown files under `docs/` are not part of the Pages
   artifact.

When changing page content, edit `docs/site/index.html`; keep release behavior in `releases.js`,
`release-data.js`, and the tests in `scripts/release-data.test.mjs`. The rendered page is covered
end to end by [`e2e/website.spec.ts`](../e2e/website.spec.ts), which serves `docs/site/` statically
and answers the Releases API itself. `docs/site/.nojekyll` is kept for branch-deploy parity and is
harmless with the Actions artifact deployment.

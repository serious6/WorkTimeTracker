# GitHub Pages website

The static landing page lives in `docs/site/`. Keeping it below `docs/` makes GitHub Pages’ branch-and-folder deployment available without adding a site build, dependencies, or a backend. `index.html` contains the page content, `style.css` its responsive styles, and `releases.js` renders releases using the small testable helpers in `release-data.js`.

At load time the page calls GitHub’s public Releases API for this repository. Successful responses are cached in `localStorage` for 20 minutes; a saved response is shown if a later request fails. The latest non-draft release and its assets are rendered at runtime, so publishing a release needs no website update. Installer platform labels are inferred from their filename. With no releases, the intentional “No releases yet” panel remains visible.

## Deploy

1. Push these files to the branch to publish (normally `main`).
2. In GitHub, open **Settings → Pages**.
3. Choose **Deploy from a branch**, select that branch, then select the `/docs` folder.
4. Save. The page is published at `https://serious6.github.io/WorkTimeTracker/site/`.

If using the repository-root Pages URL is preferred, deploy `docs/site/` with a GitHub Pages Actions workflow instead. When changing page content, edit `docs/site/index.html`; keep release behavior in `release-data.js` and its tests in `scripts/release-data.test.mjs`. The rendered page is covered end to end by [`e2e/website.spec.ts`](../e2e/website.spec.ts), which serves `docs/site/` statically and answers the Releases API itself.

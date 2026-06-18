# Web Apps Home

A personal web-app portfolio and launcher. A landing page auto-discovers apps
from the `apps/` directory and presents them as a clickable list. Each app is a
standalone Progressive Web App (PWA) that works offline once loaded.

This README is the orientation guide for anyone — human or coding agent — new to
the project. It documents the architecture, the hard rules, the conventions, and
the gotchas you need before making changes.

---

## TL;DR for a new contributor

- **Stack:** plain HTML, CSS, and JavaScript. No frameworks, no npm, no build
  step, no bundler. A tiny Python dev server is the only tooling.
- **Structure:** the root is a launcher; every app lives self-contained in
  `apps/<slug>/` and never depends on the parent or on other apps.
- **Run it:** `python3 server.py`, then open <http://localhost:3000>.
- **Deploy:** push to `main` → a GitHub Actions workflow publishes to GitHub
  Pages automatically. Live at <https://wallowspithier34.github.io/web-apps/>.
- **Read `CLAUDE.md` before coding** — it holds the binding design/code rules
  that override default behavior. This README does not repeat them; treat
  `CLAUDE.md` as the source of truth.

---

## Quick start

```
python3 server.py            # serves on port 3000
python3 server.py 8080       # custom port
./start.sh                   # convenience wrapper (cd + run)
```

Open <http://localhost:3000>. The server requires only the Python 3 standard
library — there is nothing to install.

There is also `.claude/launch.json` defining a `web-apps-home` launch config
(runs `server.py` on port 3000) used by the Claude Code preview tooling. Prefer
the preview tools over ad-hoc servers when verifying changes in a browser.

---

## Repository layout

```
WebApps/
├── server.py              # Dev server (Python stdlib, zero dependencies)
├── start.sh               # cd into repo + exec server.py "$@"
├── index.html             # Landing page shell
├── CLAUDE.md              # Binding project rules (READ FIRST)
├── README.md              # This file
├── assets/                # Landing-page-only assets
│   ├── styles.css         # Warm-beige theme, serif typography
│   ├── script.js          # Fetches apps/index.json, renders the card list
│   └── favicon.svg
├── apps/
│   ├── index.json         # JSON array of app slugs (committed AND regenerated)
│   ├── _template/         # Starter template for new apps (skipped by discovery)
│   └── <slug>/            # One directory per app, fully self-contained
│       ├── app.json       # Launcher listing manifest
│       ├── manifest.json  # PWA web app manifest
│       ├── sw.js          # Service worker (offline caching)
│       ├── icon.svg       # App icon
│       ├── index.html     # Entry point
│       └── ...            # Whatever else the app needs
├── .github/workflows/
│   └── pages.yml          # Deploys the static site to GitHub Pages on push to main
└── .claude/               # Local agent/tooling config (git-ignored)
    └── launch.json        # Preview server definition
```

`.gitignore` excludes `.DS_Store` and `.claude/`.

---

## How the launcher works

1. **`server.py`** scans `apps/` for subdirectories (skipping any whose name
   starts with `_` or `.`), reads each `app.json`, and on every startup writes
   `apps/index.json` — a JSON array of app slugs. It also exposes a live
   `GET /api/apps` endpoint returning the discovered apps with their manifests.
2. **`assets/script.js`** fetches `apps/index.json`, then loads each app's
   `app.json` in parallel, and renders the apps as a list of cards.
3. Clicking a card navigates to `./apps/<slug>/`. The server rewrites bare
   directory requests (`/apps/<slug>/`) to that app's `index.html`.
4. The server sends `Cache-Control: no-cache` on everything so edits show up
   immediately on reload during development.

### Why `apps/index.json` is committed *and* generated

The landing page reads the **static** `apps/index.json`, so it works on a dumb
static host (GitHub Pages) with no server. `server.py` regenerates it on every
start to keep it fresh locally. **When you add or remove an app, update
`apps/index.json` so the committed file stays in sync** — otherwise the app
won't appear on the deployed site. (Running `server.py` once locally rewrites
it for you; just commit the result.)

---

## Deployment (GitHub Pages)

- **Trigger:** every push to `main` runs `.github/workflows/pages.yml`.
- **What it does:** uploads the repository root as-is (no build) and deploys it
  to GitHub Pages. The site is plain static files, so the root `index.html` is
  served directly. `actions/configure-pages` enables Pages on first run.
- **Live URLs:**
  - Launcher: <https://wallowspithier34.github.io/web-apps/>
  - An app: `https://wallowspithier34.github.io/web-apps/apps/<slug>/`
- **Implication:** anything merged to `main` goes live automatically a minute or
  two later. Note that the site is served under the `/web-apps/` subpath, so
  absolute asset paths (`/styles.css`) would break here — see `CLAUDE.md`.

---

## Anatomy of an app

Every app directory contains, at minimum:

| File            | Purpose |
|-----------------|---------|
| `app.json`      | Launcher listing manifest (read by the landing page). |
| `manifest.json` | PWA web app manifest (name, icons, theme/background color, `display`). |
| `sw.js`         | Service worker that precaches assets for offline use. |
| `index.html`    | Entry point. Registers the service worker. |
| `icon.svg`      | App icon (referenced by both manifests). |

### `app.json` — launcher listing manifest

| Field         | Required | Description                              |
|---------------|----------|------------------------------------------|
| `name`        | Yes      | Display name on the landing page         |
| `description` | Yes      | One-line description                     |
| `icon`        | No       | Icon file relative to the app dir        |
| `color`       | No       | Accent color (hex). Default `#6366f1`    |
| `tags`        | No       | Array of category strings                |

### `index.html` conventions

- Standard iOS PWA meta tags: `viewport` with `viewport-fit=cover` and
  `maximum-scale=1.0`, `apple-mobile-web-app-capable`, status-bar style,
  `apple-touch-icon`, and a `<link rel="manifest">`.
- A `theme-color` meta matching the app's theme.
- Register the service worker at the end of `<body>`:
  ```html
  <script>if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js");</script>
  ```

### Service worker pattern

All apps use the same network-first-with-cache-fallback service worker. Copy it
and adjust the two top constants:

```js
const CACHE = "<app-slug>";          // bump this (e.g. "-v2") when the asset list changes
const ASSETS = ["./", "./index.html", "./styles.css", "./script.js",
                "./icon.svg", "./manifest.json", /* ...every file the app loads */];
```

- `install` precaches `ASSETS`; `activate` claims clients.
- `fetch` tries the network (with `cache: "reload"` to bypass the HTTP cache),
  updates the SW cache on success, and falls back to the cache when offline.
- **Gotcha:** list *every* asset the app fetches (each JS file, every image,
  every data file) in `ASSETS`, or it won't be available offline. When you add
  files, update `ASSETS` **and** bump `CACHE` so clients pick up the new list.

### Persistence

Apps that store state use `localStorage`, keyed with an app-specific prefix to
avoid collisions on the shared origin (e.g. `posts-dark`,
`chess-openings-trainer:v2`, `chess-openings-prefs`). Always namespace your keys.

---

## Adding a new app

```
cp -r apps/_template apps/my-new-app
```

1. Edit `apps/my-new-app/app.json` (name, description, icon, color, tags).
2. Update `apps/my-new-app/manifest.json` and `sw.js` (set `CACHE`, list assets).
3. Build the app (observing the constraints in `CLAUDE.md`).
4. Add `"my-new-app"` to `apps/index.json` (or run `server.py` once to
   regenerate it) and commit the change.
5. Reload the landing page — the app appears automatically.

Verify in a browser (the preview tooling is ideal): check the console for errors,
confirm assets load, and confirm `localStorage` survives a refresh.

---

## App catalog

| Slug                | Name                    | Notes |
|---------------------|-------------------------|-------|
| `analog-clock`      | Analog Clock            | Live analog clock; single `script.js`. |
| `posts`             | Posts                   | Markdown reader (`markdown.js` + `posts/`), reader settings, opt-in dark mode (`posts-dark`). |
| `solitaire`         | Solitaire               | Klondike; ~33 KB single-file game engine in `script.js`. |
| `chess-openings`    | Chess Openings Trainer  | The largest app — see below. |

### `chess-openings` architecture

A Duolingo-style openings trainer; the most complex app, split across several
plain `<script>` files (loaded in order in `index.html`). It drills **positions**
("situations"), not whole opening sequences: each opening mainline is decomposed
into the positions where it's your turn, and you learn the correct *response* to
each. Positions are deduplicated across openings and their book responses are
**pooled** — any book move from a position is accepted — so the same situation
never has a move that's right in one opening and wrong in another:

- **`chess.js`** — a self-contained chess rules engine (`Chess` class on
  `window`): board representation, full legal-move generation (castling, en
  passant, promotion, check filtering), and SAN. Used for move validation and
  legal-move highlighting.
- **`openings.js`** — `OPENINGS`, an array of ~32 openings (both colors, tiers
  1–4) with ECO codes and annotated move lists (the source mainlines).
- **`srs.js`** — builds the deduped position graph (`POSITIONS`,
  `POSITION_BY_KEY`, `OPENING_CARDS`, and `OPENING_LINE` — each opening's cards
  paired with the move *it* plays there) from `OPENINGS`, and the `Store` class:
  per-position SM-2 spaced repetition, tier unlocking (a position's tier reflects
  how common it is — it inherits the most-played opening that reaches it), and
  `localStorage` persistence. Per-opening progress keys off the specific response
  played (recorded per card), so studying one line only credits the moves it
  actually teaches — shared transposition positions aren't credited to a sibling
  opening you haven't drilled. Progress key: `chess-openings-trainer:v2`.
- **`app.js`** — UI controller: board rendering and animation, the drill flow
  (brief auto-replay of the moves leading to a position, then ask for one
  response), the tier-grouped home dashboard, free-practice library, and the
  settings screen.
- **`pieces/`** — three traditional Staunton SVG piece sets (`cburnett`,
  `merida`, `maestro`), rendered via `<img>`. `pieces/CREDITS.txt` records their
  upstream source and licenses (from the lichess project, GPL).
- Settings (`chess-openings-prefs`): light/dark theme, piece style, and board
  color, all persisted; the theme is a manual toggle that defaults to light.

This app is a good reference for: a multi-file vanilla app, a sizeable bundled
asset set in the service worker, namespaced `localStorage`, and a manual,
opt-in dark mode.

---

## Verifying changes

- Run `python3 server.py` (or the preview tooling's `web-apps-home` config) and
  exercise the change in a browser. Check the console for errors, confirm assets
  load (Network tab / `200`s), and confirm `localStorage` persists across reload.
- For PWA/offline behavior: load the app once (to populate the SW cache), then
  reload. Remember to bump `CACHE` in `sw.js` when assets change, or the old
  cache will keep serving stale files.
- There is no test suite. Verification is manual/browser-based.

---

## Git & deployment workflow

- Pushing to `main` deploys automatically via GitHub Pages (see above). The
  repo's normal history commits directly to `main`; a branch + PR is also fine.
- When you add or remove an app, keep `apps/index.json` in sync so it appears on
  the deployed site.

---

## Standalone export

Copy any app's directory to extract it as a standalone web app — it works on any
static host because everything is self-contained and relatively pathed. Over
`file://` the service worker won't activate, but the app still functions when
served over HTTP.

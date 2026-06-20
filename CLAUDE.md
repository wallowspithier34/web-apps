# Project Rules

## Design
- Mobile-first — design for phone screen first; never require an off-screen keyboard
- iPhone/iOS Safari is the primary target device
- Themes are fixed — never use `prefers-color-scheme`; each app renders a single fixed theme regardless of the system setting (the theme itself is the app's choice)
- Account for iOS safe-area insets (`env(safe-area-inset-*)`) on full-screen chrome so controls clear the status bar and home indicator

## Code
- Vanilla stack only — no frameworks, no npm, no build tools. The shipped app must run as plain HTML, CSS, and JS. One-off local tooling that only produces committed static assets (e.g. image processing) is fine.
- Namespace all `localStorage` keys with an app-specific prefix; document any keys shared between apps

## Apps
- Each app must be fully self-contained — no links back to the home page; each works as a standalone PWA
- All apps must support offline use via a service worker
- Use relative paths (`./styles.css`, `./script.js`) for all assets
- List every fetched asset in `sw.js` `ASSETS`, and bump `CACHE` whenever any cached file changes
- Be mindful of precached asset size (this is an offline-first PWA) — optimize/downscale heavy images; avoid shipping multi-MB assets unless essential

## Review & verification
- After making changes, check if `README.md` needs updating to stay in sync
- When adding or removing an app, keep `apps/index.json` in sync so the deployed listing doesn't drift
- Complex apps maintain a `DESIGN.md` — architecture, intended behavior, and a numbered Known-Issues backlog with `file:line` pointers; keep it in sync with changes
- Verify UI/behavior changes in the running app (browser preview), not just by reading code

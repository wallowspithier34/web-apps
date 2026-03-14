# Project Rules

## Design
- Mobile-first — design for phone screen first; never require an off-screen keyboard
- iPhone/iOS Safari is the primary target device
- Fixed warm beige theme — never use `prefers-color-scheme`; always render the light theme regardless of system setting

## Code
- Vanilla stack only — no frameworks, no npm, no build tools; plain HTML, CSS, and JS

## Apps
- Each app must be fully self-contained — no links back to the home page; each works as a standalone PWA
- All apps must support offline use via a service worker
- Use relative paths (`./styles.css`, `./script.js`) for all assets

## Review
- After making changes, check if `README.md` needs updating to stay in sync

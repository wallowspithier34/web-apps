# Web Apps Home

A personal web app portfolio and launcher. A landing page auto-discovers apps from the `apps/` directory and presents them as a clickable list. Each app is a standalone PWA that works offline once loaded.

## Quick Start

```
python3 server.py
```

Open [http://localhost:3000](http://localhost:3000). Pass a custom port as an argument: `python3 server.py 8080`.

## Architecture

```
Web Apps Home/
├── server.py          # Dev server (Python stdlib, zero dependencies)
├── index.html         # Landing page shell
├── assets/
│   ├── styles.css     # Landing page styles (warm beige, serif typography)
│   ├── script.js      # Fetches app list from index.json, renders card list
│   └── favicon.svg
├── apps/
│   ├── index.json     # Auto-generated app slug list (written by server.py on start)
│   ├── _template/     # Starter template for new apps
│   └── {app-slug}/    # Each app in its own directory
│       ├── app.json   # App listing manifest (name, description, icon, color, tags)
│       ├── manifest.json  # PWA web app manifest
│       ├── sw.js      # Service worker for offline caching
│       ├── index.html # Entry point
│       └── ...        # Whatever the app needs
```

### How it works

1. `server.py` scans `apps/` for subdirectories (skipping `_` and `.` prefixed), reads each `app.json`, and writes `apps/index.json` (a list of slugs) on every server start
2. The landing page JS fetches `apps/index.json`, then loads each app's `app.json` manifest in parallel
3. Apps are rendered as a list of cards; clicking one navigates to `./apps/{slug}/`
4. Because the index is a static file, the landing page also works on static hosts like GitHub Pages — no dynamic server needed

No build step. No bundler. No npm. Just files and a server.

## Adding a New App

```
cp -r apps/_template apps/my-new-app
```

Edit `apps/my-new-app/app.json`:

```json
{
    "name": "My New App",
    "description": "What this app does.",
    "icon": "icon.svg",
    "color": "#6366f1",
    "tags": ["category"]
}
```

Build your app in that directory. Refresh the landing page — it appears automatically.

### App Listing Manifest (`app.json`)

| Field         | Required | Description                          |
|---------------|----------|--------------------------------------|
| `name`        | Yes      | Display name on the landing page     |
| `description` | Yes      | One-line description                 |
| `icon`        | No       | Icon file relative to app dir        |
| `color`       | No       | Accent color (hex). Default: #6366f1 |
| `tags`        | No       | Array of category strings            |

### Guidelines

- Use **relative paths** (`./styles.css`, `./script.js`) for all app assets — this ensures standalone and offline use works
- Each app should be fully independent — no dependencies on the parent project
- Include a `manifest.json` and `sw.js` for PWA/offline support (see existing apps for reference)

## Offline / Add to Home Screen

Each app is a Progressive Web App (PWA). On a phone:

1. Start the server and open the app in your phone's browser
2. Wait for the page to fully load (this caches all files via the service worker)
3. Use **Add to Home Screen** (enable "Run as Web App" on iOS)

The app will then work offline — the service worker serves all assets from the local cache.

## Standalone Export

Copy any app's directory to extract it as a standalone web app. It works when deployed to any static host. For local file:// usage, the service worker won't activate, but the app itself will still function if served over HTTP.

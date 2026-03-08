#!/usr/bin/env python3
"""Web Apps Home — lightweight dev server with auto-discovery."""

import http.server
import json
import os
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 3000
ROOT = os.path.dirname(os.path.abspath(__file__))
APPS_DIR = os.path.join(ROOT, "apps")


def discover_apps():
    """Scan /apps for directories with app.json manifests."""
    apps = []
    if not os.path.isdir(APPS_DIR):
        return apps
    for entry in sorted(os.scandir(APPS_DIR), key=lambda e: e.name):
        if not entry.is_dir() or entry.name.startswith(("_", ".")):
            continue
        manifest = os.path.join(entry.path, "app.json")
        if not os.path.isfile(manifest):
            continue
        try:
            with open(manifest) as f:
                data = json.load(f)
            data["slug"] = entry.name
            data["path"] = f"./apps/{entry.name}/"
            apps.append(data)
        except (json.JSONDecodeError, OSError):
            continue
    return apps


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_GET(self):
        # API: return discovered apps as JSON
        if self.path == "/api/apps":
            apps = discover_apps()
            payload = json.dumps(apps).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            self.wfile.write(payload)
            return

        # Resolve bare directory paths to index.html
        if self.path.startswith("/apps/") and self.path.endswith("/"):
            index = os.path.join(ROOT, self.path.lstrip("/"), "index.html")
            if os.path.isfile(index):
                self.path = self.path + "index.html"

        super().do_GET()

    def end_headers(self):
        # Never HTTP-cache any files so updates are always picked up immediately
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, format, *args):
        # Cleaner log output
        sys.stderr.write(f"  {args[0]}\n")


def write_app_index():
    """Write apps/index.json by scanning the apps directory.
    Keeps the static file in sync so GitHub Pages can discover apps too."""
    slugs = [app["slug"] for app in discover_apps()]
    index_path = os.path.join(APPS_DIR, "index.json")
    with open(index_path, "w") as f:
        json.dump(slugs, f)
    print(f"  Updated apps/index.json → {slugs}")


if __name__ == "__main__":
    write_app_index()  # auto-update the static app list on every server start
    with http.server.HTTPServer(("", PORT), Handler) as httpd:
        print(f"\n  Web Apps Home running at http://localhost:{PORT}\n")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n  Shutting down.")

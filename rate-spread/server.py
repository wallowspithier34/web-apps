#!/usr/bin/env python3
"""
Backend for the Swap Spread reference display.

Serves the static frontend (index.html/styles.css/app.js) and a same-origin
JSON API at GET /api/rates, so the browser never fetches cf.com directly (which
is impossible anyway: CORS + Cloudflare + client-rendered data — see README).

The rates come from scraper.py (headless Playwright render). Renders are slow
and we don't want to hammer cf.com, so results are cached in memory for
CACHE_TTL seconds. `GET /api/rates?force=1` (the frontend's Refresh button)
bypasses the cache. A lock serialises renders so concurrent requests don't
launch multiple browsers.
"""

import json
import os
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import scraper

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
CACHE_TTL = 300  # seconds (matches cf.com's own s-maxage=300)

_cache = {"data": None, "ts": 0.0}
_lock = threading.Lock()


def get_rates(force=False):
    """Return cached rates, refreshing via the scraper when stale or forced."""
    with _lock:
        fresh = _cache["data"] is not None and (time.time() - _cache["ts"]) < CACHE_TTL
        if force or not fresh:
            try:
                _cache["data"] = scraper.fetch_rates()
            except Exception as e:
                # Total failure (e.g. Playwright/browser missing): return an
                # error payload the frontend can render instead of a 500.
                _cache["data"] = {
                    "fetchedAt": None,
                    "rates": {},
                    "errors": [f"scrape failed: {e.__class__.__name__}: {e}"],
                }
            _cache["ts"] = time.time()
        return _cache["data"]


class Handler(BaseHTTPRequestHandler):
    # quiet-ish logging
    def log_message(self, fmt, *args):
        sys.stderr.write("[%s] %s\n" % (self.log_date_time_string(), fmt % args))

    def _write(self, body):
        # Clients that navigate away / cancel mid-response cause a broken pipe;
        # that's expected, not an error worth a traceback.
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def _send_json(self, obj, status=200):
        body = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self._write(body)

    def _send_file(self, path):
        try:
            with open(path, "rb") as f:
                body = f.read()
        except OSError:
            self.send_error(404, "Not found")
            return
        ctype = {
            ".html": "text/html; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".js": "application/javascript; charset=utf-8",
        }.get(os.path.splitext(path)[1], "application/octet-stream")
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self._write(body)

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        query = self.path.split("?", 1)[1] if "?" in self.path else ""

        if path == "/api/rates":
            force = "force=1" in query
            self._send_json(get_rates(force=force))
            return

        # Static files (only serve the known frontend files; default to index).
        if path in ("/", ""):
            path = "/index.html"
        rel = path.lstrip("/")
        if rel not in ("index.html", "styles.css", "app.js"):
            self.send_error(404, "Not found")
            return
        self._send_file(os.path.join(ROOT, rel))


def main():
    print(f"Swap Spread server on http://localhost:{PORT}  (cache {CACHE_TTL}s)")
    print("  GET /              -> frontend")
    print("  GET /api/rates     -> cached rates")
    print("  GET /api/rates?force=1 -> force refresh")
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()

# 5-Year Swap Spreads

A single-page reference display of two interest-rate-swap spreads, using live rates
from **Chatham Financial** (`cf.com`):

- **Left panel:** 5yr SOFR swap − 5yr 6-month EURIBOR swap
- **Right panel:** 5yr SOFR swap − 5yr SONIA swap

Each panel shows the signed spread in basis points (1 dp; negative when SOFR is the
lower rate), the two underlying rates, and the **exact rate labels from the source
page**. There's a manual **Refresh** button and a last-fetched timestamp.

## ⚠️ This app is an intentional exception to the repo rules

The rest of `WebApps` is vanilla static, offline-first PWAs with **no backend**. This
app **cannot** be that, and is deliberately exempt (it is **not** in `apps/` and **not**
listed in `apps/index.json`). Why:

- `cf.com/rates/*` is a **client-rendered SPA** (TanStack Start + React Query) behind
  **Cloudflare**. The rate numbers are **not in the served HTML** — they load via JS
  after hydration. So there is nothing for a static page to parse.
- A browser on another origin **cannot fetch `cf.com`** (CORS), and there is no public
  JSON API.

So it needs a backend that **headless-renders** each page and reads the rate off the
DOM, then serves the result to the frontend same-origin.

**Data-source note / ToS:** this scrapes a commercial product ("Chatham Rates"). It is
intended as a personal reference display. It is inherently **fragile** — if cf.com
changes its DOM or Cloudflare challenges headless traffic, extraction will break; the
UI surfaces those failures rather than showing stale/garbage numbers.

## What it scrapes

The three targets and where they live (confirmed by rendering the pages):

| Rate    | Source page          | Card label ("as shown")      | Row     |
|---------|----------------------|------------------------------|---------|
| SOFR    | `cf.com/rates/us`    | `SOFR Swaps (annual/annual)` | 5 Year  |
| EURIBOR | `cf.com/rates/europe`| `6-month EURIBOR Swaps`       | 5 Year  |
| SONIA   | `cf.com/rates/europe`| `SONIA Swaps`                | 5 Year  |

The page's first (`Latest`, intraday) column is **subscriber-gated** and renders as
`0.000%` for anonymous users, so the scraper uses the most recent **end-of-day** value
(the first non-zero column) and reports the page's own "Rates as of …" date.

## Setup

Requires Python 3.9+ and a one-time Chromium download (~100 MB).

```bash
cd rate-spread
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
python -m playwright install chromium
```

## Run

```bash
. .venv/bin/activate
python server.py            # serves http://localhost:8000
# python server.py 9000     # optional: custom port
```

Open http://localhost:8000. (Or use the `rate-spread` config in `.claude/launch.json`.)

## How it works

- `scraper.py` — Playwright headless render of the two group pages + rate extraction.
  Run standalone (`python scraper.py`) to print the raw JSON.
- `server.py` — stdlib HTTP server: serves the static frontend and `GET /api/rates`
  (JSON). Results are cached in memory for 5 min (matching cf.com's own cache);
  `GET /api/rates?force=1` (the Refresh button) bypasses the cache. A lock serialises
  renders so concurrent requests don't launch multiple browsers.
- `index.html` / `styles.css` / `app.js` — the two-panel frontend. Computes each spread
  as `(SOFR% − other%) × 100` bps, to 1 dp, signed.

## API shape

```json
{
  "fetchedAt": "2026-07-03T13:01:00+00:00",
  "rates": {
    "sofr":    {"label":"SOFR Swaps (annual/annual)","tenor":"5 Year","value":3.944,"unit":"%","source":"cf.com/rates/us","asOf":"Rates as of 02-Jul-2026."},
    "euribor": {"label":"6-month EURIBOR Swaps","tenor":"5 Year","value":2.699,"unit":"%","source":"cf.com/rates/europe","asOf":"Rates as of 02-Jul-2026."},
    "sonia":   {"label":"SONIA Swaps","tenor":"5 Year","value":4.002,"unit":"%","source":"cf.com/rates/europe","asOf":"Rates as of 02-Jul-2026."}
  },
  "errors": []
}
```

Per-rate failures go into `errors[]` (and render as a per-panel error + a banner) rather
than failing the whole response.

"""
Headless-render scraper for Chatham Financial ("cf.com") market-rate pages.

The rate pages are a client-rendered SPA (TanStack Start + React Query) behind
Cloudflare — the numbers are NOT in the served HTML, so we render each region
group page with headless Chromium (Playwright) and read the target rate off the
rendered DOM.

Targets (5-year swap rate for each):
  - SOFR     : "SOFR Swaps (annual/annual)"  on cf.com/rates/us
  - EURIBOR  : "6-month EURIBOR Swaps"        on cf.com/rates/europe
  - SONIA    : "SONIA Swaps"                  on cf.com/rates/europe

Note on the value used: each rate table's first ("Latest") column is the live
intraday rate, which is gated to Pro subscribers and renders as 0.000% for
anonymous access. We therefore take the most recent *available* value — the
first non-zero percentage column (the latest end-of-day rate) — and report the
card's own "Rates as of ..." line so the freshness is explicit.
"""

import re
from datetime import datetime, timezone

from playwright.sync_api import sync_playwright

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")

GROUP_URLS = {
    "us":     "https://cf.com/rates/us",
    "europe": "https://cf.com/rates/europe",
}

# Each target: which group page, how to match the rate card by its heading, and
# the tenor row to read. `match` substrings are matched (lowercased) against the
# card heading; all must be present.
TARGETS = [
    {"key": "sofr",    "group": "us",     "match": ["sofr swaps", "annual"], "tenor": "5 year"},
    {"key": "euribor", "group": "europe", "match": ["6-month euribor swaps"], "tenor": "5 year"},
    {"key": "sonia",   "group": "europe", "match": ["sonia swaps"],           "tenor": "5 year"},
]

# Pull every <table> on the page with its card heading, "Rates as of" footer,
# and all rows (as arrays of cell text). Parsing/selection happens in Python.
_EXTRACT_JS = r"""() => {
  const cards = [];
  document.querySelectorAll('table').forEach(tbl => {
    let title = null, cardRoot = null, el = tbl;
    for (let up = 0; up < 6 && el; up++) {
      el = el.parentElement;
      if (!el) break;
      const h = el.querySelector('h1,h2,h3,h4,h5,[role="heading"]');
      if (h) { const t = h.textContent.trim(); if (t && t.length < 80) { title = t; cardRoot = el; break; } }
    }
    // The card root (heading + table + footer) holds this card's "Rates as of" line.
    let asOf = null;
    const container = cardRoot || tbl.closest('section,article,div') || tbl.parentElement;
    if (container) {
      const m = container.textContent.match(/Rates as of[^.]*\./);
      if (m) asOf = m[0].trim();
    }
    const rows = [...tbl.querySelectorAll('tr')].map(tr =>
      [...tr.querySelectorAll('th,td')].map(c => c.textContent.trim()));
    cards.push({ title, asOf, rows });
  });
  return cards;
}"""


def _parse_pct(cell):
    """Return the percentage value in a cell as a float, or None."""
    m = re.search(r"(-?\d+(?:\.\d+)?)\s*%", cell or "")
    return float(m.group(1)) if m else None


def _row_value(row):
    """
    Given a tenor row like ['5 Year4.6 bps', '0.000%', '3.944%', '3.898%', ...],
    return the most recent *available* rate: the first non-zero percentage among
    the value columns (skips the Pro-gated 0.000% 'Latest' column and any
    'Locked rate' columns). Returns None if nothing usable.
    """
    for cell in row[1:]:                       # skip the tenor/label cell
        if "locked" in cell.lower():
            continue
        v = _parse_pct(cell)
        if v:                                  # non-zero, non-None
            return v
    return None


def _extract_from_cards(cards, target):
    """Find the matching card + tenor row and return (label, value, asOf) or raises."""
    match = target["match"]
    tenor = target["tenor"]
    for card in cards:
        title = (card.get("title") or "").lower()
        if not all(m in title for m in match):
            continue
        for row in card.get("rows", []):
            if row and row[0].lower().startswith(tenor):
                value = _row_value(row)
                if value is None:
                    raise ValueError(f"{target['key']}: '{card['title']}' {tenor} row has no readable rate")
                return card["title"], value, card.get("asOf")
        raise ValueError(f"{target['key']}: matched card '{card['title']}' but no '{tenor}' row")
    raise ValueError(f"{target['key']}: no rate card matching {match}")


def _render_cards(browser, url):
    """Render a group page and return its extracted card list."""
    page = browser.new_page(user_agent=UA)
    # Speed up + reduce footprint: the data arrives via XHR/fetch, so only block
    # images/media/fonts (never scripts or xhr).
    page.route(re.compile(r"\.(png|jpe?g|gif|webp|svg|woff2?|ttf|mp4|webm)(\?|$)"),
               lambda route: route.abort())
    try:
        # networkidle never settles (streaming connections), so wait on content.
        page.goto(url, wait_until="domcontentloaded", timeout=45000)
        try:
            page.wait_for_selector("text=Rates as of", timeout=25000)
        except Exception:
            pass
        page.wait_for_timeout(2000)
        return page.evaluate(_EXTRACT_JS)
    finally:
        page.close()


def fetch_rates():
    """
    Render the needed group pages once each and extract all three target rates.
    Returns the API payload dict (never raises; per-rate failures go to errors).
    """
    needed_groups = sorted({t["group"] for t in TARGETS})
    rates, errors = {}, []

    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--no-sandbox"])
        try:
            cards_by_group = {}
            for g in needed_groups:
                try:
                    cards_by_group[g] = _render_cards(browser, GROUP_URLS[g])
                except Exception as e:
                    cards_by_group[g] = None
                    errors.append(f"{g}: page render failed ({e.__class__.__name__})")

            for target in TARGETS:
                cards = cards_by_group.get(target["group"])
                if cards is None:
                    errors.append(f"{target['key']}: source page unavailable")
                    continue
                try:
                    label, value, as_of = _extract_from_cards(cards, target)
                    rates[target["key"]] = {
                        "label": label,
                        "tenor": "5 Year",
                        "value": value,
                        "unit": "%",
                        "source": GROUP_URLS[target["group"]].replace("https://", ""),
                        "asOf": as_of,
                    }
                except Exception as e:
                    errors.append(str(e))
        finally:
            browser.close()

    return {
        "fetchedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "rates": rates,
        "errors": errors,
    }


if __name__ == "__main__":
    import json
    print(json.dumps(fetch_rates(), indent=2))

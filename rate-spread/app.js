// Swap Spread reference display — fetches /api/rates and renders two panels.

// Each panel = SOFR swap minus one paired swap. `a` minus `b`.
const PANELS = [
    { id: "left",  title: "SOFR − 6-month EURIBOR", a: "sofr", b: "euribor" },
    { id: "right", title: "SOFR − SONIA",           a: "sofr", b: "sonia"   },
];

const panelsEl = document.getElementById("panels");
const bannerEl = document.getElementById("banner");
const tsEl = document.getElementById("timestamp");
const refreshBtn = document.getElementById("refresh");

// ── Formatting helpers ──────────────────────────────────────────────────────
function fmtSpreadBps(a, b) {
    // rates are in %, so 1% = 100 bps
    const bps = (a - b) * 100;
    const sign = bps >= 0 ? "+" : "−"; // real minus sign
    return { text: sign + Math.abs(bps).toFixed(1), positive: bps >= 0 };
}
function fmtPct(v) {
    return v.toFixed(3) + "%";
}
function fmtClock(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d)) return "—";
    return d.toLocaleString([], {
        year: "numeric", month: "short", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
}
function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// ── Rendering ────────────────────────────────────────────────────────────────
function skeletonPanel(cfg) {
    return `
    <div class="panel skeleton" id="panel-${cfg.id}">
        <h2 class="panel-title"><span class="sk">&nbsp;</span></h2>
        <div class="spread"><span class="sk" style="width:8ch">&nbsp;</span></div>
        <div class="legs">
            <div class="leg"><span class="sk" style="width:100%">&nbsp;</span></div>
            <div class="leg"><span class="sk" style="width:100%">&nbsp;</span></div>
        </div>
    </div>`;
}

function legRow(op, rate) {
    return `
    <div class="leg">
        <div class="leg-main">
            <span class="leg-op">${op}</span>
            <span class="leg-label">${esc(rate.label)}
                <span class="leg-tenor">${esc(rate.tenor)} · ${esc(rate.source)}</span>
            </span>
        </div>
        <span class="leg-value">${fmtPct(rate.value)}</span>
    </div>`;
}

function dataPanel(cfg, rates, errors) {
    const a = rates[cfg.a];
    const b = rates[cfg.b];

    if (!a || !b) {
        const missing = [!a ? cfg.a : null, !b ? cfg.b : null].filter(Boolean);
        const msgs = errors.filter((e) => missing.some((m) => e.toLowerCase().startsWith(m)));
        return `
        <div class="panel error" id="panel-${cfg.id}">
            <h2 class="panel-title">${esc(cfg.title)} (5Y)</h2>
            <div class="err-msg">Rate unavailable</div>
            <div class="legs">
                <div class="err-msg">${esc(msgs.join("; ") || "Missing: " + missing.join(", "))}</div>
            </div>
        </div>`;
    }

    const spread = fmtSpreadBps(a.value, b.value);
    const asOf = a.asOf || b.asOf || "";
    return `
    <div class="panel" id="panel-${cfg.id}">
        <h2 class="panel-title">${esc(cfg.title)} (5-Year)</h2>
        <div class="spread ${spread.positive ? "pos" : "neg"}">
            ${spread.text}<span class="spread-unit">bps</span>
        </div>
        <div class="legs">
            ${legRow("", a)}
            ${legRow("−", b)}
        </div>
        <div class="panel-source">${esc(asOf)}</div>
    </div>`;
}

function renderLoading() {
    panelsEl.innerHTML = PANELS.map(skeletonPanel).join("");
    bannerEl.hidden = true;
    tsEl.textContent = "Loading live rates…";
}

function renderData(payload) {
    const rates = payload.rates || {};
    const errors = payload.errors || [];
    panelsEl.innerHTML = PANELS.map((c) => dataPanel(c, rates, errors)).join("");

    // Global banner only for errors that aren't already shown in a panel's legs.
    if (errors.length) {
        bannerEl.hidden = false;
        bannerEl.innerHTML =
            `<strong>Some data could not be retrieved:</strong>` +
            `<ul>${errors.map((e) => `<li><code>${esc(e)}</code></li>`).join("")}</ul>`;
    } else {
        bannerEl.hidden = true;
    }

    tsEl.textContent = payload.fetchedAt
        ? "Last fetched: " + fmtClock(payload.fetchedAt)
        : "Fetch failed";
}

function renderFatal(message) {
    panelsEl.innerHTML = PANELS.map((cfg) => `
        <div class="panel error" id="panel-${cfg.id}">
            <h2 class="panel-title">${esc(cfg.title)} (5Y)</h2>
            <div class="err-msg">Could not load rates</div>
        </div>`).join("");
    bannerEl.hidden = false;
    bannerEl.innerHTML = `<strong>Error:</strong> <code>${esc(message)}</code>`;
    tsEl.textContent = "Fetch failed";
}

// ── Fetch ────────────────────────────────────────────────────────────────────
let inFlight = false;

async function load(force) {
    if (inFlight) return;
    inFlight = true;
    refreshBtn.disabled = true;
    renderLoading();
    try {
        const res = await fetch("/api/rates" + (force ? "?force=1" : ""), {
            headers: { Accept: "application/json" },
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const payload = await res.json();
        renderData(payload);
    } catch (err) {
        renderFatal(err.message || String(err));
    } finally {
        inFlight = false;
        refreshBtn.disabled = false;
    }
}

refreshBtn.addEventListener("click", () => load(true));
load(false);

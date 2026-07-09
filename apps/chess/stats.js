// Stats screen: per-bucket Elo progression chart + win/loss/draw summary.
// Reads the progression history recorded by EloStore (chess-v2:elo →
// bucket.history[{ts, gameNo, elo, delta, result}]). Pure visualization —
// never writes any data.

const STAT_BUCKETS = [
    { key: "standard-blitz", label: "Std · Blitz" },
    { key: "standard-long",  label: "Std · Rapid" },
    { key: "c960-blitz",     label: "960 · Blitz" },
    { key: "c960-long",      label: "960 · Rapid" },
];

let _stBucket = "standard-long";
let _stAxis   = "games";           // "games" | "time"
let _stPoints = [];                // screen-space points for hover lookup

// Chart geometry (viewBox units; rendered responsive via width:100%).
const CW = 520, CH = 240, PAD = { l: 44, r: 16, t: 14, b: 26 };

function openStats() {
    // Default to the bucket the current config would play in.
    const prefs = getPrefs();
    _stBucket = bucketKey(prefs.variant, getTimeControl(prefs).seconds);
    _renderStatsControls();
    _renderStats();
    showScreen("screen-stats");
}

function _renderStatsControls() {
    const seg = document.getElementById("stats-bucket-seg");
    if (!seg.dataset.built) {
        for (const b of STAT_BUCKETS) {
            const btn = document.createElement("button");
            btn.className = "seg-btn";
            btn.dataset.bucket = b.key;
            btn.textContent = b.label;
            btn.addEventListener("click", () => { _stBucket = b.key; _renderStatsControls(); _renderStats(); });
            seg.appendChild(btn);
        }
        seg.dataset.built = "1";
        document.querySelectorAll("#stats-axis-seg .seg-btn").forEach((b) =>
            b.addEventListener("click", () => { _stAxis = b.dataset.axis; _renderStatsControls(); _renderStats(); }));
    }
    seg.querySelectorAll(".seg-btn").forEach((b) =>
        b.classList.toggle("active", b.dataset.bucket === _stBucket));
    document.querySelectorAll("#stats-axis-seg .seg-btn").forEach((b) =>
        b.classList.toggle("active", b.dataset.axis === _stAxis));
}

// A readable y-axis step for the elo range (3–6 gridlines).
function _niceStep(range) {
    for (const s of [25, 50, 100, 200, 400, 800]) {
        if (range / s <= 6) return s;
    }
    return 1000;
}

function _fmtDate(ts) {
    const d = new Date(ts);
    if (isNaN(d)) return "";
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function _renderStats() {
    const chartEl = document.getElementById("stats-chart");
    const hist = getEloStore().history(_stBucket) || [];
    document.getElementById("stats-tooltip").hidden = true;

    // Summary tiles (always shown; zeros for an empty bucket).
    const bucket = getEloStore().bucket(_stBucket);
    const W = hist.filter((h) => h.result === 1).length;
    const D = hist.filter((h) => h.result === 0.5).length;
    const L = hist.filter((h) => h.result === 0).length;
    const peak = hist.length ? Math.max(...hist.map((h) => h.elo)) : bucket.elo;
    document.getElementById("stats-summary").innerHTML =
        `<div class="stat-tile"><span class="stat-num">${bucket.elo}</span><span class="stat-lbl">Current</span></div>
         <div class="stat-tile"><span class="stat-num">${peak}</span><span class="stat-lbl">Peak</span></div>
         <div class="stat-tile"><span class="stat-num">${bucket.gamesPlayed || 0}</span><span class="stat-lbl">Games</span></div>
         <div class="stat-tile"><span class="stat-num">${W}–${D}–${L}</span><span class="stat-lbl">W–D–L</span></div>`;

    if (!hist.length) {
        chartEl.innerHTML = `<p class="stats-empty">No rated games yet in this category.</p>`;
        _stPoints = [];
        return;
    }

    // ── Scales ──
    // Time mode needs ≥2 valid timestamps to be meaningful; otherwise fall back to
    // even game spacing (legacy migrated entries may have null/partial ts).
    let entries = hist;
    let timeMode = _stAxis === "time";
    if (timeMode) {
        const valid = hist.filter((h) => h.ts && !isNaN(new Date(h.ts)));
        if (valid.length >= 2) entries = valid; else timeMode = false;
    }
    const xs = entries.map((h, i) => timeMode ? +new Date(h.ts) : i);
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    const xTo = (v) => x1 === x0 ? (PAD.l + (CW - PAD.l - PAD.r) / 2)
        : PAD.l + ((v - x0) / (x1 - x0)) * (CW - PAD.l - PAD.r);

    const elos = entries.map((h) => h.elo);
    const step = _niceStep(Math.max(...elos) - Math.min(...elos) || 100);
    const yMin = Math.floor((Math.min(...elos) - step / 2) / step) * step;
    const yMax = Math.ceil((Math.max(...elos) + step / 2) / step) * step;
    const yTo = (v) => (CH - PAD.b) - ((v - yMin) / (yMax - yMin)) * (CH - PAD.t - PAD.b);

    // ── Build SVG ──
    let grid = "", ylabels = "";
    for (let v = yMin; v <= yMax; v += step) {
        const y = yTo(v).toFixed(1);
        grid += `<line x1="${PAD.l}" y1="${y}" x2="${CW - PAD.r}" y2="${y}" class="st-grid"/>`;
        ylabels += `<text x="${PAD.l - 6}" y="${y}" class="st-ylabel" text-anchor="end" dominant-baseline="middle">${v}</text>`;
    }

    _stPoints = entries.map((h, i) => ({ x: xTo(xs[i]), y: yTo(h.elo), h }));
    const line = _stPoints.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    const last = _stPoints[_stPoints.length - 1];

    // X labels: first / middle / last (game numbers or dates).
    const xlbl = (i, anchor) => {
        const p = _stPoints[i], h = entries[i];
        const txt = timeMode ? _fmtDate(h.ts) : "#" + h.gameNo;
        return `<text x="${p.x.toFixed(1)}" y="${CH - 8}" class="st-xlabel" text-anchor="${anchor}">${txt}</text>`;
    };
    let xlabels = xlbl(0, "start");
    if (entries.length > 2) xlabels += xlbl(Math.floor(entries.length / 2), "middle");
    if (entries.length > 1) xlabels += xlbl(entries.length - 1, "end");

    chartEl.innerHTML =
        `<svg viewBox="0 0 ${CW} ${CH}" id="stats-svg" role="img" aria-label="Elo over ${timeMode ? "time" : "games"}">
            ${grid}${ylabels}${xlabels}
            <line id="st-crosshair" class="st-crosshair" y1="${PAD.t}" y2="${CH - PAD.b}" hidden/>
            ${_stPoints.length > 1 ? `<polyline points="${line}" class="st-line"/>` : ""}
            <circle id="st-hoverdot" class="st-hoverdot" r="5" hidden/>
            <circle cx="${last.x.toFixed(1)}" cy="${last.y.toFixed(1)}" r="4" class="st-enddot"/>
        </svg>`;
    _wireHover(timeMode);
}

// Crosshair + tooltip: nearest point by x under the pointer/finger.
function _wireHover(timeMode) {
    const svg = document.getElementById("stats-svg");
    const tip = document.getElementById("stats-tooltip");
    const wrap = document.getElementById("stats-chart-wrap");
    if (!svg) return;
    const cross = () => document.getElementById("st-crosshair");
    const dot   = () => document.getElementById("st-hoverdot");

    const show = (clientX) => {
        if (!_stPoints.length) return;
        const rect = svg.getBoundingClientRect();
        const vx = ((clientX - rect.left) / rect.width) * CW;
        let best = _stPoints[0];
        for (const p of _stPoints) if (Math.abs(p.x - vx) < Math.abs(best.x - vx)) best = p;
        cross().setAttribute("x1", best.x); cross().setAttribute("x2", best.x);
        cross().hidden = false;
        dot().setAttribute("cx", best.x); dot().setAttribute("cy", best.y);
        dot().hidden = false;
        const when = timeMode ? _fmtDate(best.h.ts) : "game " + best.h.gameNo;
        tip.textContent = `${best.h.elo} · ${when}`;
        tip.hidden = false;
        const wrapRect = wrap.getBoundingClientRect();
        const px = rect.left - wrapRect.left + (best.x / CW) * rect.width;
        tip.style.left = Math.max(4, Math.min(wrapRect.width - tip.offsetWidth - 4, px - tip.offsetWidth / 2)) + "px";
    };
    const hide = () => {
        if (cross()) cross().hidden = true;
        if (dot()) dot().hidden = true;
        tip.hidden = true;
    };
    svg.addEventListener("pointermove", (e) => show(e.clientX));
    svg.addEventListener("pointerdown", (e) => show(e.clientX));
    svg.addEventListener("pointerleave", hide);
}

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("btn-stats").addEventListener("click", openStats);
    document.getElementById("btn-stats-back").addEventListener("click", () => {
        showScreen("screen-home");
        refreshHome();
    });
});

window.openStats = openStats;

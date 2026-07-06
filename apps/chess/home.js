// Home screen, global navigation, and settings panel.
// Entry point: DOMContentLoaded at the bottom of this file.

const PREFS_KEY = "chess-v2:prefs";
const GAME_KEY  = "chess-v2:game";

// Board colour themes (light-friendly, warm editorial palette). Values feed the
// [data-board] CSS selectors in styles.css. Default is "classic".
const BOARD_THEMES = [
    { id: "classic", label: "Classic", light: "#f0d9b5", dark: "#b58863" },
    { id: "walnut",  label: "Walnut",  light: "#e8cfa6", dark: "#9c6b43" },
    { id: "coffee",  label: "Coffee",  light: "#d9c3a5", dark: "#6f4e37" },
    { id: "forest",  label: "Forest",  light: "#ebecd0", dark: "#779556" },
    { id: "ocean",   label: "Ocean",   light: "#dbe6ec", dark: "#6f92a8" },
    { id: "slate",   label: "Slate",   light: "#dcdce4", dark: "#8892a6" },
];

const PIECE_STYLES = [
    { id: "cburnett",  label: "CBurnett" },
    { id: "merida",    label: "Merida" },
    { id: "maestro",   label: "Maestro" },
    { id: "modern",    label: "Modern" },
    { id: "shaded",    label: "Shaded" },
    { id: "flat",      label: "Flat" },
    { id: "pixel",     label: "Pixel" },
    { id: "classic",   label: "Classic" },
    { id: "letters",   label: "Letters" },
];

const DEFAULT_PREFS = {
    theme: "light",
    pieces: "cburnett",
    board:  "classic",
    variant: "standard",
    timerPreset: 6,                              // 10+0 → "long" bucket
    difficulty: { mode: "adaptive", skill: 8 },
};

// ── Shared globals ──────────────────────────────────────────────────────────
let _eloStore, _prefs;
function getEloStore() { return _eloStore; }
function getPrefs()    { return _prefs; }

function savePrefs() {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(_prefs)); } catch (_) {}
}

function loadPrefs() {
    _prefs = Object.assign({}, DEFAULT_PREFS);
    try {
        const raw = localStorage.getItem(PREFS_KEY);
        if (raw) {
            const p = JSON.parse(raw);
            _prefs = Object.assign({}, DEFAULT_PREFS, p);
            _prefs.difficulty = Object.assign({}, DEFAULT_PREFS.difficulty, p.difficulty);
        }
    } catch (_) { /* keep defaults */ }
    if (!PIECE_STYLES.find((s) => s.id === _prefs.pieces)) _prefs.pieces = DEFAULT_PREFS.pieces;
    if (!BOARD_THEMES.find((t) => t.id === _prefs.board))  _prefs.board  = DEFAULT_PREFS.board;
}

// ── Screen navigation ───────────────────────────────────────────────────────
function showScreen(id) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    const el = document.getElementById(id);
    if (el) el.classList.add("active");
    document.getElementById("settings-panel").hidden = true;
}

function applyTheme() {
    document.body.classList.toggle("dark", _prefs.theme === "dark");
}
function applyBoardTheme() {
    document.getElementById("app").dataset.board = _prefs.board;
}

// ── Toast ───────────────────────────────────────────────────────────────────
function showToast(msg, ms = 2000) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove("show"), ms);
}

// ── Ratings ─────────────────────────────────────────────────────────────────
const RATING_GROUPS = [
    { variant: "standard", label: "Standard" },
    { variant: "c960",     label: "Chess960" },
];

function renderRatings() {
    const wrap = document.getElementById("ratings");
    if (!wrap) return;
    wrap.innerHTML = "";
    for (const g of RATING_GROUPS) {
        const blitz = _eloStore.elo(`${g.variant}-blitz`);
        const long  = _eloStore.elo(`${g.variant}-long`);
        const card = document.createElement("div");
        card.className = "rating-card";
        card.innerHTML =
            `<div class="rating-name">${g.label}</div>
             <div class="rating-vals">
                 <div class="rating-cell"><span class="rating-num">${blitz}</span><span class="rating-tc">Blitz</span></div>
                 <div class="rating-cell"><span class="rating-num">${long}</span><span class="rating-tc">Rapid</span></div>
             </div>`;
        wrap.appendChild(card);
    }
}

// ── Home config card ────────────────────────────────────────────────────────
function refreshHome() {
    renderRatings();

    // Resume banner
    const saved = _readSavedGame();
    const banner = document.getElementById("resume-banner");
    if (saved && (saved.history || []).length > 0) {
        const label = saved.variant === "c960" ? "Chess960" : "Standard";
        const n = saved.history.length;
        document.getElementById("resume-sub").textContent =
            `${label} — ${n} move${n === 1 ? "" : "s"} played`;
        banner.hidden = false;
    } else {
        banner.hidden = true;
    }

    _renderConfig();
}

function _renderConfig() {
    // Variant segment
    document.querySelectorAll("#cfg-variant .seg-btn").forEach((b) =>
        b.classList.toggle("active", b.dataset.variant === _prefs.variant));

    // Timer segment
    const timer = document.getElementById("cfg-timer");
    if (!timer.dataset.built) {
        TIMER_PRESETS.forEach((p, i) => {
            const b = document.createElement("button");
            b.className = "seg-btn";
            b.dataset.timer = i;
            b.textContent = p.label;
            b.addEventListener("click", () => { _prefs.timerPreset = i; savePrefs(); _renderConfig(); });
            timer.appendChild(b);
        });
        timer.dataset.built = "1";
    }
    timer.querySelectorAll(".seg-btn").forEach((b) =>
        b.classList.toggle("active", +b.dataset.timer === _prefs.timerPreset));

    // Difficulty segment
    document.querySelectorAll("#cfg-diff .seg-btn").forEach((b) =>
        b.classList.toggle("active", b.dataset.diff === _prefs.difficulty.mode));
    document.getElementById("cfg-skill-row").hidden = _prefs.difficulty.mode !== "manual";
    document.getElementById("cfg-skill").value = _prefs.difficulty.skill;
    document.getElementById("cfg-skill-val").textContent = _prefs.difficulty.skill;

    // Note: which rating this game affects
    const base = TIMER_PRESETS[_prefs.timerPreset].seconds;
    const tc   = timeControlTag(base) === "blitz" ? "Blitz" : "Rapid";
    const key  = bucketKey(_prefs.variant, base);
    const vLabel = _prefs.variant === "c960" ? "Chess960" : "Standard";
    const note = document.getElementById("cfg-note");
    if (_prefs.difficulty.mode === "adaptive") {
        note.textContent = `Rated · ${vLabel} ${tc} (${_eloStore.elo(key)}). The bot tunes itself to your rating.`;
    } else {
        note.textContent = `Manual Skill ${_prefs.difficulty.skill} · unrated (rating unchanged).`;
    }
}

// ── Settings panel ──────────────────────────────────────────────────────────
function openSettings() {
    document.getElementById("settings-panel").hidden = false;
    document.querySelectorAll("#theme-seg .seg-btn").forEach((b) =>
        b.classList.toggle("active", b.dataset.theme === _prefs.theme));
    _renderPieceStyleGrid();
    _renderBoardSwatches();
    _renderRatingsEdit();
}

function _renderPieceStyleGrid() {
    const grid = document.getElementById("piece-style-grid");
    grid.innerHTML = "";
    for (const s of PIECE_STYLES) {
        const tile = document.createElement("div");
        tile.className = "opt-tile" + (s.id === _prefs.pieces ? " active" : "");
        tile.innerHTML =
            `<div class="opt-preview">${Board.samplePiece(s.id, "w", "K")}${Board.samplePiece(s.id, "b", "N")}</div>
             <div class="opt-label">${s.label}</div>`;
        tile.addEventListener("click", () => { _prefs.pieces = s.id; savePrefs(); _renderPieceStyleGrid(); });
        grid.appendChild(tile);
    }
}

function _renderBoardSwatches() {
    const grid = document.getElementById("board-swatch-grid");
    grid.innerHTML = "";
    for (const t of BOARD_THEMES) {
        const sw = document.createElement("button");
        sw.className = "swatch" + (t.id === _prefs.board ? " active" : "");
        sw.innerHTML =
            `<div class="swatch-board">
                <div class="sq" style="background:${t.light}"></div><div class="sq" style="background:${t.dark}"></div>
                <div class="sq" style="background:${t.dark}"></div><div class="sq" style="background:${t.light}"></div>
             </div><div class="opt-label">${t.label}</div>`;
        sw.addEventListener("click", () => { _prefs.board = t.id; savePrefs(); applyBoardTheme(); _renderBoardSwatches(); });
        grid.appendChild(sw);
    }
}

const RATING_EDIT_ROWS = [
    { key: "standard-blitz", label: "Standard · Blitz" },
    { key: "standard-long",  label: "Standard · Rapid" },
    { key: "c960-blitz",     label: "Chess960 · Blitz" },
    { key: "c960-long",      label: "Chess960 · Rapid" },
];

function _renderRatingsEdit() {
    const wrap = document.getElementById("ratings-edit");
    wrap.innerHTML = "";
    for (const r of RATING_EDIT_ROWS) {
        const row = document.createElement("div");
        row.className = "rating-edit-row";
        const b = _eloStore.bucket(r.key);
        row.innerHTML =
            `<span class="rating-edit-label">${r.label} <span class="rating-edit-games">${b.gamesPlayed || 0} games</span></span>
             <input type="number" class="rating-edit-input" min="100" max="3000" value="${b.elo}">`;
        row.querySelector("input").addEventListener("change", (e) => {
            const v = parseInt(e.target.value, 10);
            if (!isNaN(v)) { _eloStore.setElo(r.key, v); e.target.value = _eloStore.elo(r.key); }
        });
        wrap.appendChild(row);
    }
}

function _readSavedGame() {
    try { const r = localStorage.getItem(GAME_KEY); return r ? JSON.parse(r) : null; } catch (_) { return null; }
}

// ── Bootstrap ───────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
    loadPrefs();
    _eloStore = new EloStore();
    applyTheme();
    applyBoardTheme();
    refreshHome();

    // Config: variant / difficulty segments
    document.querySelectorAll("#cfg-variant .seg-btn").forEach((b) =>
        b.addEventListener("click", () => { _prefs.variant = b.dataset.variant; savePrefs(); _renderConfig(); }));
    document.querySelectorAll("#cfg-diff .seg-btn").forEach((b) =>
        b.addEventListener("click", () => { _prefs.difficulty.mode = b.dataset.diff; savePrefs(); _renderConfig(); }));
    document.getElementById("cfg-skill").addEventListener("input", (e) => {
        _prefs.difficulty.skill = parseInt(e.target.value, 10);
        document.getElementById("cfg-skill-val").textContent = _prefs.difficulty.skill;
        savePrefs();
        _renderConfig();
    });

    // Play button — start a fresh game with the chosen settings. If a game is
    // paused, confirm via an in-app modal (not a system dialog) first.
    const startConfiguredGame = () => {
        initPlay({ variant: _prefs.variant });
        showScreen("screen-play");
    };
    document.getElementById("btn-play").addEventListener("click", () => {
        const saved = _readSavedGame();
        if (saved && (saved.history || []).length > 0) {
            document.getElementById("confirm-modal").hidden = false;
            return;
        }
        startConfiguredGame();
    });
    document.getElementById("confirm-cancel").addEventListener("click", () => {
        document.getElementById("confirm-modal").hidden = true;
    });
    document.getElementById("confirm-ok").addEventListener("click", () => {
        document.getElementById("confirm-modal").hidden = true;
        resignSavedGame();
        startConfiguredGame();
    });

    // Resume banner
    document.getElementById("resume-banner").addEventListener("click", () => {
        const saved = _readSavedGame();
        if (!saved) return;
        initPlay({ resume: true });
        showScreen("screen-play");
    });

    document.getElementById("btn-settings").addEventListener("click", openSettings);
    document.getElementById("btn-settings-close").addEventListener("click", () => {
        document.getElementById("settings-panel").hidden = true;
        refreshHome();
    });

    // Theme toggle
    document.querySelectorAll("#theme-seg .seg-btn").forEach((b) =>
        b.addEventListener("click", () => {
            _prefs.theme = b.dataset.theme; savePrefs(); applyTheme();
            document.querySelectorAll("#theme-seg .seg-btn").forEach((x) =>
                x.classList.toggle("active", x.dataset.theme === _prefs.theme));
        }));

    // Settings: history / export / import / reset
    document.getElementById("st-history").addEventListener("click", () => {
        document.getElementById("settings-panel").hidden = true;
        openHistory();
    });
    document.getElementById("st-export").addEventListener("click", () => {
        try { downloadSave(); } catch (e) { showToast("Export failed: " + e.message); }
    });
    const importFile = document.getElementById("st-import-file");
    document.getElementById("st-import").addEventListener("click", () => importFile.click());
    importFile.addEventListener("change", () => {
        const file = importFile.files && importFile.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try { importSaveFromText(String(reader.result)); }
            catch (e) { showToast("Import failed: " + e.message); }
            importFile.value = "";
        };
        reader.onerror = () => { showToast("Could not read file"); importFile.value = ""; };
        reader.readAsText(file);
    });
    document.getElementById("st-reset").addEventListener("click", () => {
        if (!confirm("Reset ALL chess data?\n\nThis erases every rating, setting, the current game, and game history. Export first for a backup.")) return;
        if (!confirm("This cannot be undone. Permanently erase everything?")) return;
        try {
            const keys = [];
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.startsWith("chess")) keys.push(k);
            }
            keys.forEach((k) => localStorage.removeItem(k));
        } catch (_) {}
        location.reload();
    });
});

window.showScreen    = showScreen;
window.showToast     = showToast;
window.getEloStore   = getEloStore;
window.getPrefs      = getPrefs;
window.savePrefs     = savePrefs;
window.refreshHome   = refreshHome;
window.applyBoardTheme = applyBoardTheme;
window.GAME_KEY      = GAME_KEY;
window.BOARD_THEMES  = BOARD_THEMES;
window.PIECE_STYLES  = PIECE_STYLES;

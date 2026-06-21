// Home screen + global navigation + settings panel.
// Entry point: DOMContentLoaded at the bottom of this file.

const PREFS_KEY = "chess-v2:prefs";
const GAME_KEY  = "chess-v2:game";

const BOARD_THEMES = [
    { id: "dungeon", label: "Mono",     light: "#3a3a3a", dark: "#1c1c1c" },
    { id: "amber",   label: "Amber",    light: "#6a4420", dark: "#3a2010" },
    { id: "walnut",  label: "Walnut",   light: "#d9b97a", dark: "#8b5e38" },
    { id: "forest",  label: "Forest",   light: "#d9e8c0", dark: "#5a7a3a" },
    { id: "ocean",   label: "Ocean",    light: "#b8d8e8", dark: "#3a5a78" },
    { id: "slate",   label: "Slate",    light: "#b8b8c8", dark: "#5a5a6a" },
];

const PIECE_STYLES = [
    { id: "pixel",     label: "Pixel",    preview: ["K","P"] },
    { id: "shaded",    label: "Shaded",   preview: ["K","P"] },
    { id: "flat",      label: "Flat",     preview: ["K","P"] },
    { id: "cburnett",  label: "CBurnett", preview: ["K","P"] },
    { id: "merida",    label: "Merida",   preview: ["K","P"] },
    { id: "maestro",   label: "Maestro",  preview: ["K","P"] },
    { id: "modern",    label: "Modern",   preview: ["K","P"] },
    { id: "classic",   label: "Classic",  preview: ["K","P"] },
    { id: "letters",   label: "Letters",  preview: ["K","P"] },
];

const TEXT_SIZES = [
    { label: "Normal", scale: 1 },
    { label: "Large",  scale: 1.15 },
    { label: "XL",     scale: 1.3 },
];
const TEXT_COLORS = [
    { label: "Default", value: "" },
    { label: "White",   value: "#ffffff" },
    { label: "Amber",   value: "#e0b86a" },
    { label: "Green",   value: "#9fe0a0" },
    { label: "Cyan",    value: "#8fd9ff" },
];

const DEFAULT_PREFS = {
    pieces: "pixel",
    board:  "dungeon",
    timerPreset: NO_TIMER_IDX,
    botDifficulty: { mode: "auto", skillLevel: 10 },
    textScale: 1,
    textColor: "",
};

// ── Shared globals (accessed by play.js, trainer.js, etc.) ───────────────────
let _store, _eloStore, _prefs;

function getStore()    { return _store; }
function getEloStore() { return _eloStore; }
function getPrefs()    { return _prefs; }

function savePrefs() {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(_prefs)); } catch (_) {}
}

function loadPrefs() {
    try {
        const raw = localStorage.getItem(PREFS_KEY);
        if (raw) {
            _prefs = Object.assign({}, DEFAULT_PREFS, JSON.parse(raw));
            // If saved piece style no longer exists, reset to default
            if (!PIECE_STYLES.find((s) => s.id === _prefs.pieces)) {
                _prefs.pieces = DEFAULT_PREFS.pieces;
                savePrefs();
            }
            return;
        }
        // Migrate piece/board from old chess-openings prefs if present
        const old = localStorage.getItem("chess-openings-prefs");
        if (old) {
            const p = JSON.parse(old);
            _prefs = Object.assign({}, DEFAULT_PREFS);
            if (p.pieces && PIECE_STYLES.find((s) => s.id === p.pieces)) _prefs.pieces = p.pieces;
            if (p.board  && BOARD_THEMES.find((t) => t.id === p.board))  _prefs.board  = p.board;
            return;
        }
    } catch (_) {}
    _prefs = Object.assign({}, DEFAULT_PREFS);
}

// ── Screen navigation ─────────────────────────────────────────────────────────
function showScreen(id) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    const el = document.getElementById(id);
    if (el) el.classList.add("active");
    document.getElementById("settings-panel").hidden = true;
    applyBoardTheme();
}

function applyBoardTheme() {
    document.getElementById("app").dataset.board = _prefs.board;
}

// Apply the user's accessibility text prefs (size multiplier + colour) to the root.
// A non-default colour recolours the primary, dim, and faint text tokens (with
// reduced opacity for dim/faint so the visual hierarchy is preserved). Accent/
// structural colours (--gold, borders) are left alone.
function applyTextPrefs() {
    const root = document.documentElement;
    root.style.setProperty("--text-scale", _prefs.textScale || 1);
    const hexToRgba = (hex, a) => {
        const n = parseInt(hex.slice(1), 16);
        return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
    };
    if (_prefs.textColor && /^#[0-9a-fA-F]{6}$/.test(_prefs.textColor)) {
        root.style.setProperty("--text", _prefs.textColor);
        root.style.setProperty("--text-dim", hexToRgba(_prefs.textColor, 0.82));
        root.style.setProperty("--text-faint", hexToRgba(_prefs.textColor, 0.6));
    } else {
        root.style.removeProperty("--text");
        root.style.removeProperty("--text-dim");
        root.style.removeProperty("--text-faint");
    }
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(msg, ms = 2000) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove("show"), ms);
}

// ── Home screen ───────────────────────────────────────────────────────────────
function refreshHome() {
    document.getElementById("home-elo").textContent    = _eloStore.elo;
    document.getElementById("home-streak").textContent = _store.data.streak.count;
    document.getElementById("home-xp").textContent     = _store.data.xp;
    document.getElementById("home-reviews").textContent = _store.data.totalReviews;

    // Resume banner
    const saved = (() => { try { const r = localStorage.getItem(GAME_KEY); return r ? JSON.parse(r) : null; } catch (_) { return null; } })();
    const banner = document.getElementById("resume-banner");
    if (saved) {
        const modeLabel = saved.mode === "bot" ? "vs Bot" : "Pass & Play";
        const moveCount = (saved.history || []).length;
        document.getElementById("resume-sub").textContent = `${modeLabel} — ${moveCount} moves played`;
        banner.hidden = false;
    } else {
        banner.hidden = true;
    }
}

// ── Settings panel ────────────────────────────────────────────────────────────
function openSettings() {
    document.getElementById("settings-panel").hidden = false;
    document.getElementById("st-elo-display").textContent = _eloStore.elo;
    document.getElementById("st-elo-input").value = _eloStore.elo;
    _renderPieceStyleGrid();
    _renderBoardSwatches();
    _renderTextSize();
    _renderTextColor();
}

function _renderTextSize() {
    const row = document.getElementById("text-size-row");
    row.innerHTML = "";
    for (const t of TEXT_SIZES) {
        const btn = document.createElement("button");
        const active = Math.abs((_prefs.textScale || 1) - t.scale) < 0.001;
        btn.className = "radio-btn" + (active ? " active" : "");
        btn.textContent = t.label;
        btn.addEventListener("click", () => {
            _prefs.textScale = t.scale; savePrefs(); applyTextPrefs(); _renderTextSize();
        });
        row.appendChild(btn);
    }
}

function _renderTextColor() {
    const row = document.getElementById("text-color-row");
    row.innerHTML = "";
    for (const c of TEXT_COLORS) {
        const btn = document.createElement("button");
        btn.className = "text-swatch" + ((_prefs.textColor || "") === c.value ? " active" : "");
        btn.innerHTML = `<span class="text-swatch-dot" style="color:${c.value || "var(--text)"}">A</span>` +
                        `<span class="opt-label">${c.label}</span>`;
        btn.addEventListener("click", () => {
            _prefs.textColor = c.value; savePrefs(); applyTextPrefs(); _renderTextColor();
        });
        row.appendChild(btn);
    }
}

function _renderPieceStyleGrid() {
    const grid = document.getElementById("piece-style-grid");
    grid.innerHTML = "";
    for (const s of PIECE_STYLES) {
        const tile = document.createElement("div");
        tile.className = "opt-tile" + (s.id === _prefs.pieces ? " active" : "");
        tile.innerHTML = `
            <div class="opt-preview">
                ${Board.samplePiece(s.id, "w", "K")}
                ${Board.samplePiece(s.id, "b", "P")}
            </div>
            <div class="opt-label">${s.label}</div>`;
        tile.addEventListener("click", () => {
            _prefs.pieces = s.id;
            savePrefs();
            _renderPieceStyleGrid();
        });
        grid.appendChild(tile);
    }
}

function _renderBoardSwatches() {
    const grid = document.getElementById("board-swatch-grid");
    grid.innerHTML = "";
    for (const t of BOARD_THEMES) {
        const sw = document.createElement("button");
        sw.className = "swatch" + (t.id === _prefs.board ? " active" : "");
        sw.innerHTML = `<div class="swatch-board">
            <div class="sq" style="background:${t.light}"></div>
            <div class="sq" style="background:${t.dark}"></div>
            <div class="sq" style="background:${t.dark}"></div>
            <div class="sq" style="background:${t.light}"></div>
        </div><div class="opt-label">${t.label}</div>`;
        sw.addEventListener("click", () => {
            _prefs.board = t.id;
            savePrefs();
            applyBoardTheme();
            _renderBoardSwatches();
        });
        grid.appendChild(sw);
    }
}

function _renderHomeBotConfig() {
    const isAuto = _prefs.botDifficulty.mode === "auto";
    document.getElementById("home-diff-auto").classList.toggle("active", isAuto);
    document.getElementById("home-diff-manual").classList.toggle("active", !isAuto);
    document.getElementById("home-skill-row-wrap").style.display = isAuto ? "none" : "flex";
    document.getElementById("home-skill-slider").value = _prefs.botDifficulty.skillLevel;
    document.getElementById("home-skill-val").textContent = _prefs.botDifficulty.skillLevel;

    const row = document.getElementById("home-timer-radio");
    row.innerHTML = "";
    TIMER_PRESETS.forEach((p, i) => {
        const btn = document.createElement("button");
        btn.className = "radio-btn" + (i === _prefs.timerPreset ? " active" : "");
        btn.textContent = p.label;
        btn.addEventListener("click", () => {
            _prefs.timerPreset = i;
            savePrefs();
            _renderHomeBotConfig();
        });
        row.appendChild(btn);
    });
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
    loadPrefs();
    _store    = new Store();
    _eloStore = new EloStore();
    applyBoardTheme();
    applyTextPrefs();
    refreshHome();

    // ── Home screen buttons ──
    document.getElementById("tile-trainer").addEventListener("click", () => {
        refreshHome();
        initTrainer();
        showScreen("screen-trainer");
    });
    document.getElementById("tile-pvp").addEventListener("click", () => {
        initPlay({ mode: "pvp" });
        showScreen("screen-play");
    });
    document.getElementById("tile-bot").addEventListener("click", () => {
        // If a bot game is paused, offer to resume it rather than silently discarding it.
        const saved = (() => { try { const r = localStorage.getItem(GAME_KEY); return r ? JSON.parse(r) : null; } catch (_) { return null; } })();
        if (saved && saved.mode === "bot" && (saved.history || []).length > 0) {
            if (confirm("Resume your bot game in progress?\n\nCancel starts a new game (abandoning this one counts as a resignation).")) {
                initPlay({ mode: "bot", playerColor: saved.playerColor || "w", resume: true });
                showScreen("screen-play");
                return;
            }
            // Declined resume → abandoning the saved bot game counts as a resignation
            // (Elo loss + game-history record), mirroring the in-game New button (#36/#44).
            resignSavedBotGame();
        }
        // Fresh game — randomly assign the player's colour each time.
        initPlay({ mode: "bot", playerColor: Math.random() < 0.5 ? "w" : "b" });
        showScreen("screen-play");
    });
    document.getElementById("tile-library").addEventListener("click", () => {
        initLibrary();
        showScreen("screen-library");
    });

    document.getElementById("resume-banner").addEventListener("click", () => {
        const saved = (() => { try { const r = localStorage.getItem(GAME_KEY); return r ? JSON.parse(r) : null; } catch (_) { return null; } })();
        if (!saved) return;
        initPlay({ mode: saved.mode, playerColor: saved.playerColor || "w", resume: true });
        showScreen("screen-play");
    });

    document.getElementById("btn-settings").addEventListener("click", openSettings);

    // ── Home bot config ──
    _renderHomeBotConfig();
    document.getElementById("home-diff-auto").addEventListener("click", () => {
        _prefs.botDifficulty.mode = "auto";
        savePrefs();
        _renderHomeBotConfig();
    });
    document.getElementById("home-diff-manual").addEventListener("click", () => {
        _prefs.botDifficulty.mode = "manual";
        savePrefs();
        _renderHomeBotConfig();
    });
    document.getElementById("home-skill-slider").addEventListener("input", (e) => {
        _prefs.botDifficulty.skillLevel = parseInt(e.target.value, 10);
        document.getElementById("home-skill-val").textContent = _prefs.botDifficulty.skillLevel;
        savePrefs();
    });

    // ── Settings panel ──
    document.getElementById("btn-settings-close").addEventListener("click", () => {
        document.getElementById("settings-panel").hidden = true;
        refreshHome();
    });

    // Elo edit in settings
    document.getElementById("st-elo-edit").addEventListener("click", () => {
        document.getElementById("st-elo-input-wrap").classList.add("active");
        document.getElementById("st-elo-input").focus();
    });
    document.getElementById("st-elo-save").addEventListener("click", () => {
        const val = parseInt(document.getElementById("st-elo-input").value, 10);
        if (!isNaN(val)) { _eloStore.setElo(val); document.getElementById("st-elo-display").textContent = _eloStore.elo; }
        document.getElementById("st-elo-input-wrap").classList.remove("active");
    });
    document.getElementById("st-elo-cancel").addEventListener("click", () => {
        document.getElementById("st-elo-input-wrap").classList.remove("active");
    });

    document.getElementById("st-export").addEventListener("click", () => {
        try { downloadMarkdown(_store, _eloStore, _prefs); }
        catch (e) { showToast("Export failed: " + e.message); }
    });

    // Import: open the file picker, then restore from the chosen file's text.
    const importFile = document.getElementById("st-import-file");
    document.getElementById("st-import").addEventListener("click", () => importFile.click());
    importFile.addEventListener("change", () => {
        const file = importFile.files && importFile.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try { importProgressFromText(String(reader.result)); }
            catch (e) { showToast("Import failed: " + e.message); }
            importFile.value = "";  // allow re-importing the same file
        };
        reader.onerror = () => { showToast("Could not read file"); importFile.value = ""; };
        reader.readAsText(file);
    });

    // Reset all data — wipes every chess* localStorage key behind two confirmations.
    document.getElementById("st-reset").addEventListener("click", () => {
        if (!confirm("Reset ALL chess data?\n\nThis erases SRS progress, Elo, settings, the current game, and game history. Export first if you want a backup.")) return;
        if (!confirm("This cannot be undone. Permanently erase everything?")) return;
        try {
            const keys = [];
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.startsWith("chess")) keys.push(k);
            }
            keys.forEach((k) => localStorage.removeItem(k));
        } catch (_) { /* ignore */ }
        location.reload();
    });

});

window.showScreen   = showScreen;
window.showToast    = showToast;
window.getStore     = getStore;
window.getEloStore  = getEloStore;
window.getPrefs     = getPrefs;
window.savePrefs    = savePrefs;
window.refreshHome  = refreshHome;
window.GAME_KEY     = GAME_KEY;
window.BOARD_THEMES = BOARD_THEMES;
window.PIECE_STYLES = PIECE_STYLES;

// UI controller: dashboard, interactive board, position drills, free practice.
//
// The unit of study is a *position* (a "situation"), not a whole opening line.
// Each drill sets up a position by briefly auto-replaying the moves leading to it,
// then asks for one correct response. Any book move from that position is accepted.

// Unicode figurine glyphs (the "Classic" piece style). Filled glyphs for both
// colours; CSS colour + outline distinguishes the side.
const GLYPH = {
    K: "♚", Q: "♛", R: "♜", B: "♝", N: "♞", P: "♟",
    k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟",
};
const LETTER = { K: "K", Q: "Q", R: "R", B: "B", N: "N", P: "" };

// "Modern" piece style — original geometric silhouettes (viewBox 0 0 45 45).
// fill = currentColor (set per side via CSS); stroke is inherited from CSS.
const PIECE_SVG = {
    P: `<circle cx="22.5" cy="14" r="5.4"/>
        <path d="M17.6 19.2q4.9 3 9.8 0l1.7 10.8h-13.2z"/>
        <rect x="12.5" y="29" width="20" height="6.4" rx="2.6"/>`,
    R: `<path d="M12 13.5h3.4v2.6h3v-2.6h3.6v2.6h3v-2.6h3.4v8l-2.2 2.2v6.4l2.2 2.2v1.6h-19.4v-1.6l2.2-2.2v-6.4l-2.2-2.2z"/>
        <rect x="9.5" y="31.5" width="25" height="5.6" rx="1.9"/>`,
    N: `<path d="M13.5 37.5v-4.6c0-6.8 2-9.8 6.7-13.1l-1.7-2.7-2.6 1.7c-1-2.7 1.2-6.3 5.2-8l1.9-3.6 1.2 3.6c5 1 8.9 5.6 8.9 12.9v13.4z"/>
        <circle cx="26.2" cy="16.4" r="1.15" class="eye"/>`,
    B: `<circle cx="22.5" cy="9" r="2.3"/>
        <path d="M22.5 11C15.5 14.5 16 23 18.4 28h8.2C29 23 29.5 14.5 22.5 11z"/>
        <rect x="20.9" y="15.5" width="3.2" height="1.4" rx="0.6" class="slit"/>
        <rect x="21.8" y="14.6" width="1.4" height="3.2" rx="0.6" class="slit"/>
        <ellipse cx="22.5" cy="29" rx="7.2" ry="2"/>
        <rect x="13" y="31.3" width="19" height="5.8" rx="1.9"/>`,
    Q: `<circle cx="10.5" cy="13" r="2.3"/><circle cx="16.5" cy="10.2" r="2.3"/>
        <circle cx="22.5" cy="9.2" r="2.5"/><circle cx="28.5" cy="10.2" r="2.3"/>
        <circle cx="34.5" cy="13" r="2.3"/>
        <path d="M10.5 13l4.3 15h15.4l4.3-15-5 9-4.5-11-2.5 12.5-2.5-12.5-4.5 11z"/>
        <path d="M13.5 27.5q9 3.2 18 0l1.4 4h-20.8z"/>
        <rect x="11" y="31" width="23" height="6.2" rx="2"/>`,
    K: `<path d="M20.8 5.5h3.4v3h3v3.4h-3v3h-3.4v-3h-3v-3.4h3z"/>
        <path d="M14.5 28.5C12 22.5 15.5 16 22.5 16s10.5 6.5 8 12.5z"/>
        <path d="M13.8 28q8.7 3.2 17.4 0l1.4 4h-20.2z"/>
        <rect x="11" y="31.4" width="23" height="6.2" rx="2"/>`,
};

const PREFS_KEY = "chess-openings-prefs";
const LEGACY_DARK_KEY = "chess-openings-dark";
const BOARD_THEMES = ["walnut", "forest", "ocean", "slate"];
// Traditional Staunton sets are bundled as local SVG files (rendered via <img>);
// the rest are CSS/markup-based.
const IMG_SETS = ["cburnett", "merida", "maestro"];
const PIECE_STYLES = ["cburnett", "merida", "maestro", "modern", "classic", "letters"];

let prefs = { theme: "light", pieces: "cburnett", board: "walnut" };

function loadPrefs() {
    try {
        const raw = localStorage.getItem(PREFS_KEY);
        if (raw) { prefs = Object.assign(prefs, JSON.parse(raw)); return; }
        // Migrate the old standalone dark-mode flag, if present.
        if (localStorage.getItem(LEGACY_DARK_KEY) === "true") prefs.theme = "dark";
    } catch (e) { /* keep defaults */ }
}
function savePrefs() {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) { /* quota */ }
}

// Inner markup for a piece in the current style.
function pieceInner(char) {
    if (IMG_SETS.includes(prefs.pieces)) {
        const file = (char === char.toUpperCase() ? "w" : "b") + char.toUpperCase() + ".svg";
        return { html: `<img class="piece-img" src="./pieces/${prefs.pieces}/${file}" alt="" draggable="false">` };
    }
    if (prefs.pieces === "classic") return { text: GLYPH[char] };
    if (prefs.pieces === "letters") return { html: `<span class="letter">${LETTER[char.toUpperCase()]}</span>` };
    return { html: `<svg viewBox="0 0 45 45" aria-hidden="true">${PIECE_SVG[char.toUpperCase()]}</svg>` };
}
const TIER_NAMES = { 1: "Foundations", 2: "Club Essentials", 3: "Specialised", 4: "Esoterica" };

let store;
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

// ── Drill runtime state ───────────────────────────────────────────────────
const lesson = {
    node: null,          // position node being drilled
    game: null,          // Chess instance
    orient: "w",         // board orientation ("w" = white at bottom)
    learner: "w",        // side to move in this position (the side you play)
    expected: null,      // Set of accepted UCI responses
    mistakes: 0,         // wrong attempts on this card
    plyWrongs: 0,        // wrong attempts since the last hint escalation
    selected: null,      // currently selected square name
    pieceEls: new Map(), // squareName -> piece element
    busy: false,         // animation/auto-replay in progress
    awaiting: false,     // waiting for the user's response
    lastMove: null,
    mode: "adaptive",    // "adaptive" | "practice"
    queue: [],           // session queue (posKeys)
    queueIdx: 0,
};

// ── Screen routing ──────────────────────────────────────────────────────────
function show(screenId) {
    $$(".screen").forEach((s) => s.classList.toggle("active", s.id === screenId));
}

// ════════════════════════════ Dashboard ════════════════════════════
function renderHome() {
    $("#stat-streak").textContent = store.data.streak.count;
    $("#stat-xp").textContent = store.data.xp;
    $("#stat-lessons").textContent = store.data.totalReviews;

    const session = store.buildSession();
    $("#daily-sub").textContent = session.length
        ? `${session.length} position${session.length > 1 ? "s" : ""} due today`
        : "All caught up — great work!";

    const weak = store.weakestCards();
    $("#btn-weakest").hidden = weak.length < 2;

    const container = $("#tier-sections");
    container.innerHTML = "";
    for (const tier of [1, 2, 3, 4]) {
        const positions = POSITIONS.filter((n) => n.tier === tier);
        if (!positions.length) continue;
        const unlocked = store.isTierUnlocked(tier);

        const section = document.createElement("div");
        section.className = `tier-section tier-${tier}` + (unlocked ? "" : " locked collapsed");

        const head = document.createElement("button");
        head.className = "tier-head";
        head.innerHTML = `
            <span class="tier-dot"></span>
            <span class="tier-name">Tier ${tier} · ${TIER_NAMES[tier]}</span>
            <span class="tier-count">${positions.length}</span>
            <span class="tier-status">${unlocked ? Math.round(store.tierMastery(tier)) + "%" : "🔒"}</span>
            <span class="tier-chev">▾</span>`;
        head.addEventListener("click", () => section.classList.toggle("collapsed"));
        section.appendChild(head);

        const body = document.createElement("div");
        body.className = "tier-body";

        // Group positions by their representative (most-common) opening for readability.
        const groups = new Map();
        for (const n of positions) {
            const repId = n.rep ? n.rep.id : "?";
            if (!groups.has(repId)) groups.set(repId, []);
            groups.get(repId).push(n);
        }
        const groupIds = Array.from(groups.keys())
            .sort((a, b) => OPENINGS.findIndex((o) => o.id === a) - OPENINGS.findIndex((o) => o.id === b));

        for (const gid of groupIds) {
            const o = OPENINGS.find((x) => x.id === gid);
            const grp = document.createElement("div");
            grp.className = "pos-group";
            grp.innerHTML = `<div class="pos-group-name">${o ? o.name : "Other"}
                <span class="pos-group-meta">${o ? (o.color === "w" ? "White" : "Black") + " · " + o.eco : ""}</span></div>`;
            const grid = document.createElement("div");
            grid.className = "pos-grid";
            for (const n of groups.get(gid).sort((a, b) => a.depth - b.depth)) {
                grid.appendChild(makePosCard(n, unlocked));
            }
            grp.appendChild(grid);
            body.appendChild(grp);
        }
        section.appendChild(body);
        container.appendChild(section);
    }
}

function makePosCard(node, unlocked) {
    const card = document.createElement("button");
    const mastery = store.cardMasteryPct(node.key);
    const mastered = store.cardMastered(node.key);
    const started = store.cardStarted(node.key);
    const due = store.cardDue(node.key);
    card.className = "pos-card" + (unlocked ? "" : " locked") +
        (mastered ? " mastered" : "") + (started && !mastered ? " in-progress" : "");

    const sideTxt = node.sideToMove === "w" ? "W" : "B";
    const n = node.responses.size;
    const subRight = n > 1 ? `${n} book moves` : "to play";
    card.innerHTML = `
        ${masteryRing(mastery, unlocked)}
        <div class="pos-info">
            <span class="pos-line">${node.san}</span>
            <span class="pos-sub">
                <span class="side-chip side-${node.sideToMove}">${sideTxt}</span>
                ${subRight}${due && started ? ' · <span class="due-tag">due</span>' : ""}</span>
        </div>
        <span class="op-badge">${mastered ? "★" : !unlocked ? "🔒" : ""}</span>`;

    card.addEventListener("click", () => {
        if (unlocked) startCard(node.key, "adaptive", [node.key], 0);
        else toast(`Reach Tier ${node.tier} by mastering earlier positions.`);
    });
    return card;
}

// SVG mastery ring.
function masteryRing(pct, open) {
    const r = 18, c = 2 * Math.PI * r;
    const off = c * (1 - pct / 100);
    const cls = open ? "" : "ring-locked";
    return `
        <svg class="ring ${cls}" viewBox="0 0 44 44" width="44" height="44">
            <circle class="ring-bg" cx="22" cy="22" r="${r}"></circle>
            <circle class="ring-fg" cx="22" cy="22" r="${r}"
                stroke-dasharray="${c}" stroke-dashoffset="${off}"></circle>
            <text x="22" y="26" text-anchor="middle" class="ring-text">${open ? pct + "%" : "🔒"}</text>
        </svg>`;
}

// ════════════════════════════ Board rendering ════════════════════════════
function buildBoardSquares() {
    const board = $("#board");
    board.dataset.board = prefs.board;
    board.dataset.pieces = prefs.pieces;
    board.innerHTML = "";
    // Fill the grid in screen order (top-left → bottom-right), mapping each
    // screen cell to its true square based on board orientation.
    for (let sr = 0; sr < 8; sr++) {
        for (let sf = 0; sf < 8; sf++) {
            const file = lesson.orient === "w" ? sf : 7 - sf;
            const row = lesson.orient === "w" ? sr : 7 - sr;
            const sq = document.createElement("div");
            const light = (row + file) % 2 === 0; // colour by true square
            sq.className = "square " + (light ? "light" : "dark");
            const name = String.fromCharCode(97 + file) + (8 - row);
            sq.dataset.sq = name;
            sq.addEventListener("click", () => onSquareTap(name));
            board.appendChild(sq);
        }
    }
}

// Screen position (% offset) of a square given board orientation.
function squarePos(name) {
    const file = name.charCodeAt(0) - 97;
    const rank = parseInt(name[1], 10);
    const row = 8 - rank;
    const sf = lesson.orient === "w" ? file : 7 - file;
    const sr = lesson.orient === "w" ? row : 7 - row;
    return { x: sf * 12.5, y: sr * 12.5 };
}

function placePieceEl(el, name) {
    const { x, y } = squarePos(name);
    el.style.transform = `translate(${x * 8}%, ${y * 8}%)`; // 8% of an 800%-wide track = 1 square
}

// Render all pieces from the engine board, keyed by square for animation.
function renderPieces() {
    const board = $("#board");
    board.querySelectorAll(".piece").forEach((e) => e.remove());
    lesson.pieceEls.clear();
    for (let i = 0; i < 64; i++) {
        const p = lesson.game.board[i];
        if (!p) continue;
        const name = idxToName(i);
        const el = document.createElement("div");
        el.className = `piece ps-${prefs.pieces} ` + (p === p.toUpperCase() ? "white" : "black");
        const inner = pieceInner(p);
        if (inner.text != null) el.textContent = inner.text; else el.innerHTML = inner.html;
        placePieceEl(el, name);
        board.appendChild(el);
        lesson.pieceEls.set(name, el);
    }
}

function clearHighlights() {
    $$("#board .square").forEach((s) => s.classList.remove("sel", "legal", "legal-cap", "last", "wrong", "hint"));
}

function markLast(from, to) {
    lesson.lastMove = { from, to };
    clearHighlights();
    applyLastTint();
}

function applyLastTint() {
    if (!lesson.lastMove) return;
    const fEl = $(`.square[data-sq="${lesson.lastMove.from}"]`);
    const tEl = $(`.square[data-sq="${lesson.lastMove.to}"]`);
    if (fEl) fEl.classList.add("last");
    if (tEl) tEl.classList.add("last");
}

// Apply a UCI move to the engine and animate the piece.
function applyMove(uci, isUser) {
    const spec = Chess.parseUci(uci);
    const fromName = spec.from, toName = spec.to;
    const result = lesson.game.move(spec);
    if (!result) return null;

    // Animate piece elements.
    const el = lesson.pieceEls.get(fromName);
    // Capture (normal)
    if (lesson.pieceEls.has(toName)) {
        const cap = lesson.pieceEls.get(toName);
        cap.classList.add("captured");
        setTimeout(() => cap.remove(), 180);
        lesson.pieceEls.delete(toName);
    }
    // En passant captured pawn
    if (result.ep) {
        const capName = toName[0] + fromName[1];
        const cap = lesson.pieceEls.get(capName);
        if (cap) { cap.classList.add("captured"); setTimeout(() => cap.remove(), 180); lesson.pieceEls.delete(capName); }
    }
    if (el) {
        placePieceEl(el, toName);
        lesson.pieceEls.delete(fromName);
        lesson.pieceEls.set(toName, el);
        el.classList.add("moved");
        setTimeout(() => el && el.classList.remove("moved"), 220);
    }
    // Castling rook
    if (result.castle) {
        const rookMap = { K: ["h1", "f1"], Q: ["a1", "d1"], k: ["h8", "f8"], q: ["a8", "d8"] }[result.castle];
        const rEl = lesson.pieceEls.get(rookMap[0]);
        if (rEl) { placePieceEl(rEl, rookMap[1]); lesson.pieceEls.delete(rookMap[0]); lesson.pieceEls.set(rookMap[1], rEl); }
    }

    markLast(fromName, toName);
    return result;
}

// ════════════════════════════ Drill flow ════════════════════════════
function startCard(key, mode, queue, queueIdx) {
    const node = POSITION_BY_KEY.get(key);
    lesson.node = node;
    lesson.mode = mode;
    lesson.queue = queue || [key];
    lesson.queueIdx = queueIdx || 0;
    lesson.game = new Chess();
    lesson.learner = node.sideToMove;
    lesson.orient = node.sideToMove;
    lesson.expected = new Set(node.responses.keys());
    lesson.mistakes = 0;
    lesson.plyWrongs = 0;
    lesson.selected = null;
    lesson.busy = true;
    lesson.awaiting = false;
    lesson.lastMove = null;

    const sideTxt = node.sideToMove === "w" ? "White" : "Black";
    $("#lesson-name").textContent = node.san;
    $("#lesson-meta").textContent =
        `${sideTxt} to move · Tier ${node.tier}${node.rep ? " · " + node.rep.name : ""}` +
        (mode === "practice" ? " · practice" : "");
    $("#move-note").textContent = node.rep ? node.rep.idea : "";
    updateProgress();

    buildBoardSquares();
    renderPieces();
    show("screen-lesson");

    replayThenAsk(node.path, 0);
}

// Briefly auto-replay the moves that lead to the position, then hand over.
function replayThenAsk(path, i) {
    if (i >= path.length) {
        lesson.busy = false;
        lesson.awaiting = true;
        const ind = $("#turn-indicator");
        ind.textContent = "Your move";
        ind.classList.remove("waiting");
        $("#move-note").textContent =
            `Find a good move for ${lesson.learner === "w" ? "White" : "Black"}.`;
        return;
    }
    const ind = $("#turn-indicator");
    ind.textContent = "…";
    ind.classList.add("waiting");
    setTimeout(() => {
        applyMove(path[i], false);
        replayThenAsk(path, i + 1);
    }, i === 0 ? 280 : 320);
}

function updateProgress() {
    const dots = [];
    for (let i = 0; i < lesson.queue.length; i++) {
        dots.push(`<span class="pdot ${i < lesson.queueIdx ? "done" : ""} ${i === lesson.queueIdx ? "current" : ""}"></span>`);
    }
    $("#lesson-progress").innerHTML = dots.join("");
}

// Tap handling: select a piece, show legal moves, then move.
function onSquareTap(name) {
    if (lesson.busy || !lesson.awaiting) return;
    const piece = lesson.game.pieceAt(name);
    const mine = piece && (piece === piece.toUpperCase() ? "w" : "b") === lesson.learner;

    if (lesson.selected && name !== lesson.selected) {
        // Attempt a move from the selected square to here.
        const legal = lesson.game.legalMovesFrom(lesson.selected).some((m) => idxToName(m.to) === name);
        if (legal) { attemptUserMove(lesson.selected, name); return; }
        // Re-select another own piece, or deselect.
        if (mine) selectSquare(name); else deselect();
        return;
    }
    if (mine) selectSquare(name);
    else deselect();
}

function selectSquare(name) {
    lesson.selected = name;
    clearHighlights();
    applyLastTint(); // keep the last-move tint visible while selecting
    const selEl = $(`.square[data-sq="${name}"]`);
    if (selEl) selEl.classList.add("sel");
    for (const m of lesson.game.legalMovesFrom(name)) {
        const t = $(`.square[data-sq="${idxToName(m.to)}"]`);
        if (t) t.classList.add(m.captured ? "legal-cap" : "legal");
    }
}

function deselect() {
    lesson.selected = null;
    clearHighlights();
    applyLastTint();
}

function attemptUserMove(from, to) {
    const playedUci = from + to;

    // Any pooled book move from this position is correct.
    if (lesson.expected.has(playedUci)) {
        lesson.plyWrongs = 0;
        deselect();
        const resp = lesson.node.responses.get(playedUci);
        applyMove(playedUci, true);
        $("#move-note").textContent = resp && resp.note ? "✓ " + resp.note : "✓ Correct!";
        flashConfirm(to);
        lesson.awaiting = false;
        lesson.busy = true;
        setTimeout(finishCard, 700);
    } else {
        lesson.mistakes += 1;
        wrongFeedback(from, to);
    }
}

function flashConfirm(to) {
    const el = lesson.pieceEls.get(to);
    if (el) { el.classList.add("confirm"); setTimeout(() => el && el.classList.remove("confirm"), 240); }
}

function wrongFeedback(from, to) {
    lesson.busy = true;
    lesson.plyWrongs += 1;
    deselect();
    // Flash the piece the user tried to move.
    const wrongEl = lesson.pieceEls.get(from);
    if (wrongEl) { wrongEl.classList.add("shake-red"); }
    const toSq = $(`.square[data-sq="${to}"]`);
    if (toSq) toSq.classList.add("wrong");

    setTimeout(() => {
        if (wrongEl) wrongEl.classList.remove("shake-red");
        if (toSq) toSq.classList.remove("wrong");
        clearHighlights();
        applyLastTint();
        // From the second wrong attempt we nudge — highlighting which piece(s) can
        // make a book move (never the destination, never naming the move).
        if (lesson.plyWrongs >= 2) {
            const froms = new Set(Array.from(lesson.expected).map((u) => u.slice(0, 2)));
            froms.forEach((sq) => { const el = $(`.square[data-sq="${sq}"]`); if (el) el.classList.add("hint"); });
            $("#move-note").textContent = "✗ Not quite — try one of the highlighted pieces.";
        } else {
            $("#move-note").textContent = "✗ Not a book move here — try again.";
        }
        lesson.busy = false; // re-enable input for another attempt
    }, 480);
}

function finishCard() {
    if (lesson.mode === "practice") {
        showComplete({ practice: true });
        return;
    }
    const res = store.gradeCard(lesson.node.key, lesson.mistakes);
    showComplete(res);
}

// ════════════════════════════ Completion overlay ════════════════════════════
function showComplete(info) {
    const ov = $("#complete-overlay");
    const node = lesson.node;
    const label = node.san || "Starting position";

    if (info.practice) {
        const m = store.cardMasteryPct(node.key);
        $("#complete-title").textContent = "Nailed it";
        $("#complete-sub").textContent = `${label} · practice (not scored)`;
        $("#complete-xp").textContent = "Free practice";
        $("#complete-burst").textContent = "♟";
        $("#complete-fill").style.width = m + "%";
        $("#complete-pct").textContent = m + "%";
    } else {
        const flawless = lesson.mistakes === 0;
        $("#complete-title").textContent = info.cardMastered ? "Position mastered! ★"
            : flawless ? "Correct!" : "Got there";
        $("#complete-sub").textContent =
            `${label} · ${flawless ? "first try" : lesson.mistakes + " miss" + (lesson.mistakes > 1 ? "es" : "")} · Tier ${info.tier} at ${info.tierMastery}%`;
        $("#complete-burst").textContent = info.cardMastered ? "♚" : flawless ? "♞" : "♟";
        animateXp(info.xp);
        $("#complete-fill").style.width = info.mastery + "%";
        $("#complete-pct").textContent = info.mastery + "%";
    }

    const hasNext = lesson.queueIdx < lesson.queue.length - 1;
    $("#complete-next").textContent = hasNext ? "Next position" : "Done";

    ov.hidden = false;
    ov.classList.remove("show");
    void ov.offsetWidth;
    ov.classList.add("show");
}

function animateXp(xp) {
    const el = $("#complete-xp");
    let cur = 0;
    el.textContent = "+0 XP";
    const step = Math.max(1, Math.round(xp / 14));
    const iv = setInterval(() => {
        cur = Math.min(xp, cur + step);
        el.textContent = `+${cur} XP`;
        if (cur >= xp) clearInterval(iv);
    }, 18);
}

function closeComplete() { $("#complete-overlay").hidden = true; }

// ════════════════════════════ Free practice ════════════════════════════
const filterState = { tier: "all", color: "all", mastery: "all" };

function openPractice() {
    show("screen-practice");
    renderPracticeList();
}

function renderPracticeList() {
    const list = $("#practice-list");
    list.innerHTML = "";
    const items = OPENINGS.filter((o) => {
        if (filterState.tier !== "all" && o.tier !== +filterState.tier) return false;
        if (filterState.color !== "all" && o.color !== filterState.color) return false;
        if (filterState.mastery !== "all") {
            const learned = store.openingLearned(o.id);
            const mastered = store.openingMastered(o.id);
            const started = learned > 0;
            const locked = !store.isTierUnlocked(o.tier);
            if (filterState.mastery === "locked" && !locked) return false;
            if (filterState.mastery === "mastered" && !mastered) return false;
            if (filterState.mastery === "progress" && (!started || mastered)) return false;
        }
        return true;
    });

    if (!items.length) { list.innerHTML = `<p class="empty">No openings match these filters.</p>`; return; }

    for (const o of items) {
        const keys = OPENING_CARDS.get(o.id) || [];
        const acc = store.openingAccuracy(o.id);
        const row = document.createElement("div");
        row.className = "practice-row";
        row.innerHTML = `
            <div class="pr-main">
                <span class="pr-name">${o.name}</span>
                <span class="pr-meta">T${o.tier} · ${o.eco} · ${o.color === "w" ? "White" : "Black"} · ${store.openingMastery(o.id)}%</span>
                <span class="pr-idea">${o.idea}</span>
                <span class="pr-stats">🎯 ${store.openingLearned(o.id)}/${store.openingTotal(o.id)} positions learned${acc != null ? ` · ${acc}% acc` : ""}</span>
            </div>
            <div class="pr-segs"></div>`;
        const segWrap = row.querySelector(".pr-segs");
        keys.forEach((k, idx) => {
            const b = document.createElement("button");
            b.className = "seg-btn";
            b.textContent = "Move " + (idx + 1);
            b.title = "Drill this position";
            b.addEventListener("click", () => startCard(k, "practice", [k], 0));
            segWrap.appendChild(b);
        });
        if (keys.length) {
            const full = document.createElement("button");
            full.className = "seg-btn full";
            full.textContent = "▶ All";
            full.title = "Drill every position in this line";
            full.addEventListener("click", () => startCard(keys[0], "practice", keys, 0));
            segWrap.appendChild(full);
        }
        list.appendChild(row);
    }
}

function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    t.classList.add("show");
    setTimeout(() => { t.classList.remove("show"); setTimeout(() => (t.hidden = true), 300); }, 1800);
}

// ════════════════════════════ Settings & theme ════════════════════════════
const BOARD_LABELS = { walnut: "Walnut", forest: "Forest", ocean: "Ocean", slate: "Slate" };
const PIECE_LABELS = {
    cburnett: "Classic", merida: "Merida", maestro: "Maestro",
    modern: "Modern", classic: "Symbols", letters: "Letters",
};

// Apply theme + piece + board prefs to the live DOM.
function applyPrefs() {
    document.body.classList.toggle("dark", prefs.theme === "dark");
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", prefs.theme === "dark" ? "#0e0e10" : "#f5f0d8");
    const board = $("#board");
    if (board) { board.dataset.board = prefs.board; board.dataset.pieces = prefs.pieces; }
    // If a board is currently populated, re-render its pieces in the new style.
    if (lesson.game && board && board.querySelector(".piece")) renderPieces();
}

// Build a small sample piece in a given style (for the settings previews).
function samplePiece(styleKey, color, type) {
    const saved = prefs.pieces;
    prefs.pieces = styleKey;
    const inner = pieceInner(color === "w" ? type.toUpperCase() : type.toLowerCase());
    prefs.pieces = saved;
    const cls = color === "w" ? "white" : "black";
    return `<span class="piece ps-${styleKey} ${cls} sample">${inner.text != null ? inner.text : inner.html}</span>`;
}

function renderSettings() {
    // Appearance segmented control
    $$("#seg-theme button").forEach((b) => b.classList.toggle("active", b.dataset.val === prefs.theme));

    // Piece style options with live previews
    const pieceWrap = $("#opt-pieces");
    pieceWrap.innerHTML = "";
    for (const style of PIECE_STYLES) {
        const tile = document.createElement("button");
        tile.className = "opt-tile" + (prefs.pieces === style ? " active" : "");
        tile.innerHTML = `
            <span class="opt-preview">${samplePiece(style, "w", "N")}${samplePiece(style, "b", "N")}</span>
            <span class="opt-label">${PIECE_LABELS[style]}</span>`;
        tile.addEventListener("click", () => { prefs.pieces = style; savePrefs(); applyPrefs(); renderSettings(); });
        pieceWrap.appendChild(tile);
    }

    // Board colour swatches
    const boardWrap = $("#opt-board");
    boardWrap.innerHTML = "";
    for (const b of BOARD_THEMES) {
        const sw = document.createElement("button");
        sw.className = "swatch" + (prefs.board === b ? " active" : "");
        sw.innerHTML = `
            <span class="swatch-board" data-board="${b}">
                <span class="sq light"></span><span class="sq dark"></span>
                <span class="sq dark"></span><span class="sq light"></span>
            </span>
            <span class="opt-label">${BOARD_LABELS[b]}</span>`;
        sw.addEventListener("click", () => { prefs.board = b; savePrefs(); applyPrefs(); renderSettings(); });
        boardWrap.appendChild(sw);
    }
}

function openSettings() { renderSettings(); show("screen-settings"); }

function init() {
    store = new Store();
    loadPrefs();
    applyPrefs();
    renderHome();

    $("#btn-settings").addEventListener("click", openSettings);
    $("#settings-back").addEventListener("click", () => { show("screen-home"); renderHome(); });
    $$("#seg-theme button").forEach((b) => b.addEventListener("click", () => {
        prefs.theme = b.dataset.val; savePrefs(); applyPrefs(); renderSettings();
    }));

    $("#btn-daily").addEventListener("click", () => {
        const queue = store.buildSession();
        if (!queue.length) { toast("Nothing due — try Free Practice!"); return; }
        startCard(queue[0], "adaptive", queue, 0);
    });
    $("#btn-practice").addEventListener("click", openPractice);
    $("#btn-weakest").addEventListener("click", () => {
        const weak = store.weakestCards();
        if (weak.length) startCard(weak[0], "adaptive", weak, 0);
    });

    $("#lesson-back").addEventListener("click", () => { show("screen-home"); renderHome(); });
    $("#practice-back").addEventListener("click", () => { show("screen-home"); renderHome(); });

    $("#complete-home").addEventListener("click", () => {
        closeComplete();
        show("screen-home");
        renderHome();
    });
    $("#complete-next").addEventListener("click", () => {
        closeComplete();
        if (lesson.queueIdx < lesson.queue.length - 1) {
            const nextIdx = lesson.queueIdx + 1;
            startCard(lesson.queue[nextIdx], lesson.mode, lesson.queue, nextIdx);
        } else {
            show("screen-home");
            renderHome();
        }
    });

    // Practice filter chips.
    $$("#filters .filter-group").forEach((group) => {
        const key = group.dataset.filter;
        group.querySelectorAll(".chip").forEach((chip) => {
            chip.addEventListener("click", () => {
                group.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
                chip.classList.add("active");
                filterState[key] = chip.dataset.val;
                renderPracticeList();
            });
        });
    });
}

document.addEventListener("DOMContentLoaded", init);

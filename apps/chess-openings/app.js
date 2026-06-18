// UI controller: dashboard, interactive board, lesson flow, free practice.

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

// ── Lesson runtime state ────────────────────────────────────────────────────
const lesson = {
    opening: null,
    game: null,          // Chess instance
    depth: 0,            // plies to play this lesson
    ply: 0,              // current ply index (0-based into opening.moves)
    orient: "w",         // board orientation ("w" = white at bottom)
    learner: "w",        // side the user plays
    mistakes: 0,
    userMoves: 0,
    userCorrect: 0,
    selected: null,      // currently selected square name
    pieceEls: new Map(), // squareName -> piece element
    busy: false,         // animation/auto-move in progress
    mode: "adaptive",    // "adaptive" | "practice"
    queue: [],           // adaptive session queue (opening ids)
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
    $("#stat-lessons").textContent = store.data.totalLessons;

    const session = store.buildSession();
    $("#daily-sub").textContent = session.length
        ? `${session.length} opening${session.length > 1 ? "s" : ""} queued today`
        : "All caught up — great work!";

    const weakest = store.weakestOpenings();
    $("#btn-weakest").hidden = weakest.length < 2;

    const container = $("#tier-sections");
    container.innerHTML = "";
    for (const tier of [1, 2, 3, 4]) {
        const openings = OPENINGS.filter((o) => o.tier === tier);
        const section = document.createElement("div");
        section.className = `tier-section tier-${tier}`;
        const unlocked = store.isTierUnlocked(tier);

        const head = document.createElement("div");
        head.className = "tier-head";
        head.innerHTML = `
            <span class="tier-dot"></span>
            <span class="tier-name">Tier ${tier} · ${TIER_NAMES[tier]}</span>
            <span class="tier-status">${unlocked ? Math.round(store.tierAvgMastery(tier)) + "%" : "🔒"}</span>`;
        section.appendChild(head);

        const grid = document.createElement("div");
        grid.className = "card-grid";
        for (const o of openings) grid.appendChild(makeCard(o));
        section.appendChild(grid);
        container.appendChild(section);
    }
}

function makeCard(o) {
    const card = document.createElement("button");
    const open = store.isOpeningUnlocked(o.id);
    const mastery = store.masteryPercent(o.id);
    const mastered = store.isMastered(o.id);
    card.className = `op-card tier-${o.tier}` +
        (open ? "" : " locked") + (mastered ? " mastered" : "") +
        (store.st(o.id).started && !mastered ? " in-progress" : "");

    const depth = store.unlockedDepth(o.id);
    const total = o.moves.length;
    const ring = masteryRing(mastery, open);

    card.innerHTML = `
        ${ring}
        <div class="op-info">
            <span class="op-name">${o.name}</span>
            <span class="op-eco">${o.eco} · ${o.color === "w" ? "White" : "Black"}</span>
            <span class="op-depth">${open
                ? (store.st(o.id).started ? `moves 1–${depth} of ${total}` : "ready to learn")
                : "locked"}</span>
        </div>
        <span class="op-badge">${mastered ? "★" : !open ? "🔒" : ""}</span>`;

    card.addEventListener("click", () => {
        if (open) startLesson(o.id, "adaptive", [o.id], 0);
        else openPracticeFor(o.id); // locked cards route to (clearly-marked) free practice
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

// ════════════════════════════ Lesson flow ════════════════════════════
function startLesson(id, mode, queue, queueIdx, fixedDepth) {
    const o = OPENINGS.find((x) => x.id === id);
    lesson.opening = o;
    lesson.mode = mode;
    lesson.queue = queue || [id];
    lesson.queueIdx = queueIdx || 0;
    lesson.game = new Chess();
    lesson.learner = o.color;
    lesson.orient = o.color;
    lesson.ply = 0;
    lesson.mistakes = 0;
    lesson.userMoves = 0;
    lesson.userCorrect = 0;
    lesson.plyWrongs = 0;
    lesson.selected = null;
    lesson.busy = false;
    lesson.lastMove = null;

    // Depth: adaptive uses the unlocked segment; practice uses a chosen/full depth.
    lesson.depth = fixedDepth || (mode === "adaptive" ? store.unlockedDepth(id) : o.moves.length);

    $("#lesson-name").textContent = o.name;
    $("#lesson-meta").textContent = `${o.eco} · play as ${o.color === "w" ? "White" : "Black"}` +
        (mode === "practice" ? " · practice" : "");
    $("#move-note").textContent = o.idea;
    updateProgress();

    buildBoardSquares();
    renderPieces();
    show("screen-lesson");

    // If the engine (opponent) moves first, play it.
    maybeOpponentMove();
    updateTurnIndicator();
}

function updateProgress() {
    const dots = [];
    for (let i = 0; i < lesson.depth; i++) {
        dots.push(`<span class="pdot ${i < lesson.ply ? "done" : ""}"></span>`);
    }
    $("#lesson-progress").innerHTML = dots.join("");
}

function updateTurnIndicator() {
    const ind = $("#turn-indicator");
    if (lesson.ply >= lesson.depth) { ind.textContent = ""; return; }
    const userTurn = lesson.game.turn === lesson.learner;
    ind.textContent = userTurn ? "Your move" : "…";
    ind.classList.toggle("waiting", !userTurn);
}

// Whose ply is it? Even ply index 0,2,4 = White's move; odd = Black's.
function isUserPly() {
    return lesson.game.turn === lesson.learner;
}

// If it's the opponent's turn at the current ply, play the book move automatically.
function maybeOpponentMove() {
    if (lesson.ply >= lesson.depth) { finishLesson(); return; }
    if (isUserPly()) return;
    lesson.busy = true;
    const bookMove = lesson.opening.moves[lesson.ply];
    setTimeout(() => {
        applyMove(bookMove.uci, false);
        if (bookMove.note) $("#move-note").textContent = bookMove.note;
        lesson.busy = false;
        afterMove();
    }, 420);
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
    lesson.ply += 1;
    return result;
}

// Tap handling: select a piece, show legal moves, then move.
function onSquareTap(name) {
    if (lesson.busy || lesson.ply >= lesson.depth || !isUserPly()) return;
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
    const expected = lesson.opening.moves[lesson.ply].uci;
    const playedUci = from + to;
    lesson.userMoves += 1;

    // Correct book move?
    const expFrom = expected.slice(0, 2), expTo = expected.slice(2, 4);
    if (from === expFrom && to === expTo) {
        lesson.userCorrect += 1;
        lesson.plyWrongs = 0; // reset wrong-attempt counter for the next ply
        deselect();
        const note = lesson.opening.moves[lesson.ply].note;
        applyMove(expected, true);
        $("#move-note").textContent = note || "";
        flashConfirm(to);
        afterMove();
    } else {
        // Wrong move — flash red and let the user try again (no auto-play).
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
        // Only from the second wrong attempt at this ply do we nudge — and only
        // by highlighting the piece that should move, never its destination, and
        // never naming the move.
        if (lesson.plyWrongs >= 2) {
            const expFrom = lesson.opening.moves[lesson.ply].uci.slice(0, 2);
            const hF = $(`.square[data-sq="${expFrom}"]`);
            if (hF) hF.classList.add("hint");
            $("#move-note").textContent = "✗ Not quite — try the highlighted piece.";
        } else {
            $("#move-note").textContent = "✗ Not quite — try again.";
        }
        lesson.busy = false; // re-enable input for another attempt
    }, 480);
}

function afterMove() {
    updateProgress();
    updateTurnIndicator();
    if (lesson.ply >= lesson.depth) { finishLesson(); return; }
    maybeOpponentMove();
}

function finishLesson() {
    const o = lesson.opening;
    if (lesson.mode === "practice") {
        // Practice never touches SRS/streak.
        showComplete({ practice: true });
        return;
    }
    const quality = Store.qualityFromMistakes(lesson.mistakes);
    const res = store.gradeLesson(o.id, quality, lesson.userMoves, lesson.userCorrect);
    showComplete({ quality, ...res });
}

// ════════════════════════════ Completion overlay ════════════════════════════
function showComplete(info) {
    const ov = $("#complete-overlay");
    const o = lesson.opening;
    const acc = lesson.userMoves ? Math.round((lesson.userCorrect / lesson.userMoves) * 100) : 100;

    if (info.practice) {
        $("#complete-title").textContent = "Line complete";
        $("#complete-sub").textContent = `${o.name} · ${acc}% accuracy · practice mode (not scored)`;
        $("#complete-xp").textContent = "Free practice";
        $("#complete-burst").textContent = "♟";
        $("#complete-fill").style.width = store.masteryPercent(o.id) + "%";
        $("#complete-pct").textContent = store.masteryPercent(o.id) + "%";
    } else {
        const passed = info.quality >= 3;
        $("#complete-title").textContent = info.mastered ? "Opening mastered! ★"
            : passed ? "Lesson complete!" : "Keep practising";
        $("#complete-sub").textContent =
            `${o.name} · ${lesson.mistakes === 0 ? "flawless" : lesson.mistakes + " slip" + (lesson.mistakes > 1 ? "s" : "")} · ${acc}% accuracy`;
        $("#complete-burst").textContent = info.mastered ? "♚" : passed ? "♞" : "♟";
        animateXp(info.xp);
        $("#complete-fill").style.width = info.mastery + "%";
        $("#complete-pct").textContent = info.mastery + "%";
    }

    // "Continue" advances the adaptive queue if more remain.
    const hasNext = lesson.mode === "adaptive" && lesson.queueIdx < lesson.queue.length - 1;
    $("#complete-next").textContent = hasNext ? "Next opening" : "Done";

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

function openPracticeFor(id) {
    // Jump straight into practising one opening (e.g. tapping a locked card).
    const o = OPENINGS.find((x) => x.id === id);
    startLesson(id, "practice", [id], 0, o.moves.length);
}

function renderPracticeList() {
    const list = $("#practice-list");
    list.innerHTML = "";
    const items = OPENINGS.filter((o) => {
        if (filterState.tier !== "all" && o.tier !== +filterState.tier) return false;
        if (filterState.color !== "all" && o.color !== filterState.color) return false;
        if (filterState.mastery !== "all") {
            const locked = !store.isOpeningUnlocked(o.id);
            const mastered = store.isMastered(o.id);
            const started = store.st(o.id).started;
            if (filterState.mastery === "locked" && !locked) return false;
            if (filterState.mastery === "mastered" && !mastered) return false;
            if (filterState.mastery === "progress" && (!started || mastered || locked)) return false;
        }
        return true;
    });

    if (!items.length) { list.innerHTML = `<p class="empty">No openings match these filters.</p>`; return; }

    for (const o of items) {
        const locked = !store.isOpeningUnlocked(o.id);
        const row = document.createElement("div");
        row.className = "practice-row" + (locked ? " locked" : "");
        const segs = srsSegmentsFor(o);
        const s = store.st(o.id);
        const stats = s.started ? statsLine(o.id) : "";
        row.innerHTML = `
            <div class="pr-main">
                <span class="pr-name">${o.name} ${locked ? '<span class="lock-tag">locked</span>' : ""}</span>
                <span class="pr-meta">T${o.tier} · ${o.eco} · ${o.color === "w" ? "White" : "Black"} · ${store.masteryPercent(o.id)}%</span>
                <span class="pr-idea">${o.idea}</span>
                ${stats}
            </div>
            <div class="pr-segs"></div>`;
        const segWrap = row.querySelector(".pr-segs");
        segs.forEach((depth, i) => {
            const b = document.createElement("button");
            b.className = "seg-btn";
            b.textContent = `1–${depth}`;
            b.title = `Drill the first ${depth} moves`;
            b.addEventListener("click", () => startLesson(o.id, "practice", [o.id], 0, depth));
            segWrap.appendChild(b);
        });
        // Full-line button is the last segment (already total); add a play-all label.
        const full = document.createElement("button");
        full.className = "seg-btn full";
        full.textContent = "▶ Full";
        full.addEventListener("click", () => startLesson(o.id, "practice", [o.id], 0, o.moves.length));
        segWrap.appendChild(full);
        list.appendChild(row);
    }
}

// Per-opening stats line for the practice library (times practised, accuracy,
// next review date, current depth unlocked).
function statsLine(id) {
    const o = OPENINGS.find((x) => x.id === id);
    const s = store.st(id);
    const acc = store.accuracy(id);
    const depth = store.unlockedDepth(id);
    const days = (function () {
        const t = srsTodayStr();
        const diff = Math.round((new Date(s.due + "T00:00:00") - new Date(t + "T00:00:00")) / 86400000);
        if (diff <= 0) return "due now";
        return diff === 1 ? "in 1 day" : `in ${diff} days`;
    })();
    return `<span class="pr-stats">
        🎯 ${s.practiced}× practised · ${acc != null ? acc + "% acc" : "—"} ·
        📅 review ${days} · 📖 moves 1–${depth} of ${o.moves.length}</span>`;
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
    // If a lesson board is currently populated, re-render its pieces in the new style.
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
        startLesson(queue[0], "adaptive", queue, 0);
    });
    $("#btn-practice").addEventListener("click", openPractice);
    $("#btn-weakest").addEventListener("click", () => {
        const weak = store.weakestOpenings();
        if (weak.length) startLesson(weak[0], "adaptive", weak, 0);
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
        if (lesson.mode === "adaptive" && lesson.queueIdx < lesson.queue.length - 1) {
            const nextIdx = lesson.queueIdx + 1;
            startLesson(lesson.queue[nextIdx], "adaptive", lesson.queue, nextIdx);
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

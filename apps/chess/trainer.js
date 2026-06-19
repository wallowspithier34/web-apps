// Opening trainer screen + drill screen controller.
// initTrainer() builds the dashboard; startDrill(key) navigates to the drill screen.

const TIER_NAMES = { 1: "Core Openings", 2: "Popular Lines", 3: "Advanced", 4: "Rare & Esoteric" };
const TIER_EMOJI = { 1: "★", 2: "☆", 3: "◇", 4: "○" };

// ── Drill state ────────────────────────────────────────────────────────────────
let _drillSession = [];   // array of position keys
let _drillIdx     = 0;
let _drillMistakes = 0;
let _drillBoardEl  = null;
let _drillGame     = null;
let _drillKey      = null;  // current card key
let _drillWaiting  = false; // computer is "thinking" / animating

// ── Trainer dashboard ─────────────────────────────────────────────────────────
function initTrainer() {
    const store = getStore();
    document.getElementById("tr-streak").textContent  = store.data.streak.count;
    document.getElementById("tr-xp").textContent      = store.data.xp;
    document.getElementById("tr-reviews").textContent = store.data.totalReviews;

    // Count due today
    const due = POSITIONS.filter((n) =>
        store.isTierUnlocked(n.tier) && store.cardDue(n.key)
    ).length;
    document.getElementById("tr-due").textContent = due;

    _buildTierSections();
}

function _buildTierSections() {
    const store   = getStore();
    const section = document.getElementById("tier-sections");
    section.innerHTML = "";

    for (let tier = 1; tier <= 4; tier++) {
        const openings = OPENINGS.filter((o) => o.tier === tier);
        if (!openings.length) continue;
        const unlocked = store.isTierUnlocked(tier);
        const mastery  = Math.round(store.tierMastery(tier));

        const wrap = document.createElement("div");
        wrap.className = "tier-section" + (unlocked ? "" : " locked");

        // Header
        const head = document.createElement("button");
        head.className = "tier-head";
        head.innerHTML = `
            <div class="tier-dot"></div>
            <div class="tier-name">${TIER_EMOJI[tier]} ${TIER_NAMES[tier]}</div>
            <div class="tier-status">${mastery}%</div>
            <div class="tier-chev">▼</div>`;
        head.addEventListener("click", () => wrap.classList.toggle("collapsed"));
        wrap.appendChild(head);

        // Body: one card per opening
        const body = document.createElement("div");
        body.className = "tier-body";
        const grid = document.createElement("div");
        grid.className = "pos-grid";

        for (const o of openings) {
            const card = _buildOpeningCard(o, store, unlocked);
            grid.appendChild(card);
        }
        body.appendChild(grid);
        wrap.appendChild(body);
        section.appendChild(wrap);
    }
}

function _buildOpeningCard(o, store, unlocked) {
    const mastery  = store.openingMastery(o.id);
    const learned  = store.openingLearned(o.id);
    const total    = store.openingTotal(o.id);
    const accuracy = store.openingAccuracy(o.id);
    const mastered = store.openingMastered(o.id);

    const card = document.createElement("div");
    card.className = "pos-card" + (mastered ? " mastered" : "") + (unlocked ? "" : " locked");

    // Mastery ring SVG
    const pct  = mastery;
    const r    = 10, cx = 12, cy = 12;
    const circ = 2 * Math.PI * r;
    const dash = circ * pct / 100;
    const ring = `<svg class="ring" viewBox="0 0 24 24" width="28" height="28">
        <circle class="ring-bg" cx="${cx}" cy="${cy}" r="${r}"/>
        <circle class="ring-fg" cx="${cx}" cy="${cy}" r="${r}"
            stroke-dasharray="${dash.toFixed(1)} ${circ.toFixed(1)}"
            stroke-dashoffset="0"/>
        <text class="ring-text" x="${cx}" y="${cy+4}" text-anchor="middle">${pct}%</text>
    </svg>`;

    const side = o.color === "w" ? "W" : "B";
    const sideClass = o.color === "w" ? "side-w" : "side-b";
    const accStr = accuracy != null ? `${accuracy}% acc` : "";

    card.innerHTML = `
        <div class="pos-info">
            <span class="pos-line">${o.name}</span>
            <span class="pos-sub">${o.eco} · <span class="side-chip ${sideClass}">${side}</span> · ${learned}/${total}</span>
            ${accStr ? `<span class="pos-sub due-tag">${accStr}</span>` : ""}
        </div>
        ${ring}`;

    if (unlocked) {
        card.addEventListener("click", () => {
            // Build a mini-session for this specific opening
            const keys = (OPENING_LINE.get(o.id) || []).map((c) => c.key);
            if (!keys.length) { showToast("No positions for this opening."); return; }
            _startDrillSession(keys.slice(0, 6), o.name);
        });
    }
    return card;
}

// ── Session management ─────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("btn-daily").addEventListener("click", () => {
        const store = getStore();
        const keys  = store.buildSession();
        if (!keys.length) { showToast("Nothing due — great job!"); return; }
        _startDrillSession(keys, "Daily Session");
    });

    document.getElementById("btn-weakest").addEventListener("click", () => {
        const store = getStore();
        const keys  = store.weakestCards();
        if (!keys.length) { showToast("Start your daily session first!"); return; }
        _startDrillSession(keys, "Weakest Positions");
    });

    document.getElementById("btn-browse").addEventListener("click", () => {
        initPractice();
        showScreen("screen-practice");
    });

    document.getElementById("btn-trainer-back").addEventListener("click", () => {
        showScreen("screen-home");
        refreshHome();
    });

    // Drill screen buttons
    document.getElementById("btn-drill-back").addEventListener("click", () => {
        showScreen("screen-trainer");
        initTrainer();
    });

    document.getElementById("comp-btn-home").addEventListener("click", () => {
        document.getElementById("complete-overlay").classList.remove("show");
        showScreen("screen-home");
        refreshHome();
    });

    document.getElementById("comp-btn-next").addEventListener("click", () => {
        document.getElementById("complete-overlay").classList.remove("show");
        _drillIdx++;
        if (_drillIdx < _drillSession.length) {
            _loadDrillCard(_drillSession[_drillIdx]);
        } else {
            // Session complete
            showToast("Session complete! 🎉");
            showScreen("screen-trainer");
            initTrainer();
        }
    });
});

function _startDrillSession(keys, name) {
    _drillSession  = keys;
    _drillIdx      = 0;
    _drillMistakes = 0;

    // Set session label
    document.getElementById("drill-name").textContent = name;

    // Build progress dots
    const prog = document.getElementById("drill-progress");
    prog.innerHTML = "";
    keys.forEach((_, i) => {
        const dot = document.createElement("div");
        dot.className = "pdot" + (i === 0 ? " current" : "");
        dot.id = `pdot-${i}`;
        prog.appendChild(dot);
    });

    showScreen("screen-drill");
    _drillBoardEl = document.getElementById("drill-board");
    _loadDrillCard(keys[0]);
}

// ── Drill flow ──────────────────────────────────────────────────────────────
function _loadDrillCard(key) {
    _drillKey      = key;
    _drillMistakes = 0;
    _drillWaiting  = true;

    const node = POSITION_BY_KEY.get(key);
    if (!node) { _advanceDrill(); return; }

    const prefs = getPrefs();
    const style = prefs.pieces;
    const color = node.sideToMove; // learner's color

    document.getElementById("turn-indicator").textContent = "Setting up…";
    document.getElementById("turn-indicator").className   = "waiting";
    document.getElementById("move-note").textContent      = "";

    // Rebuild position from start
    _drillGame = new Chess();
    for (const uci of node.path) {
        _drillGame.move(Chess.parseUci(uci));
    }

    Board.buildBoard(_drillBoardEl, color, _onDrillTap);
    Board.renderPieces(_drillGame, _drillBoardEl, style);

    Board.whenPiecesReady(() => {
        _drillWaiting = false;
        document.getElementById("turn-indicator").textContent = "Your move";
        document.getElementById("turn-indicator").className   = "";
    });

    // Update progress dots
    _drillSession.forEach((_, i) => {
        const dot = document.getElementById(`pdot-${i}`);
        if (!dot) return;
        dot.className = i < _drillIdx ? "pdot done" : i === _drillIdx ? "pdot current" : "pdot";
    });
}

function _onDrillTap(name) {
    if (_drillWaiting) return;
    const game = _drillGame;
    if (!game) return;

    const piece = game.board[nameToIdx(name)];
    const myTurn = game.turn;

    const prevSel = Board.getLastMove();  // we use a secondary selection state below
    const selKey = "_drillSel";

    if (window[selKey]) {
        const from = window[selKey];
        window[selKey] = null;

        if (from === name) { Board.deselect(); return; }

        // Try this move
        const legal = game.legalMovesFrom(from);
        const ti    = nameToIdx(name);
        const match = legal.find((m) => m.to === ti);
        if (match) {
            const uci = from + name + (match.promotion ? match.promotion.toLowerCase() : "");
            _attemptDrillMove(uci, from, name);
            return;
        }
        // Re-select own piece
        if (piece && (myTurn === "w" ? piece === piece.toUpperCase() : piece === piece.toLowerCase())) {
            window[selKey] = name;
            Board.selectSquare(name, game.legalMovesFrom(name));
        } else {
            Board.deselect();
        }
        return;
    }

    if (!piece) return;
    const isOwn = myTurn === "w" ? piece === piece.toUpperCase() : piece === piece.toLowerCase();
    if (!isOwn) return;
    window[selKey] = name;
    Board.selectSquare(name, game.legalMovesFrom(name));
}

function _attemptDrillMove(uci, from, to) {
    const node = POSITION_BY_KEY.get(_drillKey);
    if (!node) return;

    const isCorrect = node.responses.has(uci);
    if (isCorrect) {
        const resp = node.responses.get(uci);
        Board.animateMove(_drillGame, uci, getPrefs().pieces);
        Board.flashConfirm(to);
        document.getElementById("move-note").textContent = resp.note || "";
        _drillWaiting = true;
        setTimeout(() => _completeDrillCard(uci), 800);
    } else {
        _drillMistakes++;
        Board.markWrong(to);
        Board.shakeWrong(from);
        Board.deselect();
        document.getElementById("move-note").textContent = "Try again";
    }
}

function _completeDrillCard(uci) {
    const store  = getStore();
    const result = store.gradeCard(_drillKey, _drillMistakes, uci);
    _showCompletionOverlay(result);
}

function _showCompletionOverlay(result) {
    const { xp, mastery, cardMastered, tierMastery } = result;

    document.getElementById("comp-burst").textContent = cardMastered ? "★" : "✓";
    document.getElementById("comp-title").textContent = cardMastered ? "Mastered!" : "Correct!";
    document.getElementById("comp-sub").textContent   = cardMastered
        ? "This position is fully learned"
        : (_drillMistakes === 0 ? "Perfect recall" : `${_drillMistakes} hint(s) needed`);
    document.getElementById("comp-xp").textContent  = `+${xp} XP`;
    document.getElementById("comp-bar").style.width = `${mastery}%`;
    document.getElementById("comp-pct").textContent = `${mastery}% mastery`;

    const isLast = _drillIdx >= _drillSession.length - 1;
    document.getElementById("comp-btn-next").textContent = isLast ? "Finish" : "Next →";

    document.getElementById("complete-overlay").classList.add("show");
}

function _advanceDrill() {
    _drillIdx++;
    if (_drillIdx < _drillSession.length) {
        _loadDrillCard(_drillSession[_drillIdx]);
    } else {
        showToast("Session complete!");
        showScreen("screen-trainer");
        initTrainer();
    }
}

// ── Practice (browse) screen ───────────────────────────────────────────────────
let _filterTier  = 0;  // 0 = all
let _filterColor = ""; // "" = all, "w", "b"

function initPractice() {
    _filterTier  = 0;
    _filterColor = "";
    _renderPracticeFilters();
    _renderPracticeList();
}

function _renderPracticeFilters() {
    const tierEl  = document.getElementById("filter-tier");
    const colorEl = document.getElementById("filter-color");
    tierEl.innerHTML = "";
    colorEl.innerHTML = "";

    const tiers = [{ val: 0, label: "All" }, ...([1,2,3,4].map((t) => ({ val: t, label: `Tier ${t}` })))];
    for (const t of tiers) {
        const btn = document.createElement("button");
        btn.className = "chip" + (_filterTier === t.val ? " active" : "");
        btn.textContent = t.label;
        btn.addEventListener("click", () => { _filterTier = t.val; _renderPracticeFilters(); _renderPracticeList(); });
        tierEl.appendChild(btn);
    }
    const colors = [{ val: "", label: "All" }, { val: "w", label: "White" }, { val: "b", label: "Black" }];
    for (const c of colors) {
        const btn = document.createElement("button");
        btn.className = "chip" + (_filterColor === c.val ? " active" : "");
        btn.textContent = c.label;
        btn.addEventListener("click", () => { _filterColor = c.val; _renderPracticeFilters(); _renderPracticeList(); });
        colorEl.appendChild(btn);
    }
}

function _renderPracticeList() {
    const store = getStore();
    const list  = document.getElementById("practice-list");
    list.innerHTML = "";

    let openings = OPENINGS;
    if (_filterTier)  openings = openings.filter((o) => o.tier === _filterTier);
    if (_filterColor) openings = openings.filter((o) => o.color === _filterColor);

    if (!openings.length) {
        list.innerHTML = `<div class="empty-msg">No openings match this filter.</div>`;
        return;
    }

    for (const o of openings) {
        const unlocked = store.isTierUnlocked(o.tier);
        const mastery  = store.openingMastery(o.id);
        const learned  = store.openingLearned(o.id);
        const total    = store.openingTotal(o.id);
        const accuracy = store.openingAccuracy(o.id);
        const accStr   = accuracy != null ? ` · ${accuracy}% accuracy` : "";

        const row = document.createElement("div");
        row.className = "practice-row";
        const side = o.color === "w" ? "White" : "Black";
        row.innerHTML = `
            <span class="pr-name">${o.name}</span>
            <span class="pr-meta">Tier ${o.tier} · ${o.eco} · ${side}</span>
            <span class="pr-idea">${o.idea || ""}</span>
            <span class="pr-stats">${learned}/${total} learned · ${mastery}% mastery${accStr}</span>
            <div class="pr-segs">
                <button class="seg-btn${unlocked ? " full" : ""}" data-id="${o.id}">${unlocked ? "Drill" : "Locked"}</button>
            </div>`;

        const btn = row.querySelector(".seg-btn");
        if (unlocked) {
            btn.addEventListener("click", () => {
                const keys = (OPENING_LINE.get(o.id) || []).map((c) => c.key).slice(0, 8);
                if (!keys.length) { showToast("No positions yet."); return; }
                _startDrillSession(keys, o.name);
            });
        }
        list.appendChild(row);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("btn-practice-back").addEventListener("click", () => {
        showScreen("screen-trainer");
        initTrainer();
    });
});

window.initTrainer  = initTrainer;
window.initPractice = initPractice;

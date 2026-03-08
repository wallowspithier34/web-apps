(() => {
    "use strict";

    // ===== CONSTANTS =====
    const SUITS = ["hearts", "spades", "diamonds", "clubs"];
    // Pre-built suit index for O(1) lookup during solver
    const SUIT_INDEX = { hearts: 0, spades: 1, diamonds: 2, clubs: 3 };
    const SUIT_SYMBOLS = { hearts: "\u2665", spades: "\u2660", diamonds: "\u2666", clubs: "\u2663" };
    const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
    const RANK_VALUES = { A:1, "2":2, "3":3, "4":4, "5":5, "6":6, "7":7, "8":8, "9":9, "10":10, J:11, Q:12, K:13 };

    // Four-color display but standard red/black grouping for game rules
    const SUIT_GROUP = { hearts: "red", diamonds: "red", spades: "black", clubs: "black" };

    // ===== SEEDED PRNG (Mulberry32) =====
    function mulberry32(seed) {
        return function() {
            seed |= 0;
            seed = seed + 0x6D2B79F5 | 0;
            let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
            t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    // ===== CARD MODEL =====
    function createCard(suit, rank) {
        return {
            suit,
            rank,
            value: RANK_VALUES[rank],
            group: SUIT_GROUP[suit],
            faceUp: false,
            id: suit[0] + rank // compact id: h10, sK, dA, c3, etc.
        };
    }

    function createDeck(rng) {
        const deck = [];
        for (const suit of SUITS) {
            for (const rank of RANKS) {
                deck.push(createCard(suit, rank));
            }
        }
        // Fisher-Yates shuffle
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        return deck;
    }

    // ===== GAME STATE =====
    let state = {
        stock: [],
        waste: [],
        foundations: [[], [], [], []],
        tableau: [[], [], [], [], [], [], []],
        moveHistory: [],
        moves: 0,
        seed: 0,
        selectedCard: null,
        gameWon: false,
        dealing: false
    };

    function deal(deck) {
        state.stock = [];
        state.waste = [];
        state.foundations = [[], [], [], []];
        state.tableau = [[], [], [], [], [], [], []];
        state.moveHistory = [];
        state.moves = 0;
        state.gameWon = false;
        state.selectedCard = null;

        let idx = 0;
        for (let col = 0; col < 7; col++) {
            for (let row = 0; row <= col; row++) {
                const card = deck[idx++];
                card.faceUp = (row === col);
                state.tableau[col].push(card);
            }
        }
        while (idx < 52) {
            const card = deck[idx++];
            card.faceUp = false;
            state.stock.push(card);
        }
    }

    // ===== PILE ACCESS =====
    function getPile(pileId) {
        if (pileId === "stock") return state.stock;
        if (pileId === "waste") return state.waste;
        if (pileId[0] === "f") return state.foundations[parseInt(pileId[1])];
        if (pileId[0] === "t") return state.tableau[parseInt(pileId[1])];
        return null;
    }

    // ===== MOVE RULES =====
    function canMoveToFoundation(card, fi) {
        const pile = state.foundations[fi];
        if (card.suit !== SUITS[fi]) return false;
        if (pile.length === 0) return card.rank === "A";
        return card.value === pile[pile.length - 1].value + 1;
    }

    function canMoveToTableau(card, ti) {
        const pile = state.tableau[ti];
        if (pile.length === 0) return card.rank === "K";
        const top = pile[pile.length - 1];
        return top.faceUp && card.group !== top.group && card.value === top.value - 1;
    }

    // Find which foundation accepts this card, or -1
    function findFoundationFor(card) {
        for (let i = 0; i < 4; i++) {
            if (canMoveToFoundation(card, i)) return i;
        }
        return -1;
    }

    // Check if moving cards from fromPile[cardIndex..] to toPile is valid
    function isValidMove(fromPileId, cardIndex, toPileId) {
        const fromPile = getPile(fromPileId);
        const card = fromPile[cardIndex];
        if (!card || !card.faceUp) return false;

        if (toPileId[0] === "f") {
            // Only single cards to foundation
            if (cardIndex !== fromPile.length - 1) return false;
            return canMoveToFoundation(card, parseInt(toPileId[1]));
        }
        if (toPileId[0] === "t") {
            return canMoveToTableau(card, parseInt(toPileId[1]));
        }
        return false;
    }

    function executeMove(fromPileId, cardIndex, toPileId) {
        const fromPile = getPile(fromPileId);
        const toPile = getPile(toPileId);
        const cards = fromPile.splice(cardIndex);
        toPile.push(...cards);

        let flipped = false;
        if (fromPileId[0] === "t" && fromPile.length > 0) {
            const newTop = fromPile[fromPile.length - 1];
            if (!newTop.faceUp) {
                newTop.faceUp = true;
                flipped = true;
            }
        }

        state.moveHistory.push({ fromPileId, toPileId, cardCount: cards.length, flipped });
        state.moves++;
    }

    function drawFromStock() {
        if (state.stock.length === 0) {
            if (state.waste.length === 0) return false;
            // Recycle waste back to stock
            state.stock = state.waste.slice().reverse();
            state.stock.forEach(c => { c.faceUp = false; });
            state.waste = [];
            state.moveHistory.push({ type: "recycle" });
            state.moves++;
        } else {
            const card = state.stock.pop();
            card.faceUp = true;
            state.waste.push(card);
            state.moveHistory.push({ type: "draw" });
            state.moves++;
        }
        return true;
    }

    function undo() {
        if (state.moveHistory.length === 0) return;
        const rec = state.moveHistory.pop();
        state.moves = Math.max(0, state.moves - 1);

        if (rec.type === "draw") {
            const card = state.waste.pop();
            card.faceUp = false;
            state.stock.push(card);
        } else if (rec.type === "recycle") {
            state.waste = state.stock.slice().reverse();
            state.waste.forEach(c => { c.faceUp = true; });
            state.stock = [];
        } else {
            if (rec.flipped) {
                const fromPile = getPile(rec.fromPileId);
                if (fromPile.length > 0) fromPile[fromPile.length - 1].faceUp = false;
            }
            const toPile = getPile(rec.toPileId);
            const cards = toPile.splice(toPile.length - rec.cardCount);
            getPile(rec.fromPileId).push(...cards);
        }
    }

    function checkWin() {
        return state.foundations.every(f => f.length === 13);
    }

    // ===== SOLVABILITY SOLVER =====
    // DFS solver in "Thoughtful Klondike" mode (sees all cards).
    // Confirms a deal is solvable. Time-limited to avoid blocking UI.
    function solverVerify(deck, timeLimitMs) {
        // Build solver state from deck (mirrors deal() layout)
        const s0 = solverDeal(deck);
        const visited = new Set();
        const deadline = performance.now() + timeLimitMs;
        let nodeCount = 0;
        const MAX_NODES = 25000;

        function solverDeal(deck) {
            const s = {
                stock: [],
                waste: [],
                fTop: [0, 0, 0, 0], // foundation top value per suit index
                tableau: []
            };
            let idx = 0;
            for (let col = 0; col < 7; col++) {
                const column = [];
                for (let row = 0; row <= col; row++) {
                    const c = deck[idx++];
                    column.push({ suit: c.suit, value: c.value, group: c.group, faceUp: row === col, id: c.id });
                }
                s.tableau.push(column);
            }
            while (idx < 52) {
                const c = deck[idx++];
                s.stock.push({ suit: c.suit, value: c.value, group: c.group, id: c.id });
            }
            return s;
        }

        // Compact state hash for cycle detection
        function hashState(s) {
            let h = s.fTop.join("") + "|" + s.stock.length + "|" + s.waste.length;
            if (s.waste.length > 0) h += s.waste[s.waste.length - 1].id;
            for (let i = 0; i < 7; i++) {
                h += "|";
                const col = s.tableau[i];
                for (let j = 0; j < col.length; j++) {
                    h += col[j].id;
                    h += col[j].faceUp ? "u" : "d";
                }
            }
            return h;
        }

        function cloneState(s) {
            return {
                stock: s.stock.map(c => ({ ...c })),
                waste: s.waste.map(c => ({ ...c })),
                fTop: s.fTop.slice(),
                tableau: s.tableau.map(col => col.map(c => ({ ...c })))
            };
        }

        function suitIndex(suit) {
            return SUIT_INDEX[suit];
        }

        // Generate all legal moves, sorted by priority
        function getMoves(s) {
            const moves = [];

            // Foundation moves (highest priority — always try these first)
            if (s.waste.length > 0) {
                const c = s.waste[s.waste.length - 1];
                if (c.value === s.fTop[suitIndex(c.suit)] + 1) {
                    moves.push({ type: "wf", suit: c.suit });
                }
            }
            for (let i = 0; i < 7; i++) {
                const col = s.tableau[i];
                if (col.length === 0) continue;
                const c = col[col.length - 1];
                if (c.faceUp && c.value === s.fTop[suitIndex(c.suit)] + 1) {
                    moves.push({ type: "tf", col: i, suit: c.suit });
                }
            }

            // Tableau-to-tableau moves
            for (let from = 0; from < 7; from++) {
                const col = s.tableau[from];
                if (col.length === 0) continue;
                // Find topmost face-up card
                let startIdx = col.length - 1;
                while (startIdx > 0 && col[startIdx - 1].faceUp) startIdx--;

                for (let idx = startIdx; idx < col.length; idx++) {
                    const card = col[idx];
                    if (!card.faceUp) continue;
                    for (let to = 0; to < 7; to++) {
                        if (to === from) continue;
                        const dest = s.tableau[to];
                        if (dest.length === 0) {
                            // King to empty — only useful if it uncovers something
                            if (card.value === 13 && idx > 0) {
                                moves.push({ type: "tt", from, to, idx, priority: 2 });
                            }
                        } else {
                            const top = dest[dest.length - 1];
                            if (top.faceUp && card.group !== top.group && card.value === top.value - 1) {
                                // Bonus priority if it uncovers a face-down card
                                const pri = (idx > 0 && !col[idx - 1].faceUp) ? 1 : 3;
                                moves.push({ type: "tt", from, to, idx, priority: pri });
                            }
                        }
                    }
                }
            }

            // Waste-to-tableau moves
            if (s.waste.length > 0) {
                const card = s.waste[s.waste.length - 1];
                for (let to = 0; to < 7; to++) {
                    const dest = s.tableau[to];
                    if (dest.length === 0) {
                        if (card.value === 13) moves.push({ type: "wt", to, priority: 4 });
                    } else {
                        const top = dest[dest.length - 1];
                        if (top.faceUp && card.group !== top.group && card.value === top.value - 1) {
                            moves.push({ type: "wt", to, priority: 4 });
                        }
                    }
                }
            }

            // Draw from stock
            if (s.stock.length > 0) {
                moves.push({ type: "draw", priority: 5 });
            } else if (s.waste.length > 1) {
                // Recycle (limit to 2 recycles to bound search)
                moves.push({ type: "recycle", priority: 6 });
            }

            // Sort by priority (foundation moves first, then uncover, etc.)
            moves.sort((a, b) => (a.priority || 0) - (b.priority || 0));
            return moves;
        }

        function applyMove(s, move) {
            const ns = cloneState(s);
            switch (move.type) {
                case "wf": {
                    ns.waste.pop();
                    ns.fTop[suitIndex(move.suit)]++;
                    break;
                }
                case "tf": {
                    ns.tableau[move.col].pop();
                    ns.fTop[suitIndex(move.suit)]++;
                    const col = ns.tableau[move.col];
                    if (col.length > 0 && !col[col.length - 1].faceUp) col[col.length - 1].faceUp = true;
                    break;
                }
                case "tt": {
                    const cards = ns.tableau[move.from].splice(move.idx);
                    ns.tableau[move.to].push(...cards);
                    const col = ns.tableau[move.from];
                    if (col.length > 0 && !col[col.length - 1].faceUp) col[col.length - 1].faceUp = true;
                    break;
                }
                case "wt": {
                    const card = ns.waste.pop();
                    card.faceUp = true;
                    ns.tableau[move.to].push(card);
                    break;
                }
                case "draw": {
                    const card = ns.stock.pop();
                    card.faceUp = true;
                    ns.waste.push(card);
                    break;
                }
                case "recycle": {
                    ns.stock = ns.waste.reverse();
                    ns.stock.forEach(c => { c.faceUp = false; });
                    ns.waste = [];
                    break;
                }
            }
            return ns;
        }

        // Auto-play safe foundation moves (cards that can go to foundation without
        // affecting future play — value <= min foundation value + 1 for all suits)
        function autoFoundation(s) {
            let changed = true;
            while (changed) {
                changed = false;
                // Waste card
                if (s.waste.length > 0) {
                    const c = s.waste[s.waste.length - 1];
                    const si = suitIndex(c.suit);
                    if (c.value === s.fTop[si] + 1 && isSafeToFoundation(s, c)) {
                        s.waste.pop();
                        s.fTop[si]++;
                        changed = true;
                    }
                }
                // Tableau tops
                for (let i = 0; i < 7; i++) {
                    const col = s.tableau[i];
                    if (col.length === 0) continue;
                    const c = col[col.length - 1];
                    if (!c.faceUp) continue;
                    const si = suitIndex(c.suit);
                    if (c.value === s.fTop[si] + 1 && isSafeToFoundation(s, c)) {
                        col.pop();
                        s.fTop[si]++;
                        if (col.length > 0 && !col[col.length - 1].faceUp) col[col.length - 1].faceUp = true;
                        changed = true;
                    }
                }
            }
            return s;
        }

        // A card is safe to auto-play to foundation if both opposite-color suits
        // already have foundation values >= this card's value - 1
        function isSafeToFoundation(s, card) {
            const needed = card.value - 1;
            for (let i = 0; i < 4; i++) {
                if (SUIT_GROUP[SUITS[i]] !== card.group && s.fTop[i] < needed) return false;
            }
            return true;
        }

        function dfs(s, depth) {
            // Auto-play safe foundation moves (s is already a fresh clone from applyMove)
            autoFoundation(s);

            // Check win
            if (s.fTop[0] + s.fTop[1] + s.fTop[2] + s.fTop[3] === 52) return true;

            if (++nodeCount > MAX_NODES) return false;
            if (depth > 200) return false;
            if (nodeCount % 500 === 0 && performance.now() > deadline) return false;

            const hash = hashState(s);
            if (visited.has(hash)) return false;
            visited.add(hash);

            const moves = getMoves(s);
            for (const move of moves) {
                if (dfs(applyMove(s, move), depth + 1)) return true;
                if (nodeCount > MAX_NODES || performance.now() > deadline) return false;
            }
            return false;
        }

        return dfs(s0, 0);
    }

    // ===== DEAL GENERATOR =====
    // Generates random deals until the solver confirms one is solvable
    async function generateSolvableDeal() {
        state.dealing = true;
        showLoading(true);

        return new Promise((resolve) => {
            let attempts = 0;
            const maxAttempts = 30;

            function tryDeal() {
                attempts++;
                const seed = Date.now() * 1000 + attempts;
                const rng = mulberry32(seed);
                const deck = createDeck(rng);

                const solvable = solverVerify(deck, 1200);

                if (solvable) {
                    state.seed = seed;
                    deal(deck);
                    state.dealing = false;
                    showLoading(false);
                    resolve(true);
                } else if (attempts < maxAttempts) {
                    setTimeout(tryDeal, 0); // yield to browser
                } else {
                    // Fallback (extremely unlikely): use last deal
                    state.seed = seed;
                    deal(deck);
                    state.dealing = false;
                    showLoading(false);
                    resolve(true);
                }
            }

            setTimeout(tryDeal, 16); // let loading overlay paint first
        });
    }

    function showLoading(show) {
        document.getElementById("loading-overlay").classList.toggle("hidden", !show);
    }

    // ===== RENDERER =====
    function render() {
        renderStock();
        renderWaste();
        for (let i = 0; i < 4; i++) renderFoundation(i);
        for (let i = 0; i < 7; i++) renderTableauCol(i);
        document.getElementById("move-count").textContent = state.moves + (state.moves === 1 ? " move" : " moves");
    }

    function renderStock() {
        const el = document.getElementById("stock");
        el.innerHTML = "";
        el.classList.toggle("empty", state.stock.length === 0 && state.waste.length > 0);
        if (state.stock.length > 0) {
            const card = document.createElement("div");
            card.className = "card face-down";
            card.style.position = "relative";
            card.dataset.pile = "stock";
            card.dataset.index = String(state.stock.length - 1);
            el.appendChild(card);
        }
    }

    function renderWaste() {
        const el = document.getElementById("waste");
        el.innerHTML = "";
        if (state.waste.length > 0) {
            const card = state.waste[state.waste.length - 1];
            const cardEl = createCardElement(card);
            cardEl.style.position = "relative";
            cardEl.dataset.pile = "waste";
            cardEl.dataset.index = String(state.waste.length - 1);
            if (isSelected("waste", state.waste.length - 1)) cardEl.classList.add("selected");
            el.appendChild(cardEl);
        }
    }

    function renderFoundation(fi) {
        const el = document.getElementById("f" + fi);
        el.innerHTML = "";
        el.dataset.suitSymbol = SUIT_SYMBOLS[SUITS[fi]];
        const pile = state.foundations[fi];
        if (pile.length > 0) {
            const card = pile[pile.length - 1];
            const cardEl = createCardElement(card);
            cardEl.style.position = "relative";
            cardEl.dataset.pile = "f" + fi;
            cardEl.dataset.index = String(pile.length - 1);
            el.appendChild(cardEl);
        }
    }

    function renderTableauCol(ti) {
        const el = document.getElementById("t" + ti);
        el.innerHTML = "";
        const pile = state.tableau[ti];
        let yOffset = 0;
        pile.forEach((card, index) => {
            const cardEl = createCardElement(card);
            cardEl.style.top = yOffset + "px";
            cardEl.style.left = "0";
            cardEl.style.zIndex = String(index);
            cardEl.dataset.pile = "t" + ti;
            cardEl.dataset.index = String(index);
            if (isSelected("t" + ti, index)) cardEl.classList.add("selected");
            el.appendChild(cardEl);
            yOffset += card.faceUp ? 22 : 16;
        });
    }

    function createCardElement(card) {
        const el = document.createElement("div");
        el.className = "card" + (card.faceUp ? "" : " face-down");
        el.dataset.cardId = card.id;
        el.dataset.suit = card.suit;
        if (card.faceUp) {
            const sym = SUIT_SYMBOLS[card.suit];
            el.innerHTML =
                '<div class="card-inner">' +
                    '<div class="card-tl"><span>' + card.rank + '</span><span>' + sym + '</span></div>' +
                    '<div class="card-center">' + sym + '</div>' +
                    '<div class="card-br"><span>' + card.rank + '</span><span>' + sym + '</span></div>' +
                '</div>';
        }
        return el;
    }

    function isSelected(pileId, index) {
        if (!state.selectedCard) return false;
        const sel = state.selectedCard;
        if (sel.pileId !== pileId) return false;
        // Highlight the selected card and all cards below it in a tableau stack
        if (pileId[0] === "t") return index >= sel.cardIndex;
        return index === sel.cardIndex;
    }

    // ===== INPUT: DRAG & DROP + TAP =====
    let dragState = null;
    let highlightRafPending = false;

    function initInput() {
        const board = document.getElementById("board");

        board.addEventListener("touchstart", onPointerDown, { passive: false });
        board.addEventListener("touchmove", onPointerMove, { passive: false });
        board.addEventListener("touchend", onPointerUp, { passive: false });
        board.addEventListener("touchcancel", onPointerCancel, { passive: false });

        board.addEventListener("mousedown", onPointerDown);
        board.addEventListener("mousemove", onPointerMove);
        board.addEventListener("mouseup", onPointerUp);
    }

    function getXY(e) {
        // changedTouches works for all touch events including touchend; fall back to mouse event
        const t = e.changedTouches ? e.changedTouches[0] : (e.touches ? e.touches[0] : e);
        return { x: t.clientX, y: t.clientY };
    }

    function onPointerDown(e) {
        if (state.dealing || state.gameWon) return;
        const { x, y } = getXY(e);
        const cardEl = document.elementFromPoint(x, y);
        if (!cardEl) return;
        const card = cardEl.closest(".card");
        if (!card) {
            // Tapped empty stock area — recycle
            const stockEl = cardEl.closest("#stock");
            if (stockEl && state.stock.length === 0 && state.waste.length > 0) {
                drawFromStock();
                render();
            }
            return;
        }

        const pileId = card.dataset.pile;
        const cardIndex = parseInt(card.dataset.index);

        // Stock tap: draw
        if (pileId === "stock") {
            e.preventDefault();
            drawFromStock();
            render();
            return;
        }

        const pile = getPile(pileId);
        if (!pile[cardIndex] || !pile[cardIndex].faceUp) return;

        // Only top card from waste/foundations
        if ((pileId === "waste" || pileId[0] === "f") && cardIndex !== pile.length - 1) return;

        e.preventDefault();

        const rect = card.getBoundingClientRect();
        const cardsToMove = (pileId[0] === "t") ? pile.slice(cardIndex) : [pile[cardIndex]];

        dragState = {
            fromPile: pileId,
            cardIndex,
            cards: cardsToMove,
            startX: x,
            startY: y,
            offsetX: x - rect.left,
            offsetY: y - rect.top,
            ghostEls: [],
            moved: false,
            sourceEls: []
        };

        // Create ghost copies
        cardsToMove.forEach((c, i) => {
            const ghost = createCardElement(c);
            ghost.classList.add("dragging");
            ghost.style.position = "fixed";
            ghost.style.width = rect.width + "px";
            ghost.style.height = rect.height + "px";
            ghost.style.left = rect.left + "px";
            ghost.style.top = (rect.top + i * 22) + "px";
            ghost.style.zIndex = String(1000 + i);
            ghost.style.pointerEvents = "none";
            document.body.appendChild(ghost);
            dragState.ghostEls.push(ghost);
        });

        // Dim source cards
        const pileEl = document.getElementById(pileId);
        const allCards = pileEl.querySelectorAll(".card");
        allCards.forEach((el) => {
            if (parseInt(el.dataset.index) >= cardIndex) {
                el.classList.add("drag-source");
                dragState.sourceEls.push(el);
            }
        });
    }

    function onPointerMove(e) {
        if (!dragState) return;
        e.preventDefault();
        const { x, y } = getXY(e);

        const dx = x - dragState.offsetX;
        const dy = y - dragState.offsetY;

        dragState.ghostEls.forEach((ghost, i) => {
            ghost.style.left = dx + "px";
            ghost.style.top = (dy + i * 22) + "px";
        });

        if (Math.abs(x - dragState.startX) > 5 || Math.abs(y - dragState.startY) > 5) {
            dragState.moved = true;
        }

        // Throttle drop-target highlighting to once per animation frame
        dragState.lastX = x;
        dragState.lastY = y;
        if (!highlightRafPending) {
            highlightRafPending = true;
            requestAnimationFrame(() => {
                highlightRafPending = false;
                if (dragState) highlightDropTarget(dragState.lastX, dragState.lastY);
            });
        }
    }

    function onPointerUp(e) {
        if (!dragState) return;
        const { x, y } = getXY(e);

        // Clean up ghosts and dim
        dragState.ghostEls.forEach(g => g.remove());
        dragState.sourceEls.forEach(el => el.classList.remove("drag-source"));
        clearDropHighlights();

        if (!dragState.moved) {
            handleTap(dragState.fromPile, dragState.cardIndex);
            dragState = null;
            return;
        }

        // Find drop target
        const targetPile = findDropTarget(x, y);
        if (targetPile && targetPile !== dragState.fromPile && isValidMove(dragState.fromPile, dragState.cardIndex, targetPile)) {
            executeMove(dragState.fromPile, dragState.cardIndex, targetPile);
            if (checkWin()) onWin();
            else if (canAutoComplete()) autoComplete();
        }

        dragState = null;
        render();
    }

    function onPointerCancel() {
        if (!dragState) return;
        dragState.ghostEls.forEach(g => g.remove());
        dragState.sourceEls.forEach(el => el.classList.remove("drag-source"));
        clearDropHighlights();
        dragState = null;
    }

    function findDropTarget(x, y) {
        // Check foundations first (they're smaller targets)
        for (let i = 0; i < 4; i++) {
            const el = document.getElementById("f" + i);
            const rect = el.getBoundingClientRect();
            if (x >= rect.left - 4 && x <= rect.right + 4 && y >= rect.top - 4 && y <= rect.bottom + 4) {
                return "f" + i;
            }
        }
        // Check tableau columns (use full column height)
        for (let i = 0; i < 7; i++) {
            const el = document.getElementById("t" + i);
            const rect = el.getBoundingClientRect();
            if (x >= rect.left - 2 && x <= rect.right + 2 && y >= rect.top - 4) {
                return "t" + i;
            }
        }
        return null;
    }

    function highlightDropTarget(x, y) {
        clearDropHighlights();
        const target = findDropTarget(x, y);
        if (target && target !== dragState.fromPile && isValidMove(dragState.fromPile, dragState.cardIndex, target)) {
            document.getElementById(target).classList.add("drop-target");
        }
    }

    function clearDropHighlights() {
        document.querySelectorAll(".drop-target").forEach(el => el.classList.remove("drop-target"));
    }

    // ===== TAP-TO-MOVE =====
    function handleTap(pileId, cardIndex) {
        const pile = getPile(pileId);
        const card = pile[cardIndex];
        if (!card || !card.faceUp) return;

        // Nothing selected — select this card
        if (!state.selectedCard) {
            state.selectedCard = { pileId, cardIndex };
            render();
            return;
        }

        const sel = state.selectedCard;

        // Tapping the same card — try auto-move to foundation, or deselect
        if (sel.pileId === pileId && sel.cardIndex === cardIndex) {
            if (cardIndex === pile.length - 1) {
                const fi = findFoundationFor(card);
                if (fi >= 0) {
                    executeMove(pileId, cardIndex, "f" + fi);
                    state.selectedCard = null;
                    if (checkWin()) { render(); onWin(); return; }
                    else if (canAutoComplete()) { render(); autoComplete(); return; }
                    render();
                    return;
                }
            }
            state.selectedCard = null;
            render();
            return;
        }

        // Try to move selected card(s) to the tapped pile
        if (isValidMove(sel.pileId, sel.cardIndex, pileId)) {
            executeMove(sel.pileId, sel.cardIndex, pileId);
            state.selectedCard = null;
            if (checkWin()) { render(); onWin(); return; }
            else if (canAutoComplete()) { render(); autoComplete(); return; }
        } else {
            // Select the newly tapped card instead
            state.selectedCard = { pileId, cardIndex };
        }
        render();
    }

    // ===== AUTO-COMPLETE =====
    function canAutoComplete() {
        if (state.stock.length > 0 || state.waste.length > 0) return false;
        return state.tableau.every(col => col.every(c => c.faceUp));
    }

    async function autoComplete() {
        state.dealing = true; // prevent input during auto-complete
        let moved = true;
        while (moved && !checkWin()) {
            moved = false;
            for (let i = 0; i < 7; i++) {
                const col = state.tableau[i];
                if (col.length === 0) continue;
                const card = col[col.length - 1];
                const fi = findFoundationFor(card);
                if (fi >= 0) {
                    executeMove("t" + i, col.length - 1, "f" + fi);
                    moved = true;
                    render();
                    await sleep(60);
                }
            }
        }
        state.dealing = false;
        if (checkWin()) onWin();
    }

    function sleep(ms) {
        return new Promise(r => setTimeout(r, ms));
    }

    // ===== GAME FLOW =====
    function onWin() {
        state.gameWon = true;
        document.getElementById("win-stats").textContent =
            state.moves + " moves";
        document.getElementById("win-overlay").classList.remove("hidden");
    }

    async function newGame() {
        state.selectedCard = null;
        document.getElementById("win-overlay").classList.add("hidden");
        await generateSolvableDeal();
        render();
    }

    function initButtons() {
        document.getElementById("new-game-btn").addEventListener("click", () => newGame());
        document.getElementById("play-again-btn").addEventListener("click", () => newGame());
        document.getElementById("undo-btn").addEventListener("click", () => {
            if (state.dealing || state.gameWon) return;
            undo();
            state.selectedCard = null;
            render();
        });
    }

    // ===== INIT =====
    function init() {
        initButtons();
        initInput();
        // Set foundation suit symbols
        SUITS.forEach((suit, i) => {
            document.getElementById("f" + i).dataset.suitSymbol = SUIT_SYMBOLS[suit];
        });
        newGame();
    }

    init();
})();

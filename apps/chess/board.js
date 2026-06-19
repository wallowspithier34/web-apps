// Shared board rendering module.
// Exposes window.Board = { buildBoard, renderPieces, animateMove,
//   clearHighlights, applyLastTint, selectSquare, deselect,
//   squareEl, squareName, whenPiecesReady, setOrientation, getOrientation }.
//
// The board uses absolute-positioned piece elements animated via CSS transform.
// Each piece is 12.5% × 12.5% of the board, placed with:
//   transform: translate(col*800%, row*800%)   ← 800 = 100/12.5
// (800% of 12.5% = 100% of one square width)

// ── Piece content definitions ─────────────────────────────────────────────

const GLYPH = {
    K:"♚", Q:"♛", R:"♜", B:"♝", N:"♞", P:"♟",
    k:"♚", q:"♛", r:"♜", b:"♝", n:"♞", p:"♟",
};
const LETTER = { K:"K", Q:"Q", R:"R", B:"B", N:"N", P:"" };

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

// ── Pixel-art pieces (16×16 rect grid) ───────────────────────────────────
// Three styles: pixel-staunton (blocky Staunton), pixel-abstract (geometric
// symbols), pixel-fantasy (dungeon-crawler sprites).
// All use fill="currentColor"; the .white / .black CSS classes drive colour.

const PIXEL_STAUNTON = {
    K: `<rect x="7" y="0" width="2" height="1"/><rect x="5" y="1" width="6" height="1"/><rect x="7" y="2" width="2" height="1"/><rect x="4" y="3" width="8" height="1"/><rect x="3" y="4" width="10" height="2"/><rect x="4" y="6" width="8" height="1"/><rect x="5" y="7" width="6" height="2"/><rect x="4" y="9" width="8" height="2"/><rect x="3" y="11" width="10" height="1"/><rect x="2" y="12" width="12" height="1"/><rect x="1" y="13" width="14" height="3"/>`,
    Q: `<rect x="2" y="0" width="2" height="2"/><rect x="7" y="0" width="2" height="2"/><rect x="12" y="0" width="2" height="2"/><rect x="1" y="2" width="14" height="1"/><rect x="2" y="3" width="12" height="2"/><rect x="3" y="5" width="10" height="2"/><rect x="4" y="7" width="8" height="2"/><rect x="3" y="9" width="10" height="2"/><rect x="2" y="11" width="12" height="1"/><rect x="1" y="12" width="14" height="1"/><rect x="0" y="13" width="16" height="3"/>`,
    R: `<rect x="2" y="0" width="3" height="2"/><rect x="6" y="0" width="3" height="2"/><rect x="10" y="0" width="3" height="2"/><rect x="2" y="2" width="12" height="1"/><rect x="3" y="3" width="10" height="8"/><rect x="2" y="11" width="12" height="1"/><rect x="1" y="12" width="14" height="1"/><rect x="0" y="13" width="16" height="3"/>`,
    B: `<rect x="7" y="0" width="2" height="1"/><rect x="6" y="1" width="4" height="1"/><rect x="5" y="2" width="6" height="1"/><rect x="4" y="3" width="8" height="2"/><rect x="5" y="5" width="6" height="1"/><rect x="6" y="6" width="4" height="1"/><rect x="5" y="7" width="6" height="1"/><rect x="4" y="8" width="8" height="1"/><rect x="3" y="9" width="10" height="1"/><rect x="2" y="10" width="12" height="1"/><rect x="1" y="11" width="14" height="2"/><rect x="0" y="13" width="16" height="3"/>`,
    N: `<rect x="5" y="0" width="3" height="1"/><rect x="4" y="1" width="5" height="1"/><rect x="3" y="2" width="7" height="1"/><rect x="2" y="3" width="9" height="2"/><rect x="3" y="5" width="8" height="1"/><rect x="4" y="6" width="6" height="1"/><rect x="5" y="7" width="4" height="1"/><rect x="2" y="8" width="10" height="1"/><rect x="1" y="9" width="12" height="1"/><rect x="0" y="10" width="14" height="2"/><rect x="0" y="12" width="15" height="1"/><rect x="0" y="13" width="16" height="3"/>`,
    P: `<rect x="6" y="1" width="4" height="1"/><rect x="5" y="2" width="6" height="2"/><rect x="6" y="4" width="4" height="1"/><rect x="7" y="5" width="2" height="2"/><rect x="5" y="7" width="6" height="1"/><rect x="4" y="8" width="8" height="3"/><rect x="3" y="11" width="10" height="1"/><rect x="2" y="12" width="12" height="1"/><rect x="1" y="13" width="14" height="3"/>`,
};

const PIXEL_ABSTRACT = {
    // K: Bold plus sign
    K: `<rect x="5" y="0" width="6" height="16"/><rect x="0" y="5" width="16" height="6"/>`,
    // Q: Diamond
    Q: `<rect x="7" y="1" width="2" height="1"/><rect x="5" y="2" width="6" height="1"/><rect x="3" y="3" width="10" height="1"/><rect x="2" y="4" width="12" height="1"/><rect x="1" y="5" width="14" height="2"/><rect x="2" y="7" width="12" height="1"/><rect x="3" y="8" width="10" height="1"/><rect x="5" y="9" width="6" height="1"/><rect x="7" y="10" width="2" height="1"/>`,
    // R: Solid rectangle (bold block)
    R: `<rect x="2" y="1" width="12" height="14"/>`,
    // B: Solid upward triangle + stem
    B: `<rect x="7" y="0" width="2" height="1"/><rect x="6" y="1" width="4" height="1"/><rect x="5" y="2" width="6" height="1"/><rect x="4" y="3" width="8" height="1"/><rect x="3" y="4" width="10" height="1"/><rect x="2" y="5" width="12" height="1"/><rect x="1" y="6" width="14" height="1"/><rect x="0" y="7" width="16" height="1"/><rect x="6" y="8" width="4" height="4"/><rect x="3" y="12" width="10" height="4"/>`,
    // N: Bold L-shape (Γ)
    N: `<rect x="1" y="1" width="6" height="11"/><rect x="1" y="10" width="14" height="5"/>`,
    // P: Small filled circle-ish (square with chamfered corners)
    P: `<rect x="5" y="3" width="6" height="1"/><rect x="4" y="4" width="8" height="5"/><rect x="5" y="9" width="6" height="1"/><rect x="2" y="11" width="12" height="5"/>`,
};

const PIXEL_FANTASY = {
    // K: Royal crown + armored body
    K: `<rect x="1" y="0" width="3" height="4"/><rect x="6" y="0" width="4" height="4"/><rect x="12" y="0" width="3" height="4"/><rect x="0" y="4" width="16" height="2"/><rect x="3" y="6" width="10" height="3"/><rect x="4" y="9" width="8" height="2"/><rect x="3" y="11" width="10" height="1"/><rect x="1" y="12" width="14" height="4"/>`,
    // Q: Wizard hat (tall pointed hat) + robes
    Q: `<rect x="7" y="0" width="2" height="1"/><rect x="6" y="1" width="4" height="1"/><rect x="5" y="2" width="6" height="2"/><rect x="4" y="4" width="8" height="2"/><rect x="0" y="6" width="16" height="1"/><rect x="2" y="7" width="12" height="3"/><rect x="1" y="10" width="14" height="2"/><rect x="0" y="12" width="16" height="4"/>`,
    // R: Castle tower with battlements
    R: `<rect x="1" y="0" width="3" height="3"/><rect x="6" y="0" width="3" height="3"/><rect x="11" y="0" width="3" height="3"/><rect x="1" y="3" width="14" height="2"/><rect x="7" y="5" width="2" height="3"/><rect x="1" y="5" width="14" height="0"/><rect x="2" y="8" width="12" height="5"/><rect x="1" y="11" width="14" height="2"/><rect x="0" y="13" width="16" height="3"/>`,
    // B: Holy cross on a robe
    B: `<rect x="7" y="0" width="2" height="5"/><rect x="4" y="2" width="8" height="2"/><rect x="7" y="5" width="2" height="4"/><rect x="5" y="9" width="6" height="1"/><rect x="4" y="10" width="8" height="2"/><rect x="3" y="12" width="10" height="4"/>`,
    // N: Knight helmet with visor
    N: `<rect x="3" y="0" width="10" height="1"/><rect x="2" y="1" width="12" height="1"/><rect x="1" y="2" width="13" height="1"/><rect x="1" y="3" width="13" height="3"/><rect x="4" y="3" width="7" height="2"/><rect x="1" y="6" width="7" height="1"/><rect x="2" y="7" width="10" height="2"/><rect x="1" y="9" width="12" height="2"/><rect x="0" y="11" width="14" height="2"/><rect x="0" y="13" width="16" height="3"/>`,
    // P: Small armored soldier (shield shape)
    P: `<rect x="6" y="1" width="4" height="3"/><rect x="5" y="4" width="6" height="2"/><rect x="4" y="6" width="8" height="3"/><rect x="3" y="9" width="10" height="2"/><rect x="2" y="11" width="12" height="2"/><rect x="1" y="13" width="14" height="3"/>`,
};

const PIXEL_SETS = { "pixel-staunton": PIXEL_STAUNTON, "pixel-abstract": PIXEL_ABSTRACT, "pixel-fantasy": PIXEL_FANTASY };
const IMG_SETS   = ["cburnett", "merida", "maestro"];

// ── Board module ──────────────────────────────────────────────────────────

const Board = (() => {
    let _orientation = "w"; // "w" = white at bottom
    let _pieceEls    = new Map(); // squareName → piece element
    let _container   = null;
    let _lastMove    = null;

    // Build the static 8×8 grid inside `container`. Each click fires onSquareTap(name).
    function buildBoard(container, orientation, onSquareTap) {
        _container   = container;
        _orientation = orientation || "w";
        _pieceEls    = new Map();
        _lastMove    = null;
        container.innerHTML = "";

        for (let sr = 0; sr < 8; sr++) {
            for (let sf = 0; sf < 8; sf++) {
                const file = _orientation === "w" ? sf : 7 - sf;
                const row  = _orientation === "w" ? sr : 7 - sr;
                const name = String.fromCharCode(97 + file) + (8 - row);
                const sq   = document.createElement("div");
                sq.className = "square " + ((row + file) % 2 === 0 ? "sq-light" : "sq-dark");
                sq.dataset.sq = name;
                if (sr === 7) sq.insertAdjacentHTML("beforeend", `<span class="coord coord-file">${name[0]}</span>`);
                if (sf === 0) sq.insertAdjacentHTML("beforeend", `<span class="coord coord-rank">${name[1]}</span>`);
                sq.addEventListener("click", () => onSquareTap && onSquareTap(name));
                container.appendChild(sq);
            }
        }
    }

    // (x%, y%) position of a square in the board's coordinate space.
    function _squarePos(name) {
        const file = name.charCodeAt(0) - 97;
        const rank = parseInt(name[1], 10);
        const row  = 8 - rank;
        const sf   = _orientation === "w" ? file : 7 - file;
        const sr   = _orientation === "w" ? row  : 7 - row;
        return { x: sf * 12.5, y: sr * 12.5 };
    }

    function _placePieceEl(el, name) {
        const { x, y } = _squarePos(name);
        el.style.transform = `translate(${x * 8}%, ${y * 8}%)`;
    }

    // Build the innerHTML for one piece in the current style.
    // sz: explicit pixel size for SVGs (used in sample-piece context).
    function _pieceInner(char, style, sz = null) {
        const type  = char.toUpperCase();
        const wh    = sz ? ` width="${sz}" height="${sz}"` : "";
        if (IMG_SETS.includes(style)) {
            const file = (char === char.toUpperCase() ? "w" : "b") + type + ".svg";
            const dim  = sz ? ` width="${sz}" height="${sz}"` : ``;
            return { html: `<img class="piece-img"${dim} src="./pieces/${style}/${file}" alt="" draggable="false">` };
        }
        if (style === "classic") return { text: GLYPH[char] };
        if (style === "letters") return { html: `<span class="piece-letter">${LETTER[type]}</span>` };
        if (style === "modern") {
            return { html: `<svg viewBox="0 0 45 45"${wh} aria-hidden="true">${PIECE_SVG[type]}</svg>` };
        }
        if (PIXEL_SETS[style]) {
            return { html: `<svg viewBox="0 0 16 16"${wh} shape-rendering="crispEdges" aria-hidden="true">${PIXEL_SETS[style][type]}</svg>` };
        }
        return { text: LETTER[type] };
    }

    // Render all pieces from the Chess engine board onto the DOM board.
    function renderPieces(game, container, style) {
        if (!container) return;
        container.querySelectorAll(".piece").forEach((e) => e.remove());
        _pieceEls.clear();
        for (let i = 0; i < 64; i++) {
            const p = game.board[i];
            if (!p) continue;
            const name = idxToName(i);
            const el   = document.createElement("div");
            const isW  = p === p.toUpperCase();
            el.className = `piece ps-${style} ` + (isW ? "white" : "black");
            const inner = _pieceInner(p, style);
            if (inner.text != null) el.textContent = inner.text;
            else el.innerHTML = inner.html;
            _placePieceEl(el, name);
            container.appendChild(el);
            _pieceEls.set(name, el);
        }
    }

    // Apply a UCI move, animate the piece, return the engine result or null.
    function animateMove(game, uci, style) {
        const spec     = Chess.parseUci(uci);
        const fromName = spec.from;
        const toName   = spec.to;
        const result   = game.move(spec);
        if (!result) return null;

        const el = _pieceEls.get(fromName);

        // Remove captured piece (normal capture)
        if (_pieceEls.has(toName)) {
            const cap = _pieceEls.get(toName);
            cap.classList.add("piece-captured");
            setTimeout(() => cap.remove(), 180);
            _pieceEls.delete(toName);
        }
        // En passant: remove the captured pawn on the moving pawn's row
        if (result.ep) {
            const capName = toName[0] + fromName[1];
            const cap     = _pieceEls.get(capName);
            if (cap) { cap.classList.add("piece-captured"); setTimeout(() => cap.remove(), 180); _pieceEls.delete(capName); }
        }
        if (el) {
            _placePieceEl(el, toName);
            _pieceEls.delete(fromName);
            _pieceEls.set(toName, el);
            el.classList.add("piece-moved");
            setTimeout(() => el && el.classList.remove("piece-moved"), 220);
            // Promotion: replace the piece glyph
            if (result.promotion && style) {
                const promoted = result.piece === result.piece.toUpperCase()
                    ? result.promotion : result.promotion.toLowerCase();
                const inner = _pieceInner(promoted, style);
                if (inner.text != null) el.textContent = inner.text;
                else el.innerHTML = inner.html;
            }
        }
        // Castle: move the rook
        if (result.castle) {
            const rookMap = { K:["h1","f1"], Q:["a1","d1"], k:["h8","f8"], q:["a8","d8"] }[result.castle];
            const rEl     = _pieceEls.get(rookMap[0]);
            if (rEl) { _placePieceEl(rEl, rookMap[1]); _pieceEls.delete(rookMap[0]); _pieceEls.set(rookMap[1], rEl); }
        }

        _lastMove = { from: fromName, to: toName };
        clearHighlights();
        applyLastTint();
        return result;
    }

    // Highlight the selected square and its legal move targets.
    function selectSquare(name, legalMoves) {
        clearHighlights();
        applyLastTint();
        const sel = _sq(name);
        if (sel) sel.classList.add("sq-sel");
        for (const m of legalMoves) {
            const t = _sq(idxToName(m.to));
            if (t) t.classList.add(m.captured ? "sq-legal-cap" : "sq-legal");
        }
    }

    function deselect() { clearHighlights(); applyLastTint(); }

    function clearHighlights() {
        if (!_container) return;
        _container.querySelectorAll(".square").forEach((s) =>
            s.classList.remove("sq-sel", "sq-legal", "sq-legal-cap", "sq-last", "sq-check", "sq-wrong", "sq-hint")
        );
    }

    function applyLastTint() {
        if (!_lastMove) return;
        const f = _sq(_lastMove.from);
        const t = _sq(_lastMove.to);
        if (f) f.classList.add("sq-last");
        if (t) t.classList.add("sq-last");
    }

    function markCheck(kingName) {
        const el = _sq(kingName);
        if (el) el.classList.add("sq-check");
    }

    function markWrong(toName) {
        const el = _sq(toName);
        if (el) el.classList.add("sq-wrong");
        setTimeout(() => { if (el) el.classList.remove("sq-wrong"); }, 500);
    }

    function markHints(fromNames) {
        fromNames.forEach((n) => { const el = _sq(n); if (el) el.classList.add("sq-hint"); });
    }

    function flashConfirm(toName) {
        const el = _pieceEls.get(toName);
        if (el) { el.classList.add("piece-confirm"); setTimeout(() => el && el.classList.remove("piece-confirm"), 240); }
    }

    function shakeWrong(fromName) {
        const el = _pieceEls.get(fromName);
        if (el) { el.classList.add("piece-shake"); setTimeout(() => el && el.classList.remove("piece-shake"), 500); }
    }

    function _sq(name) {
        return _container ? _container.querySelector(`.square[data-sq="${name}"]`) : null;
    }

    // Resolve when all piece <img> elements have decoded (for iOS Safari).
    function whenPiecesReady(cb) {
        if (!_container) { cb(); return; }
        const imgs = Array.from(_container.querySelectorAll(".piece img"));
        if (imgs.length) {
            Promise.all(imgs.map((im) => im.decode ? im.decode().catch(() => {}) : Promise.resolve()))
                .then(() => requestAnimationFrame(cb));
        } else {
            requestAnimationFrame(() => requestAnimationFrame(cb));
        }
    }

    // Build a small sample piece element for settings previews.
    // Passes explicit 28px size so SVGs don't default to browser-native 300×150.
    function samplePiece(style, color, type) {
        const char  = color === "w" ? type.toUpperCase() : type.toLowerCase();
        const inner = _pieceInner(char, style, 28);
        const cls   = color === "w" ? "white" : "black";
        const span  = `<span class="piece ps-${style} ${cls} sample-piece">`;
        if (inner.text != null) return span + inner.text + `</span>`;
        return span + inner.html + `</span>`;
    }

    function setOrientation(o) { _orientation = o; }
    function getOrientation()  { return _orientation; }
    function getPieceEl(name)  { return _pieceEls.get(name) || null; }
    function getLastMove()     { return _lastMove; }
    function setLastMove(lm)   { _lastMove = lm; }
    function clearPieces()     { _pieceEls.clear(); }

    return {
        buildBoard, renderPieces, animateMove,
        selectSquare, deselect, clearHighlights, applyLastTint,
        markCheck, markWrong, markHints, flashConfirm, shakeWrong,
        whenPiecesReady, samplePiece,
        setOrientation, getOrientation,
        getPieceEl, getLastMove, setLastMove, clearPieces,
        squarePos: _squarePos,
    };
})();

window.Board = Board;
window.IMG_SETS   = IMG_SETS;
window.PIXEL_SETS = PIXEL_SETS;

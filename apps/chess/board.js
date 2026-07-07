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

const LETTER = { K:"K", Q:"Q", R:"R", B:"B", N:"N", P:"P" };

// Image-based piece sets (all SVG, loaded via <img>).
const IMG_SETS = ["pixel", "cburnett", "merida", "maestro"];

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
        const type = char.toUpperCase();
        if (IMG_SETS.includes(style)) {
            const file = (char === char.toUpperCase() ? "w" : "b") + type + ".svg";
            const dim  = sz ? ` width="${sz}" height="${sz}"` : ``;
            return { html: `<img class="piece-img"${dim} src="./pieces/${style}/${file}" alt="" draggable="false">` };
        }
        // "letters" style (the only non-image style remaining).
        return { html: `<span class="piece-letter">${LETTER[type]}</span>` };
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

        // Castling — move king and rook to their final squares. For 960 the king's
        // target and the rook's start may differ from the tapped square, so use the
        // engine's kingTo/rookTo; move.to is the rook's start square there.
        if (result.castle) {
            const kingToName   = result.kingTo != null ? idxToName(result.kingTo)
                : ({ K:"g1", Q:"c1", k:"g8", q:"c8" })[result.castle];
            const rookFromName = result.rookTo != null ? toName
                : ({ K:"h1", Q:"a1", k:"h8", q:"a8" })[result.castle];
            const rookToName   = result.rookTo != null ? idxToName(result.rookTo)
                : ({ K:"f1", Q:"d1", k:"f8", q:"d8" })[result.castle];
            const rEl = _pieceEls.get(rookFromName);
            if (el)  _placePieceEl(el, kingToName);
            if (rEl) _placePieceEl(rEl, rookToName);
            _pieceEls.delete(fromName);
            _pieceEls.delete(rookFromName);
            if (el)  _pieceEls.set(kingToName, el);
            if (rEl) _pieceEls.set(rookToName, rEl);
            if (el) { el.classList.add("piece-moved"); setTimeout(() => el && el.classList.remove("piece-moved"), 220); }
            _lastMove = { from: fromName, to: kingToName };
            clearHighlights();
            applyLastTint();
            return result;
        }

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
            s.classList.remove("sq-sel", "sq-legal", "sq-legal-cap", "sq-last", "sq-check", "sq-wrong", "sq-hint", "sq-premove")
        );
    }

    // Pre-move highlight (a move queued while it's the opponent's turn). `to` may
    // be null when only the source square has been chosen.
    function markPremove(from, to) {
        clearPremove();
        const f = _sq(from); if (f) f.classList.add("sq-premove");
        if (to) { const t = _sq(to); if (t) t.classList.add("sq-premove"); }
    }
    function clearPremove() {
        if (!_container) return;
        _container.querySelectorAll(".sq-premove").forEach((s) => s.classList.remove("sq-premove"));
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
        markPremove, clearPremove,
        whenPiecesReady, samplePiece,
        setOrientation, getOrientation,
        getPieceEl, getLastMove, setLastMove, clearPieces,
        squarePos: _squarePos,
    };
})();

window.Board    = Board;
window.IMG_SETS = IMG_SETS;

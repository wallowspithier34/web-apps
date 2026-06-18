// a1 (row 7, file 0) is a light square → (7+0)%2 === 1 → true ✓
function sqIsLight(idx) { return (Math.floor(idx / 8) + idx % 8) % 2 === 1; }

let game, selected, targets, lastFrom, lastTo, history, over, pendingPromo;

const boardEl      = document.getElementById("board");
const statusEl     = document.getElementById("status");
const moveListEl   = document.getElementById("move-list");
const promoModal   = document.getElementById("promo-modal");
const promoChoices = document.getElementById("promo-choices");

function newGame() {
    game         = new Chess();
    selected     = null;
    targets      = [];
    lastFrom     = null;
    lastTo       = null;
    history      = [];
    over         = false;
    pendingPromo = null;
    promoModal.hidden = true;
    buildBoard();
    render();
    setStatus();
    renderHistory();
}

// Build the static 8×8 DOM once; render() mutates classes/content in place.
function buildBoard() {
    boardEl.innerHTML = "";
    for (let i = 0; i < 64; i++) {
        const sq = document.createElement("div");
        sq.className = "sq";
        sq.dataset.i = i;

        const row  = Math.floor(i / 8);
        const file = i % 8;

        if (file === 0) {
            const lbl = document.createElement("span");
            lbl.className = "lbl lbl-rank";
            lbl.textContent = 8 - row;
            sq.appendChild(lbl);
        }
        if (row === 7) {
            const lbl = document.createElement("span");
            lbl.className = "lbl lbl-file";
            lbl.textContent = String.fromCharCode(97 + file);
            sq.appendChild(lbl);
        }

        // Pre-create the content span (piece letter or empty indicator)
        const content = document.createElement("span");
        content.className = "cell";
        sq.appendChild(content);

        sq.addEventListener("click", onSquareClick);
        boardEl.appendChild(sq);
    }
}

function render() {
    const squares   = boardEl.children;
    const targetSet = new Set(targets.map((m) => m.to));
    const checkKing = game.inCheck() ? game._kingIdx(game.turn) : -1;

    for (let i = 0; i < 64; i++) {
        const sq   = squares[i];
        const cell = sq.querySelector(".cell");
        const p    = game.board[i];
        const isTarget  = targetSet.has(i);
        const isCapture = isTarget && !!p;

        let cls = "sq " + (sqIsLight(i) ? "light" : "dark");
        if (i === lastFrom || i === lastTo) cls += " last";
        if (i === selected)                 cls += " sel";
        if (isCapture)                      cls += " cap";
        if (i === checkKing)                cls += " check";
        sq.className = cls;

        // Cell content: piece letter, capture target marker, legal-move *, or empty ·
        if (p) {
            const isWhite = p === p.toUpperCase();
            cell.className = "cell " + (isWhite ? "wp" : "bp");
            // Wrap capture targets in [ ] so they read as ASCII markers
            cell.textContent = isCapture ? "[" + p + "]" : p;
        } else {
            // "move" subclass brightens the * vs the faint ·
            cell.className = "cell empty" + (isTarget ? " move" : "");
            cell.textContent = isTarget ? "*" : "·";
        }
    }
}

function onSquareClick(e) {
    if (over || pendingPromo) return;
    const idx = +e.currentTarget.dataset.i;
    const p   = game.board[idx];
    const pc  = p ? (p === p.toUpperCase() ? "w" : "b") : null;

    if (selected === null) {
        if (pc === game.turn) select(idx);
        return;
    }
    if (idx === selected) { deselect(); return; }

    const moves = targets.filter((m) => m.to === idx);
    if (moves.length) {
        if (moves.some((m) => m.promotion)) {
            pendingPromo = { from: selected, to: idx };
            deselect();
            showPromoModal();
        } else {
            executeMove(selected, idx, null);
        }
        return;
    }

    if (pc === game.turn) { select(idx); return; }
    deselect();
}

function select(idx) {
    selected = idx;
    targets  = game.legalMoves().filter((m) => m.from === idx);
    render();
}

function deselect() {
    selected = null;
    targets  = [];
    render();
}

function executeMove(from, to, promotion) {
    const result = game.move({ from, to, promotion: promotion || "Q" });
    if (!result) return;
    lastFrom = from;
    lastTo   = to;
    history.push(result.san);
    selected = null;
    targets  = [];
    render();
    renderHistory();
    if (!checkGameOver()) setStatus();
}

function checkGameOver() {
    if (game.legalMoves().length > 0) return false;
    over = true;
    const winner = game.turn === "w" ? "Black" : "White";
    setStatus(game.inCheck() ? `Checkmate — ${winner} wins!` : "Stalemate — draw!");
    return true;
}

function setStatus(msg) {
    if (msg) { statusEl.textContent = msg; return; }
    const who = game.turn === "w" ? "White" : "Black";
    statusEl.textContent = game.inCheck() ? `${who} in check!` : `${who} to move`;
}

function renderHistory() {
    if (history.length === 0) { moveListEl.textContent = "—"; return; }
    let txt = "";
    for (let i = 0; i < history.length; i++) {
        if (i % 2 === 0) txt += Math.floor(i / 2) + 1 + ". ";
        txt += history[i] + (i % 2 === 0 ? "  " : "\n");
    }
    moveListEl.textContent = txt.trimEnd();
    moveListEl.scrollTop = moveListEl.scrollHeight;
}

function showPromoModal() {
    const isWhite = game.turn === "w";
    promoChoices.innerHTML = "";
    for (const p of ["Q", "R", "B", "N"]) {
        const btn = document.createElement("button");
        btn.className = "promo-btn " + (isWhite ? "wp" : "bp");
        btn.textContent = isWhite ? p : p.toLowerCase();
        btn.addEventListener("click", () => {
            const { from, to } = pendingPromo;
            pendingPromo = null;
            promoModal.hidden = true;
            executeMove(from, to, p);
        });
        promoChoices.appendChild(btn);
    }
    promoModal.hidden = false;
}

document.getElementById("new-game").addEventListener("click", newGame);

newGame();

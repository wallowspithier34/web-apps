// Minimal but correct chess rules engine.
// Board is a 64-length array, index = row * 8 + file, where row 0 = rank 8 (top)
// and file 0 = the a-file. Pieces are single chars: uppercase = White, lowercase = Black.

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function fileOf(i) { return i % 8; }
function rowOf(i) { return Math.floor(i / 8); }
function onBoard(f, r) { return f >= 0 && f < 8 && r >= 0 && r < 8; }
function toIdx(f, r) { return r * 8 + f; }

// Convert between square names ("e4") and board indices.
function nameToIdx(name) {
    const f = name.charCodeAt(0) - 97;       // a-h
    const rank = parseInt(name[1], 10);      // 1-8
    const r = 8 - rank;                       // row 0 = rank 8
    return toIdx(f, r);
}
function idxToName(i) {
    return String.fromCharCode(97 + fileOf(i)) + (8 - rowOf(i));
}

const KNIGHT_DELTAS = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const KING_DELTAS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const ROOK_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const BISHOP_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

const isWhite = (p) => p && p === p.toUpperCase();
const isBlack = (p) => p && p === p.toLowerCase();
const colorOf = (p) => (p ? (isWhite(p) ? "w" : "b") : null);

class Chess {
    constructor(fen = START_FEN) {
        this.load(fen);
    }

    load(fen) {
        const parts = fen.split(" ");
        const placement = parts[0];
        const turn      = parts[1] || "w";
        const castling  = parts[2] || "-";
        const ep        = parts[3] || "-";
        const halfmove  = parts[4] != null ? parseInt(parts[4], 10) : 0;
        const fullmove  = parts[5] != null ? parseInt(parts[5], 10) : 1;
        this.board = new Array(64).fill("");
        let i = 0;
        for (const ch of placement) {
            if (ch === "/") continue;
            if (/\d/.test(ch)) {
                i += parseInt(ch, 10);
            } else {
                this.board[i++] = ch;
            }
        }
        this.turn = turn;                                   // 'w' | 'b'
        this.halfmove = isNaN(halfmove) ? 0 : halfmove;     // half-moves since pawn move/capture (50-move rule)
        this.fullmove = isNaN(fullmove) ? 1 : fullmove;
        this.ep = ep && ep !== "-" ? nameToIdx(ep) : null;  // en passant target square
        this._parseCastling(castling);
    }

    // Parse the FEN castling field. Handles both standard "KQkq" and Shredder-FEN
    // file letters (e.g. "HAha") used for Chess960. Records, per side, whether
    // castling is available and which file that side's rook starts on. A standard
    // start (KQkq with the king on the e-file) is treated as non-960 so the
    // classic castling path is used unchanged.
    _parseCastling(field) {
        this.castling = { K: false, Q: false, k: false, q: false };
        this.rookFile = { K: null, Q: null, k: null, q: null };
        this.chess960 = false;
        if (!field || field === "-") return;

        const wkFile = this.board.indexOf("K") >= 0 ? fileOf(this.board.indexOf("K")) : 4;
        const bkFile = this.board.indexOf("k") >= 0 ? fileOf(this.board.indexOf("k")) : 4;

        if (/^[KQkq]+$/.test(field)) {
            // Standard rights: rooks on the a/h files.
            if (field.includes("K")) { this.castling.K = true; this.rookFile.K = 7; }
            if (field.includes("Q")) { this.castling.Q = true; this.rookFile.Q = 0; }
            if (field.includes("k")) { this.castling.k = true; this.rookFile.k = 7; }
            if (field.includes("q")) { this.castling.q = true; this.rookFile.q = 0; }
            // Only a king off the e-file implies a 960 layout needing the general path.
            this.chess960 = (wkFile !== 4 || bkFile !== 4);
            return;
        }

        // Shredder-FEN: uppercase = white rook files, lowercase = black rook files.
        // A rook to the right of its king is the kingside (K/k) rook, else queenside.
        this.chess960 = true;
        for (const ch of field) {
            if (ch >= "A" && ch <= "H") {
                const f = ch.charCodeAt(0) - 65;
                if (f > wkFile) { this.castling.K = true; this.rookFile.K = f; }
                else            { this.castling.Q = true; this.rookFile.Q = f; }
            } else if (ch >= "a" && ch <= "h") {
                const f = ch.charCodeAt(0) - 97;
                if (f > bkFile) { this.castling.k = true; this.rookFile.k = f; }
                else            { this.castling.q = true; this.rookFile.q = f; }
            }
        }
    }

    pieceAt(name) { return this.board[nameToIdx(name)]; }

    // Locate the king of a given color.
    _kingIdx(color, board = this.board) {
        const k = color === "w" ? "K" : "k";
        return board.indexOf(k);
    }

    // Is square `idx` attacked by `byColor` on the given board?
    _attacked(idx, byColor, board = this.board) {
        const f = fileOf(idx), r = rowOf(idx);

        // Pawns: a white pawn attacks one row up (toward row 0), black one row down.
        const pr = byColor === "w" ? r + 1 : r - 1;  // row the attacking pawn would sit on
        for (const df of [-1, 1]) {
            if (onBoard(f + df, pr)) {
                const p = board[toIdx(f + df, pr)];
                if (p && colorOf(p) === byColor && p.toUpperCase() === "P") return true;
            }
        }
        // Knights
        for (const [df, dr] of KNIGHT_DELTAS) {
            if (!onBoard(f + df, r + dr)) continue;
            const p = board[toIdx(f + df, r + dr)];
            if (p && colorOf(p) === byColor && p.toUpperCase() === "N") return true;
        }
        // King
        for (const [df, dr] of KING_DELTAS) {
            if (!onBoard(f + df, r + dr)) continue;
            const p = board[toIdx(f + df, r + dr)];
            if (p && colorOf(p) === byColor && p.toUpperCase() === "K") return true;
        }
        // Sliding: rook/queen orthogonally, bishop/queen diagonally
        const scan = (dirs, types) => {
            for (const [df, dr] of dirs) {
                let nf = f + df, nr = r + dr;
                while (onBoard(nf, nr)) {
                    const p = board[toIdx(nf, nr)];
                    if (p) {
                        if (colorOf(p) === byColor && types.includes(p.toUpperCase())) return true;
                        break;
                    }
                    nf += df; nr += dr;
                }
            }
            return false;
        };
        if (scan(ROOK_DIRS, ["R", "Q"])) return true;
        if (scan(BISHOP_DIRS, ["B", "Q"])) return true;
        return false;
    }

    inCheck(color = this.turn) {
        return this._attacked(this._kingIdx(color), color === "w" ? "b" : "w");
    }

    // Pseudo-legal moves for the side to move (king-safety filtered afterwards).
    _pseudoMoves() {
        const moves = [];
        const me = this.turn;
        const add = (from, to, extra = {}) =>
            moves.push({ from, to, piece: this.board[from], captured: this.board[to] || null, ...extra });

        for (let i = 0; i < 64; i++) {
            const p = this.board[i];
            if (!p || colorOf(p) !== me) continue;
            const f = fileOf(i), r = rowOf(i);
            const type = p.toUpperCase();

            if (type === "P") {
                const dir = me === "w" ? -1 : 1;          // row delta moving forward
                const startRow = me === "w" ? 6 : 1;
                const promoRow = me === "w" ? 0 : 7;
                const one = toIdx(f, r + dir);
                if (onBoard(f, r + dir) && !this.board[one]) {
                    if (r + dir === promoRow) this._addPromos(add, i, one);
                    else add(i, one);
                    // double step
                    if (r === startRow && !this.board[toIdx(f, r + 2 * dir)]) {
                        add(i, toIdx(f, r + 2 * dir), { double: true });
                    }
                }
                // captures (incl. en passant)
                for (const df of [-1, 1]) {
                    const cf = f + df, cr = r + dir;
                    if (!onBoard(cf, cr)) continue;
                    const ti = toIdx(cf, cr);
                    const target = this.board[ti];
                    if (target && colorOf(target) !== me) {
                        if (cr === promoRow) this._addPromos(add, i, ti);
                        else add(i, ti);
                    } else if (ti === this.ep) {
                        add(i, ti, { ep: true });
                    }
                }
            } else if (type === "N") {
                for (const [df, dr] of KNIGHT_DELTAS) {
                    if (!onBoard(f + df, r + dr)) continue;
                    const ti = toIdx(f + df, r + dr);
                    if (!this.board[ti] || colorOf(this.board[ti]) !== me) add(i, ti);
                }
            } else if (type === "K") {
                for (const [df, dr] of KING_DELTAS) {
                    if (!onBoard(f + df, r + dr)) continue;
                    const ti = toIdx(f + df, r + dr);
                    if (!this.board[ti] || colorOf(this.board[ti]) !== me) add(i, ti);
                }
                this._addCastles(add, i, me);
            } else {
                const dirs = type === "R" ? ROOK_DIRS : type === "B" ? BISHOP_DIRS : ROOK_DIRS.concat(BISHOP_DIRS);
                for (const [df, dr] of dirs) {
                    let nf = f + df, nr = r + dr;
                    while (onBoard(nf, nr)) {
                        const ti = toIdx(nf, nr);
                        if (!this.board[ti]) add(i, ti);
                        else { if (colorOf(this.board[ti]) !== me) add(i, ti); break; }
                        nf += df; nr += dr;
                    }
                }
            }
        }
        return moves;
    }

    _addPromos(add, from, to) {
        for (const pr of ["Q", "R", "B", "N"]) add(from, to, { promotion: pr });
    }

    _addCastles(add, kingIdx, me) {
        const enemy = me === "w" ? "b" : "w";
        if (this.inCheck(me)) return;

        if (this.chess960) { this._addCastles960(add, kingIdx, me, enemy); return; }

        if (me === "w" && kingIdx === nameToIdx("e1")) {
            if (this.castling.K && !this.board[nameToIdx("f1")] && !this.board[nameToIdx("g1")] &&
                !this._attacked(nameToIdx("f1"), enemy) && !this._attacked(nameToIdx("g1"), enemy)) {
                add(kingIdx, nameToIdx("g1"), { castle: "K", captured: null });
            }
            if (this.castling.Q && !this.board[nameToIdx("d1")] && !this.board[nameToIdx("c1")] &&
                !this.board[nameToIdx("b1")] &&
                !this._attacked(nameToIdx("d1"), enemy) && !this._attacked(nameToIdx("c1"), enemy)) {
                add(kingIdx, nameToIdx("c1"), { castle: "Q", captured: null });
            }
        } else if (me === "b" && kingIdx === nameToIdx("e8")) {
            if (this.castling.k && !this.board[nameToIdx("f8")] && !this.board[nameToIdx("g8")] &&
                !this._attacked(nameToIdx("f8"), enemy) && !this._attacked(nameToIdx("g8"), enemy)) {
                add(kingIdx, nameToIdx("g8"), { castle: "k", captured: null });
            }
            if (this.castling.q && !this.board[nameToIdx("d8")] && !this.board[nameToIdx("c8")] &&
                !this.board[nameToIdx("b8")] &&
                !this._attacked(nameToIdx("d8"), enemy) && !this._attacked(nameToIdx("c8"), enemy)) {
                add(kingIdx, nameToIdx("c8"), { castle: "q", captured: null });
            }
        }
    }

    // Chess960 castling. Rook and king may start on arbitrary back-rank files.
    // Castling is encoded as "king captures own rook" (move.to = the rook's start
    // square) — this matches Stockfish's UCI_Chess960 output, so engine moves need
    // no translation. Final squares are the standard ones: kingside → K g-file,
    // R f-file; queenside → K c-file, R d-file.
    _addCastles960(add, kingIdx, me, enemy) {
        const backRow = me === "w" ? 7 : 0;
        const sides   = me === "w" ? ["K", "Q"] : ["k", "q"];
        for (const side of sides) {
            if (!this.castling[side] || this.rookFile[side] == null) continue;
            const kingSide = (side === "K" || side === "k");
            const rookFrom = toIdx(this.rookFile[side], backRow);
            const kingTo   = toIdx(kingSide ? 6 : 2, backRow);
            const rookTo   = toIdx(kingSide ? 5 : 3, backRow);
            if (this._canCastle960(kingIdx, kingTo, rookFrom, rookTo, enemy)) {
                add(kingIdx, rookFrom, { castle: side, kingTo, rookTo, captured: null });
            }
        }
    }

    // All castling squares share the back rank, so a contiguous index range spans
    // the files between two squares. The king and castling rook don't block their
    // own path; the king may not start, cross, or land on an attacked square.
    _canCastle960(kingFrom, kingTo, rookFrom, rookTo, enemy) {
        const span = (a, b) => {
            const lo = Math.min(a, b), hi = Math.max(a, b), out = [];
            for (let s = lo; s <= hi; s++) out.push(s);
            return out;
        };
        for (const s of span(kingFrom, kingTo)) {
            if (s !== kingFrom && s !== rookFrom && this.board[s]) return false;
        }
        for (const s of span(rookFrom, rookTo)) {
            if (s !== rookFrom && s !== kingFrom && this.board[s]) return false;
        }
        for (const s of span(kingFrom, kingTo)) {
            if (this._attacked(s, enemy)) return false;
        }
        return true;
    }

    // Fully legal moves for the side to move.
    legalMoves() {
        const me = this.turn;
        return this._pseudoMoves().filter((m) => {
            const snapshot = this._apply(m);
            const bad = this._attacked(this._kingIdx(me), me === "w" ? "b" : "w");
            this._undo(snapshot);
            return !bad;
        });
    }

    legalMovesFrom(name) {
        const from = nameToIdx(name);
        return this.legalMoves().filter((m) => m.from === from);
    }

    // Apply a move to the board, returning a snapshot for _undo.
    _apply(m) {
        const snap = {
            board: this.board.slice(),
            turn: this.turn,
            castling: { ...this.castling },
            rookFile: { ...this.rookFile },
            chess960: this.chess960,
            ep: this.ep,
            halfmove: this.halfmove,
            fullmove: this.fullmove,
        };
        const moving    = this.board[m.from];
        const isPawn    = moving && moving.toUpperCase() === "P";
        const isCapture = !!m.captured || !!m.ep;

        if (m.castle && m.kingTo != null) {
            // Chess960 (king-captures-rook): m.to is the rook's start square.
            const king = this.board[m.from];
            const rook = this.board[m.to];
            this.board[m.from] = "";
            this.board[m.to]   = "";
            this.board[m.kingTo] = king;
            this.board[m.rookTo] = rook;
        } else if (m.castle) {
            this.board[m.to]   = moving;
            this.board[m.from] = "";
            const [rf, rt] = {
                K: ["h1", "f1"], Q: ["a1", "d1"], k: ["h8", "f8"], q: ["a8", "d8"],
            }[m.castle];
            this.board[nameToIdx(rt)] = this.board[nameToIdx(rf)];
            this.board[nameToIdx(rf)] = "";
        } else {
            this.board[m.to] = m.promotion
                ? (this.turn === "w" ? m.promotion : m.promotion.toLowerCase())
                : moving;
            this.board[m.from] = "";
            if (m.ep) {
                // captured pawn sits on the moving pawn's own row, target file
                const capRow = rowOf(m.from);
                this.board[toIdx(fileOf(m.to), capRow)] = "";
            }
        }

        // Update castling rights: king move clears both of its sides; a rook that
        // leaves (or is captured on) its start square clears that side. Uses the
        // recorded rook files so it works for both standard and 960 layouts.
        if (moving === "K") { this.castling.K = this.castling.Q = false; }
        if (moving === "k") { this.castling.k = this.castling.q = false; }
        const clearRookSide = (side, color) => {
            if (!this.castling[side] || this.rookFile[side] == null) return;
            const sq = toIdx(this.rookFile[side], color === "w" ? 7 : 0);
            if (m.from === sq || m.to === sq) this.castling[side] = false;
        };
        clearRookSide("K", "w"); clearRookSide("Q", "w");
        clearRookSide("k", "b"); clearRookSide("q", "b");

        // En passant target
        this.ep = m.double ? toIdx(fileOf(m.from), (rowOf(m.from) + rowOf(m.to)) / 2) : null;
        // Move counters (halfmove clock resets on a pawn move or capture)
        this.halfmove = (isPawn || isCapture) ? 0 : this.halfmove + 1;
        if (this.turn === "b") this.fullmove += 1;
        this.turn = this.turn === "w" ? "b" : "w";
        return snap;
    }

    _undo(snap) {
        this.board = snap.board;
        this.turn = snap.turn;
        this.castling = snap.castling;
        this.rookFile = snap.rookFile;
        this.chess960 = snap.chess960;
        this.ep = snap.ep;
        this.halfmove = snap.halfmove;
        this.fullmove = snap.fullmove;
    }

    // Public: make a legal move. Accepts a move object or {from,to,promotion} names.
    move(spec) {
        const from = typeof spec.from === "number" ? spec.from : nameToIdx(spec.from);
        const to = typeof spec.to === "number" ? spec.to : nameToIdx(spec.to);
        const promo = spec.promotion ? spec.promotion.toUpperCase() : null;
        const legal = this.legalMoves().find(
            (m) => m.from === from && m.to === to && (!m.promotion || m.promotion === (promo || "Q"))
        );
        if (!legal) return null;
        const san = this.toSAN(legal);
        this._apply(legal);
        return { ...legal, san, fromName: idxToName(from), toName: idxToName(to) };
    }

    // Parse a UCI string like "e2e4" or "e7e8q" into a move spec.
    static parseUci(uci) {
        return {
            from: uci.slice(0, 2),
            to: uci.slice(2, 4),
            promotion: uci.length > 4 ? uci[4].toUpperCase() : null,
        };
    }

    // Standard Algebraic Notation for display (computed before the move is applied).
    toSAN(m) {
        if (m.castle === "K" || m.castle === "k") return "O-O";
        if (m.castle === "Q" || m.castle === "q") return "O-O-O";
        const type = m.piece.toUpperCase();
        const dest = idxToName(m.to);
        let san;
        if (type === "P") {
            san = m.captured || m.ep ? idxToName(m.from)[0] + "x" + dest : dest;
            if (m.promotion) san += "=" + m.promotion;
        } else {
            // Disambiguate against other same-type pieces hitting the same square.
            const peers = this.legalMoves().filter(
                (o) => o.piece === m.piece && o.to === m.to && o.from !== m.from
            );
            let disamb = "";
            if (peers.length) {
                const sameFile = peers.some((o) => fileOf(o.from) === fileOf(m.from));
                const sameRank = peers.some((o) => rowOf(o.from) === rowOf(m.from));
                if (!sameFile) disamb = idxToName(m.from)[0];
                else if (!sameRank) disamb = idxToName(m.from)[1];
                else disamb = idxToName(m.from);
            }
            san = type + disamb + (m.captured ? "x" : "") + dest;
        }
        // Check / checkmate suffix
        const snap = this._apply(m);
        const opp = this.turn;
        if (this.inCheck(opp)) san += this.legalMoves().length === 0 ? "#" : "+";
        this._undo(snap);
        return san;
    }

    // Full FEN for the current position. Castling is written as standard KQkq or,
    // for 960, as Shredder-FEN file letters (which Stockfish accepts under
    // UCI_Chess960). Includes the halfmove clock and fullmove number.
    fen() {
        let placement = "";
        for (let row = 0; row < 8; row++) {
            let empty = 0;
            for (let f = 0; f < 8; f++) {
                const p = this.board[row * 8 + f];
                if (p) { if (empty) { placement += empty; empty = 0; } placement += p; }
                else empty++;
            }
            if (empty) placement += empty;
            if (row < 7) placement += "/";
        }
        let c = "";
        if (this.chess960) {
            if (this.castling.K) c += String.fromCharCode(65 + this.rookFile.K);
            if (this.castling.Q) c += String.fromCharCode(65 + this.rookFile.Q);
            if (this.castling.k) c += String.fromCharCode(97 + this.rookFile.k);
            if (this.castling.q) c += String.fromCharCode(97 + this.rookFile.q);
        } else {
            c = (this.castling.K ? "K" : "") + (this.castling.Q ? "Q" : "") +
                (this.castling.k ? "k" : "") + (this.castling.q ? "q" : "");
        }
        if (!c) c = "-";
        const ep = this.ep != null ? idxToName(this.ep) : "-";
        return `${placement} ${this.turn} ${c} ${ep} ${this.halfmove} ${this.fullmove}`;
    }

    // Position identity for threefold-repetition detection (placement + side to
    // move + castling + en passant, i.e. the FEN without the move counters).
    positionKey() {
        return this.fen().split(" ").slice(0, 4).join(" ");
    }

    // Draw by insufficient mating material: K vs K, K+minor vs K, and K+B vs K+B
    // with both bishops on same-coloured squares.
    isInsufficientMaterial() {
        const minors = [];
        for (let i = 0; i < 64; i++) {
            const p = this.board[i];
            if (!p) continue;
            const t = p.toUpperCase();
            if (t === "K") continue;
            if (t === "P" || t === "R" || t === "Q") return false; // mating material exists
            minors.push({ t, color: (fileOf(i) + rowOf(i)) % 2 });
        }
        if (minors.length <= 1) return true;                        // K, or K + one minor
        if (minors.length === 2 && minors.every((m) => m.t === "B") &&
            minors[0].color === minors[1].color) return true;       // same-colour bishops
        return false;
    }

    // Generate a random legal Chess960 start position as a Shredder-FEN string.
    // Bishops sit on opposite colours and the king stands between the two rooks.
    static random960Fen() {
        const rand = (n) => Math.floor(Math.random() * n);
        const rank = new Array(8).fill(null);
        const even = [0, 2, 4, 6], odd = [1, 3, 5, 7];
        rank[even[rand(4)]] = "B";
        rank[odd[rand(4)]]  = "B";
        const empties = () => rank.map((v, f) => (v ? -1 : f)).filter((f) => f >= 0);
        let e = empties(); rank[e[rand(e.length)]] = "Q";
        e = empties(); rank[e[rand(e.length)]] = "N";
        e = empties(); rank[e[rand(e.length)]] = "N";
        e = empties(); // three remaining files, ascending → rook, king, rook
        rank[e[0]] = "R"; rank[e[1]] = "K"; rank[e[2]] = "R";
        const white = rank.join("");
        const black = white.toLowerCase();
        const rl = e[0], rr = e[2]; // rook files
        const castle = String.fromCharCode(65 + rl) + String.fromCharCode(65 + rr) +
                       String.fromCharCode(97 + rl) + String.fromCharCode(97 + rr);
        return `${black}/pppppppp/8/8/8/8/PPPPPPPP/${white} w ${castle} - 0 1`;
    }
}

window.Chess = Chess;
window.idxToName = idxToName;
window.nameToIdx = nameToIdx;

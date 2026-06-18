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
        const [placement, turn, castling, ep] = fen.split(" ");
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
        this.castling = {
            K: castling.includes("K"), Q: castling.includes("Q"),
            k: castling.includes("k"), q: castling.includes("q"),
        };
        this.ep = ep && ep !== "-" ? nameToIdx(ep) : null;  // en passant target square
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
        if (me === "w" && kingIdx === nameToIdx("e1")) {
            if (this.castling.K && !this.board[nameToIdx("f1")] && !this.board[nameToIdx("g1")] &&
                !this._attacked(nameToIdx("f1"), enemy) && !this._attacked(nameToIdx("g1"), enemy)) {
                add(kingIdx, nameToIdx("g1"), { castle: "K" });
            }
            if (this.castling.Q && !this.board[nameToIdx("d1")] && !this.board[nameToIdx("c1")] &&
                !this.board[nameToIdx("b1")] &&
                !this._attacked(nameToIdx("d1"), enemy) && !this._attacked(nameToIdx("c1"), enemy)) {
                add(kingIdx, nameToIdx("c1"), { castle: "Q" });
            }
        } else if (me === "b" && kingIdx === nameToIdx("e8")) {
            if (this.castling.k && !this.board[nameToIdx("f8")] && !this.board[nameToIdx("g8")] &&
                !this._attacked(nameToIdx("f8"), enemy) && !this._attacked(nameToIdx("g8"), enemy)) {
                add(kingIdx, nameToIdx("g8"), { castle: "k" });
            }
            if (this.castling.q && !this.board[nameToIdx("d8")] && !this.board[nameToIdx("c8")] &&
                !this.board[nameToIdx("b8")] &&
                !this._attacked(nameToIdx("d8"), enemy) && !this._attacked(nameToIdx("c8"), enemy)) {
                add(kingIdx, nameToIdx("c8"), { castle: "q" });
            }
        }
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
            ep: this.ep,
        };
        const moving = this.board[m.from];
        this.board[m.to] = m.promotion
            ? (this.turn === "w" ? m.promotion : m.promotion.toLowerCase())
            : moving;
        this.board[m.from] = "";

        if (m.ep) {
            // captured pawn sits on the moving pawn's own row, target file
            const capRow = rowOf(m.from);
            this.board[toIdx(fileOf(m.to), capRow)] = "";
        }
        if (m.castle) {
            const rookMoves = {
                K: ["h1", "f1"], Q: ["a1", "d1"], k: ["h8", "f8"], q: ["a8", "d8"],
            }[m.castle];
            const [rf, rt] = rookMoves;
            this.board[nameToIdx(rt)] = this.board[nameToIdx(rf)];
            this.board[nameToIdx(rf)] = "";
        }

        // Update castling rights
        if (moving === "K") { this.castling.K = this.castling.Q = false; }
        if (moving === "k") { this.castling.k = this.castling.q = false; }
        if (m.from === nameToIdx("h1") || m.to === nameToIdx("h1")) this.castling.K = false;
        if (m.from === nameToIdx("a1") || m.to === nameToIdx("a1")) this.castling.Q = false;
        if (m.from === nameToIdx("h8") || m.to === nameToIdx("h8")) this.castling.k = false;
        if (m.from === nameToIdx("a8") || m.to === nameToIdx("a8")) this.castling.q = false;

        // En passant target
        this.ep = m.double ? toIdx(fileOf(m.from), (rowOf(m.from) + rowOf(m.to)) / 2) : null;
        this.turn = this.turn === "w" ? "b" : "w";
        return snap;
    }

    _undo(snap) {
        this.board = snap.board;
        this.turn = snap.turn;
        this.castling = snap.castling;
        this.ep = snap.ep;
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
}

window.Chess = Chess;
window.idxToName = idxToName;
window.nameToIdx = nameToIdx;

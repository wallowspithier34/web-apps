// Stockfish Web Worker wrapper.
// Uses the pure-JS stockfish.js (no WASM, no SharedArrayBuffer) so it works
// on static GitHub Pages hosting without COOP/COEP headers.
//
// UCI flow:
//   init()  → send "uci" → wait "uciok" → configure → send "isready" → wait "readyok"
//   move()  → "position fen …" + "go …" → wait "bestmove …"
//
// Strength: in adaptive mode the engine controls come from
// EloStore.strengthFromRating(elo); in manual mode from a fixed Skill Level.
// Below Stockfish's weakest setting we weaken further by occasionally returning a
// random legal move (blunder injection) instead of the engine's choice.

class BotEngine {
    constructor() {
        this._worker  = null;
        this._ready   = false;
        this._queue   = [];        // pending {resolve,reject} for move requests
        this._initRes = null;
        this._initRej = null;
        this._mode    = "adaptive";  // "adaptive" | "manual"
        this._variant = "standard";  // "standard" | "c960"
        this._strength = { skill: 5, movetime: 200, multipv: 1, weakness: 0, blunderProb: 0, depthCap: 0 };
        this._pv      = [];          // candidate first-moves by MultiPV rank (for weak play)
    }

    // opts: { mode, elo, skill, variant }. Returns a Promise resolved when ready.
    init(opts = {}) {
        this._mode    = opts.mode === "manual" ? "manual" : "adaptive";
        this._variant = opts.variant === "c960" ? "c960" : "standard";
        if (this._mode === "manual") {
            const skill = Math.max(0, Math.min(20, opts.skill | 0));
            this._strength = { skill, movetime: EloStore.movetimeFromSkill(skill), multipv: 1, weakness: 0, blunderProb: 0, depthCap: 0 };
        } else {
            this._strength = EloStore.strengthFromRating(opts.elo != null ? opts.elo : 1200);
        }

        return new Promise((resolve, reject) => {
            this._initRes = resolve;
            this._initRej = reject;
            this._worker = new Worker("./stockfish.js");
            this._worker.onmessage = (e) => this._onMsg(e.data);
            this._worker.onerror   = (e) => {
                console.error("Stockfish error:", e);
                reject(new Error("Stockfish worker failed to load."));
            };
            this._worker.postMessage("uci");
        });
    }

    _onMsg(line) {
        if (line === "uciok") {
            this._configure();
            this._worker.postMessage("isready");
            return;
        }
        if (line === "readyok") {
            this._ready = true;
            if (this._initRes) { this._initRes(); this._initRes = null; }
            return;
        }
        if (typeof line !== "string") return;

        // Collect MultiPV candidate first-moves; the deepest iteration wins.
        if (line.startsWith("info") && line.includes("multipv")) {
            const rank = line.match(/multipv (\d+)/);
            const pv   = line.match(/ pv (\S+)/);
            if (rank && pv) this._pv[parseInt(rank[1], 10) - 1] = pv[1];
            return;
        }
        if (line.startsWith("bestmove")) {
            const raw = line.split(" ")[1];
            const best = (raw && raw !== "(none)") ? raw : null;
            if (this._queue.length) {
                const { resolve, legalUci } = this._queue.shift();
                resolve(this._selectMove(best, legalUci));
            }
        }
    }

    // Choose the move to actually play from the engine's output, applying the
    // configured weakness. A residual blunder chance (bottom ratings only) plays a
    // fully random legal move; otherwise sample among the MultiPV candidates,
    // biased toward weaker ones by `weakness` (0 = always the best move).
    _selectMove(best, legalUci) {
        const s = this._strength;
        if (s.blunderProb > 0 && legalUci && legalUci.length && Math.random() < s.blunderProb) {
            return legalUci[Math.floor(Math.random() * legalUci.length)];
        }
        const candidates = this._pv.filter(Boolean);
        if (!candidates.length) return best;
        const r = Math.max(0, Math.min(candidates.length - 1,
            Math.floor(s.weakness * Math.random() * candidates.length)));
        return candidates[r];
    }

    _configure() {
        this._send("setoption name Threads value 1");
        this._send("setoption name Hash value 16");
        this._send("setoption name Skill Level value " + this._strength.skill);
        this._send("setoption name MultiPV value " + Math.max(1, this._strength.multipv));
        if (this._variant === "c960") this._send("setoption name UCI_Chess960 value true");
    }

    // Get the bot's move for the current position.
    //   fen:         current position FEN
    //   remainingMs: ms left on the bot's clock (0 = no timer)
    //   legalUci:    array of legal UCI moves, used for random-blunder weakening
    getBestMove(fen, remainingMs = 0, legalUci = null) {
        if (!this._ready) return Promise.reject(new Error("Engine not ready"));

        let goCmd;
        if (this._strength.depthCap > 0) {
            goCmd = "go depth " + this._strength.depthCap;
        } else {
            const mt = remainingMs > 0
                ? Math.min(Math.floor(remainingMs * 0.05), 3000)
                : this._strength.movetime;
            goCmd = "go movetime " + Math.max(20, mt);
        }
        return new Promise((resolve, reject) => {
            this._pv = [];
            this._queue.push({ resolve, reject, legalUci });
            this._send("position fen " + fen);
            this._send(goCmd);
        });
    }

    get skillLevel()  { return this._strength.skill; }
    get blunderProb() { return this._strength.blunderProb; }
    get weakness()    { return this._strength.weakness; }

    quit() {
        if (this._worker) {
            try { this._worker.postMessage("quit"); } catch (_) {}
            this._worker.terminate();
            this._worker = null;
        }
        this._ready = false;
        this._queue = [];
    }

    _send(msg) { if (this._worker) this._worker.postMessage(msg); }
}

window.BotEngine = BotEngine;

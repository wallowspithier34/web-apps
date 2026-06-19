// Stockfish Web Worker wrapper.
// Uses the pure-JS stockfish.js (no WASM, no SharedArrayBuffer) so it works
// on static GitHub Pages hosting without COOP/COEP headers.
//
// UCI flow:
//   init()  → send "uci" → wait "uciok" → configure → send "isready" → wait "readyok"
//   move()  → "position fen …" + "go movetime N" → wait "bestmove …"

class BotEngine {
    constructor() {
        this._worker   = null;
        this._ready    = false;
        this._queue    = [];   // Pending resolve/reject for move requests
        this._initRes  = null;
        this._initRej  = null;
        this._mode     = "auto"; // "auto" | "manual"
        this._skill    = 10;
        this._userElo  = 1200;
    }

    // Returns a Promise that resolves when the engine is ready.
    init(mode, skillOrElo) {
        return new Promise((resolve, reject) => {
            this._initRes = resolve;
            this._initRej = reject;
            this._mode    = mode;
            if (mode === "auto")   this._userElo = skillOrElo;
            else                   this._skill   = skillOrElo;

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
        if (line.startsWith("bestmove")) {
            const parts = line.split(" ");
            const uci   = parts[1] || null; // null if "bestmove (none)"
            if (this._queue.length) {
                const { resolve } = this._queue.shift();
                resolve(uci);
            }
        }
    }

    _configure() {
        this._send("setoption name Threads value 1");
        this._send("setoption name Hash value 16");
        if (this._mode === "auto") {
            const sl  = EloStore.skillLevelFromElo(this._userElo);
            this._skill = sl;
            this._send("setoption name Skill Level value " + sl);
        } else {
            this._send("setoption name Skill Level value " + this._skill);
        }
    }

    // Get the engine's best move for the current position.
    // fen: current position FEN
    // remainingMs: milliseconds left on the engine's clock (0 = no timer)
    getBestMove(fen, remainingMs = 0) {
        if (!this._ready) return Promise.reject(new Error("Engine not ready"));
        const movetime = remainingMs > 0
            ? Math.min(Math.floor(remainingMs * 0.05), 3000)
            : EloStore.movetimeFromSkill(this._skill);
        return new Promise((resolve, reject) => {
            this._queue.push({ resolve, reject });
            this._send("position fen " + fen);
            this._send("go movetime " + movetime);
        });
    }

    get skillLevel() { return this._skill; }

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

// Convert a FEN string to a position FEN suitable for Stockfish
// (without move counters if not needed — though Stockfish accepts full FEN).
window.BotEngine = BotEngine;

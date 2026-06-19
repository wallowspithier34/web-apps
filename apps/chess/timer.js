// Chess clock. Tracks milliseconds per side using Date.now() snapshots to avoid
// setInterval drift. Call onTick(cb) to register a display-update callback
// (called via requestAnimationFrame ~60fps but only when the formatted string
// changes to avoid excess DOM work).

const TIMER_PRESETS = [
    { label: "1+0",    seconds: 60,   increment: 0 },
    { label: "2+1",    seconds: 120,  increment: 1 },
    { label: "3+2",    seconds: 180,  increment: 2 },
    { label: "5+0",    seconds: 300,  increment: 0 },
    { label: "10+0",   seconds: 600,  increment: 0 },
    { label: "15+10",  seconds: 900,  increment: 10 },
    { label: "30+0",   seconds: 1800, increment: 0 },
    { label: "None",   seconds: 0,    increment: 0 },
];
const NO_TIMER_IDX = 7;

class ChessClock {
    constructor(initialSeconds, increment = 0) {
        this._init = initialSeconds * 1000;
        this._inc  = increment * 1000;
        this._ms   = { w: this._init, b: this._init };
        this._active   = null;   // "w" | "b" | null
        this._startedAt = null;  // Date.now() when current side started
        this._paused   = false;
        this._raf      = null;
        this._tickCb   = null;
        this._flagCb   = null;
        this._lastTick = { w: "", b: "" };
        this._flagged  = false;
    }

    onTick(cb)  { this._tickCb = cb; }
    onFlag(cb)  { this._flagCb = cb; }

    // How many milliseconds remain for `color`.
    remaining(color) {
        const stored = this._ms[color];
        if (this._active === color && this._startedAt !== null) {
            return Math.max(0, stored - (Date.now() - this._startedAt));
        }
        return Math.max(0, stored);
    }

    isExpired(color) { return this.remaining(color) <= 0; }

    // Format ms as MM:SS or 0:SS.d for the final 10 seconds.
    static format(ms) {
        if (ms <= 0) return "0:00";
        const tot = Math.ceil(ms / 100) / 10; // tenths
        const min = Math.floor(tot / 60);
        const sec = tot % 60;
        if (ms < 10000) {
            // Show tenths of a second
            return `${min}:${String(Math.floor(sec)).padStart(2, "0")}.${Math.floor((sec % 1) * 10)}`;
        }
        return `${min}:${String(Math.floor(sec)).padStart(2, "0")}`;
    }

    start(color) {
        if (this._init === 0) return; // no-timer mode
        this._active     = color;
        this._startedAt  = Date.now();
        this._paused     = false;
        this._flagged    = false;
        this._runRaf();
    }

    // Call after a move: adds increment to the side that just moved, then
    // starts the opponent's clock.
    switch(movedColor) {
        if (this._init === 0) return;
        const elapsed = this._startedAt !== null ? Date.now() - this._startedAt : 0;
        this._ms[movedColor] = Math.max(0, this._ms[movedColor] - elapsed + this._inc);
        const next = movedColor === "w" ? "b" : "w";
        this._active     = next;
        this._startedAt  = Date.now();
        this._paused     = false;
        this._flagged    = false;
        this._runRaf();
    }

    pause() {
        if (this._active && this._startedAt !== null) {
            this._ms[this._active] = this.remaining(this._active);
        }
        this._active    = null;
        this._startedAt = null;
        this._paused    = true;
        this._stopRaf();
    }

    reset() {
        this._ms   = { w: this._init, b: this._init };
        this._active    = null;
        this._startedAt = null;
        this._paused    = false;
        this._flagged   = false;
        this._lastTick  = { w: "", b: "" };
        this._stopRaf();
    }

    _runRaf() {
        this._stopRaf();
        const tick = () => {
            this._raf = requestAnimationFrame(tick);
            this._emit();
        };
        this._raf = requestAnimationFrame(tick);
    }

    _stopRaf() {
        if (this._raf !== null) { cancelAnimationFrame(this._raf); this._raf = null; }
    }

    _emit() {
        for (const c of ["w", "b"]) {
            const rem = this.remaining(c);
            const fmt = ChessClock.format(rem);
            if (fmt !== this._lastTick[c]) {
                this._lastTick[c] = fmt;
                if (this._tickCb) this._tickCb(c, fmt, rem);
            }
        }
        if (!this._flagged && this._active && this.isExpired(this._active)) {
            this._flagged = true;
            this._stopRaf();
            if (this._flagCb) this._flagCb(this._active);
        }
    }
}

window.ChessClock = ChessClock;
window.TIMER_PRESETS = TIMER_PRESETS;
window.NO_TIMER_IDX = NO_TIMER_IDX;

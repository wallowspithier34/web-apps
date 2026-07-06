// Adaptive rating system for the bot player.
//
// Four independent rating buckets, keyed by {game type} × {time control}:
//   standard-blitz | standard-long | c960-blitz | c960-long
// A game with a base time of 5 minutes or less is "blitz"; anything longer,
// including no-timer games, is "long".
//
// The bot is always tuned to the player's *current* rating for that bucket, so
// the expected score is 0.5 every game and the update is simply
//   delta = round(K * (result - 0.5))   →  win +K/2, draw 0, loss -K/2.
// Because the bot's real strength (strengthFromRating) rises monotonically with
// the rating, the rating settles wherever the player scores ~50%, so wins and
// losses balance over time. See strengthFromRating for the sub-Skill-0 weakening
// (blunder injection) that lets the bot go below Stockfish's lowest setting.

const ELO_KEY     = "chess-v2:elo";
const DEFAULT_ELO = 1200;
const K_FACTOR    = 32;
const HISTORY_MAX = 1000;   // progression entries kept per bucket (for the future Stats tab)

const BUCKET_KEYS = ["standard-blitz", "standard-long", "c960-blitz", "c960-long"];

// Map a timer preset (seconds of base time; 0 = no timer) to a time-control tag.
function timeControlTag(baseSeconds) {
    return (baseSeconds > 0 && baseSeconds <= 300) ? "blitz" : "long";
}
function bucketKey(variant, baseSeconds) {
    return `${variant === "c960" ? "c960" : "standard"}-${timeControlTag(baseSeconds)}`;
}

class EloStore {
    constructor() {
        this._data = this._load();
    }

    _emptyBucket() { return { elo: DEFAULT_ELO, gamesPlayed: 0, history: [] }; }

    _load() {
        let raw = null;
        try { raw = JSON.parse(localStorage.getItem(ELO_KEY)); } catch (_) { /* ignore */ }
        const data = {};
        for (const k of BUCKET_KEYS) data[k] = this._emptyBucket();

        if (raw && typeof raw === "object") {
            if (raw.standard || raw["standard-long"] || BUCKET_KEYS.some((k) => raw[k])) {
                // Already bucketed — copy over any known buckets.
                for (const k of BUCKET_KEYS) {
                    if (raw[k] && typeof raw[k] === "object") {
                        data[k] = Object.assign(this._emptyBucket(), raw[k]);
                        if (!Array.isArray(data[k].history)) data[k].history = [];
                    }
                }
            } else if (typeof raw.elo === "number") {
                // Migrate the old flat schema {elo, history:[{date,delta,result,opponentElo}]}
                // into standard-long, reconstructing each game's post-game rating by
                // walking the deltas backward from the current rating.
                const b = this._emptyBucket();
                b.elo = raw.elo;
                const oldHist = Array.isArray(raw.history) ? raw.history : [];
                b.gamesPlayed = oldHist.length;
                let running = raw.elo;
                const migrated = new Array(oldHist.length);
                for (let i = oldHist.length - 1; i >= 0; i--) {
                    const h = oldHist[i];
                    migrated[i] = {
                        ts: h.date || null,
                        gameNo: i + 1,
                        elo: running,
                        delta: h.delta || 0,
                        result: h.result,
                    };
                    running -= (h.delta || 0);
                }
                b.history = migrated;
                data["standard-long"] = b;
            }
        }
        return data;
    }

    _save() {
        try { localStorage.setItem(ELO_KEY, JSON.stringify(this._data)); } catch (_) { /* quota */ }
    }

    _bucket(key) {
        if (!this._data[key]) this._data[key] = this._emptyBucket();
        return this._data[key];
    }

    // ── Reads ──────────────────────────────────────────────────────────────────
    elo(key)         { return this._bucket(key).elo; }
    bucket(key)      { return this._bucket(key); }
    history(key)     { return this._bucket(key).history; }
    all()            { return this._data; }
    keys()           { return BUCKET_KEYS.slice(); }

    // Set a bucket's rating directly (manual edit). Clamps to [100, 3000].
    setElo(key, n) {
        this._bucket(key).elo = Math.max(100, Math.min(3000, Math.round(n)));
        this._save();
    }

    // Record an adaptive game result and update the bucket's rating.
    // result: 1 = player win, 0.5 = draw, 0 = player loss.
    // A provisional (larger) K-factor for a bucket's first games lets the rating
    // reach the player's true balance point faster, then settles to the base K.
    updateAfterGame(key, result) {
        const b = this._bucket(key);
        const pre = b.elo;
        const played = b.gamesPlayed || 0;
        const k = played < 5 ? 80 : played < 15 ? 48 : K_FACTOR;
        const delta = Math.round(k * (result - 0.5)); // opponent == self → expected 0.5
        b.elo = Math.max(100, Math.min(3000, pre + delta));
        b.gamesPlayed = (b.gamesPlayed || 0) + 1;
        b.history.push({
            ts: new Date().toISOString(),
            gameNo: b.gamesPlayed,
            elo: b.elo,
            delta,
            result,
        });
        if (b.history.length > HISTORY_MAX) b.history.shift();
        this._save();
        return { pre, post: b.elo, delta };
    }

    // ── Strength model ─────────────────────────────────────────────────────────
    // Convert a rating to concrete engine controls. Two regimes:
    //   • elo ≥ 800  ("engine"):   Stockfish Skill Level 0–20 + scaled movetime,
    //     with mild MultiPV sampling (weakness) so mid-strength play isn't razor
    //     sharp.
    //   • elo < 800  ("beginner"): Skill 0, heavier MultiPV weakness, and — only at
    //     the very bottom — a residual random-move probability so a true beginner
    //     can still reach ~50%. MultiPV picks plausible-but-imperfect moves (more
    //     human than pure random); the random floor guarantees reachable weakness.
    // Strength increases monotonically with elo, which is what makes the adaptive
    // loop converge.
    //
    // Returns { skill, movetime, multipv, weakness, blunderProb, depthCap }:
    //   multipv    — number of candidate lines to request from the engine
    //   weakness   — 0..1, bias toward weaker candidates (0 = always the best move)
    //   blunderProb — chance of a fully random legal move (bottom ratings only)
    static strengthFromRating(elo) {
        const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
        elo = clamp(elo, 100, 3000);
        if (elo >= 800) {
            const skill    = clamp(Math.round((elo - 800) / 100), 0, 20);
            const movetime = clamp(Math.round(100 + (elo - 800) * 0.6), 100, 1500);
            const multipv  = elo >= 2000 ? 1 : elo >= 1400 ? 2 : 3;
            const weakness = clamp((2000 - elo) / 1200, 0, 0.6);
            return { skill, movetime, multipv, weakness, blunderProb: 0, depthCap: 0 };
        }
        const weakness    = clamp(0.6 + (800 - elo) / 700 * 0.4, 0.6, 1);
        const blunderProb = elo < 500 ? clamp((500 - elo) / 400 * 0.7, 0, 0.7) : 0;
        const depthCap    = elo < 300 ? 1 : 0;
        return { skill: 0, movetime: 80, multipv: 4, weakness, blunderProb, depthCap };
    }

    // Movetime for a fixed manual Skill Level (no clock running).
    static movetimeFromSkill(level) {
        if (level <= 5)  return 200;
        if (level <= 10) return 500;
        if (level <= 15) return 1000;
        return 2000;
    }
}

window.EloStore      = EloStore;
window.bucketKey     = bucketKey;
window.timeControlTag = timeControlTag;
window.BUCKET_KEYS   = BUCKET_KEYS;

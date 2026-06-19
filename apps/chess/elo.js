// Elo rating system for bot mode.
// K=32, standard Elo formula. History capped at 50 games.
// Skill Level → approx engine strength table for movetime scaling.

const ELO_KEY = "chess-v2:elo";
const DEFAULT_ELO = 1200;

// Skill Level 0–20 → approximate Elo equivalent used for Elo calculations.
const SKILL_ELO = [200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100,
                   1200, 1300, 1400, 1500, 1600, 1700, 1900, 2100, 2300, 2500, 2700];

class EloStore {
    constructor() {
        this._data = this._load();
    }

    _load() {
        try {
            const raw = localStorage.getItem(ELO_KEY);
            if (raw) return JSON.parse(raw);
        } catch (_) { /* ignore */ }
        return { elo: DEFAULT_ELO, history: [] };
    }

    _save() {
        try { localStorage.setItem(ELO_KEY, JSON.stringify(this._data)); } catch (_) { /* quota */ }
    }

    get elo() { return this._data.elo; }

    // Set Elo directly (manual edit). Clamps to [100, 3000].
    setElo(n) {
        this._data.elo = Math.max(100, Math.min(3000, Math.round(n)));
        this._save();
    }

    // Record the result of a bot game and update Elo.
    // result: 1 = user win, 0.5 = draw, 0 = user loss.
    // skillLevel: the Stockfish Skill Level the bot played at.
    updateAfterGame(result, skillLevel) {
        const opponentElo = SKILL_ELO[Math.max(0, Math.min(20, skillLevel))];
        const expected = 1 / (1 + Math.pow(10, (opponentElo - this._data.elo) / 400));
        const delta = Math.round(32 * (result - expected));
        const oldElo = this._data.elo;
        this._data.elo = Math.max(100, Math.min(3000, oldElo + delta));
        const today = new Date().toISOString().slice(0, 10);
        this._data.history.push({ date: today, delta, result, opponentElo });
        // Keep only last 50 games.
        if (this._data.history.length > 50) this._data.history.shift();
        this._save();
        return { oldElo, newElo: this._data.elo, delta };
    }

    get history() { return this._data.history; }

    // Map a user Elo to a Stockfish Skill Level 0–20.
    static skillLevelFromElo(userElo) {
        for (let i = SKILL_ELO.length - 1; i >= 0; i--) {
            if (userElo >= SKILL_ELO[i]) return i;
        }
        return 0;
    }

    // Movetime in ms for a given skill level when no clock is running.
    static movetimeFromSkill(level) {
        if (level <= 5)  return 200;
        if (level <= 10) return 500;
        if (level <= 15) return 1000;
        return 2000;
    }
}

window.EloStore = EloStore;
window.SKILL_ELO = SKILL_ELO;

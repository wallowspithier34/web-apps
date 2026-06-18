// Position-based spaced repetition.
//
// The trainer drills *situations* (positions), not whole opening sequences. All
// opening mainlines are decomposed into a deduped graph of positions where it is
// the learner's turn to move. Each such position is a "card". Because positions
// are shared across openings (transpositions and common early moves), the accepted
// responses are POOLED: any book move that some opening plays from a position is
// counted correct, so the same situation never has a move that is "right" in one
// opening and "wrong" in another.
//
// A position's tier reflects how common it is in real play: it inherits the tier of
// the most-played opening that reaches it (openings are tier-ranked by popularity).
//
// Scheduling (SM-2) and mastery are tracked per position, persisted in localStorage.

const STORE_KEY = "chess-openings-trainer:v2";

// Tunables
const TIER_UNLOCK_MASTERY = 50;     // avg % mastery of a tier needed to open the next
const STRENGTH_FULL_INTERVAL = 21;  // days of interval that counts as "well known"

// ── Date helpers (all scheduling is day-granular) ───────────────────────────
function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(dateStr, n) {
    const d = new Date(dateStr + "T00:00:00");
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function daysBetween(a, b) {
    return Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000);
}

// ── Position graph ──────────────────────────────────────────────────────────
// A compact key identifying a position uniquely (board + side + castling + ep).
function posKey(g) {
    const c = (g.castling.K ? "K" : "") + (g.castling.Q ? "Q" : "") +
              (g.castling.k ? "k" : "") + (g.castling.q ? "q" : "");
    return g.board.map((p) => p || ".").join("") + " " + g.turn + " " +
           (c || "-") + " " + (g.ep == null ? "-" : g.ep);
}

// Walk every opening mainline and collect the learner-to-move positions.
function buildPositionGraph() {
    const byKey = new Map();        // posKey -> node
    const openingCards = new Map(); // opening id -> [posKey, …] in move order
    const openingLine = new Map();  // opening id -> [{ key, uci }] — this opening's move at each card

    for (const o of OPENINGS) {
        openingCards.set(o.id, []);
        openingLine.set(o.id, []);
        const g = new Chess();
        const path = [];        // uci moves played to reach the current position
        const sanParts = [];    // SAN tokens (with move numbers) for the label

        for (let i = 0; i < o.moves.length; i++) {
            const mv = o.moves[i];

            // A position the learner has to respond from → a card.
            if (g.turn === o.color) {
                const key = posKey(g);
                let node = byKey.get(key);
                if (!node) {
                    node = {
                        key,
                        sideToMove: g.turn,
                        responses: new Map(),   // uci -> { uci, note, openings:Set }
                        openings: new Set(),
                        tier: o.tier,
                        depth: i,
                        path: path.slice(),
                        san: sanParts.join(" ") || "Starting position",
                    };
                    byKey.set(key, node);
                }
                node.openings.add(o.id);
                node.tier = Math.min(node.tier, o.tier); // most common host wins

                let r = node.responses.get(mv.uci);
                if (!r) { r = { uci: mv.uci, note: mv.note, openings: new Set() }; node.responses.set(mv.uci, r); }
                r.openings.add(o.id);
                if (!r.note && mv.note) r.note = mv.note;

                openingCards.get(o.id).push(key);
                openingLine.get(o.id).push({ key, uci: mv.uci });
            }

            // Advance the line.
            const res = g.move(Chess.parseUci(mv.uci));
            if (!res) break; // malformed data — stop this line
            path.push(mv.uci);
            const moveNo = Math.floor(i / 2) + 1;
            sanParts.push((i % 2 === 0 ? moveNo + "." : "") + res.san);
        }
    }

    // Pick a representative opening (most common, then earliest) for display.
    for (const node of byKey.values()) {
        let rep = null;
        for (const id of node.openings) {
            const o = OPENINGS.find((x) => x.id === id);
            if (!rep || o.tier < rep.tier ||
                (o.tier === rep.tier && OPENINGS.indexOf(o) < OPENINGS.indexOf(rep))) rep = o;
        }
        node.rep = rep;
        node.lineCount = node.openings.size;
    }

    return { byKey, openings: Array.from(byKey.values()), openingCards, openingLine };
}

const _GRAPH = buildPositionGraph();
const POSITION_BY_KEY = _GRAPH.byKey;
const POSITIONS = _GRAPH.openings;
const OPENING_CARDS = _GRAPH.openingCards;
const OPENING_LINE = _GRAPH.openingLine;

function defaultCardState() {
    return {
        ease: 2.5,
        interval: 0,
        reps: 0,
        due: todayStr(),
        attempts: 0,        // total responses given
        correct: 0,         // first-try-correct responses
        started: false,
        lastResult: null,   // last quality 0–5
        moves: {},          // uci -> true: the specific responses answered correctly here
    };
}

class Store {
    constructor() {
        this.data = this._load();
        this._rolloverStreak();
        this.save();
    }

    _load() {
        try {
            const raw = localStorage.getItem(STORE_KEY);
            if (raw) return JSON.parse(raw);
        } catch (e) { /* ignore corrupt store */ }
        return {
            version: 2,
            xp: 0,
            totalReviews: 0,
            streak: { count: 0, lastDate: null },
            cards: {},
        };
    }

    // If the user missed a day, the streak resets (handled lazily on load).
    _rolloverStreak() {
        const s = this.data.streak;
        if (!s.lastDate) return;
        if (daysBetween(s.lastDate, todayStr()) > 1) s.count = 0;
    }

    save() {
        try { localStorage.setItem(STORE_KEY, JSON.stringify(this.data)); } catch (e) { /* quota */ }
    }

    // ── Per-card queries (never create state on read) ────────────────────────
    cardStarted(key) { const s = this.data.cards[key]; return !!(s && s.started); }
    cardStrength(key) {
        const s = this.data.cards[key];
        if (!s || !s.started) return 0;
        return Math.min(1, s.interval / STRENGTH_FULL_INTERVAL);
    }
    cardProgress(key) {
        // Introducing a card is worth a baseline; strength fills the rest.
        return this.cardStarted(key) ? 0.4 + 0.6 * this.cardStrength(key) : 0;
    }
    cardMastered(key) {
        const s = this.data.cards[key];
        return !!(s && s.started && s.interval >= STRENGTH_FULL_INTERVAL);
    }
    cardDue(key) {
        const s = this.data.cards[key];
        return !!(s && s.started && daysBetween(s.due, todayStr()) >= 0);
    }
    cardMasteryPct(key) { return Math.round(this.cardStrength(key) * 100); }
    // Has this specific book response been answered correctly at this position?
    // Per-opening progress keys off the move actually played, not just the shared
    // position — so studying one line only credits the moves it actually teaches.
    responsePlayed(key, uci) { const s = this.data.cards[key]; return !!(s && s.moves && s.moves[uci]); }

    // ── Tier mastery & curriculum unlocking ──────────────────────────────────
    tierMastery(tier) {
        const ps = POSITIONS.filter((n) => n.tier === tier);
        if (!ps.length) return 0;
        return 100 * ps.reduce((a, n) => a + this.cardProgress(n.key), 0) / ps.length;
    }
    isTierUnlocked(tier) {
        if (tier <= 1) return true;
        return this.tierMastery(tier - 1) >= TIER_UNLOCK_MASTERY && this.isTierUnlocked(tier - 1);
    }
    isCardUnlocked(key) {
        const n = POSITION_BY_KEY.get(key);
        return n ? this.isTierUnlocked(n.tier) : false;
    }

    // ── Per-opening aggregates (for the browse / practice view) ──────────────
    // These key off OPENING_LINE — each card paired with the move *this* opening
    // plays there — so progress reflects the moves you've actually practised for
    // the line, not shared transposition positions credited by a sibling opening.
    openingTotal(id) { return (OPENING_LINE.get(id) || []).length; }
    openingLearned(id) {
        return (OPENING_LINE.get(id) || []).filter((c) => this.responsePlayed(c.key, c.uci)).length;
    }
    openingMastery(id) {
        const cs = OPENING_LINE.get(id) || [];
        if (!cs.length) return 0;
        return Math.round(100 * cs.reduce(
            (a, c) => a + (this.responsePlayed(c.key, c.uci) ? this.cardProgress(c.key) : 0), 0) / cs.length);
    }
    openingMastered(id) {
        const cs = OPENING_LINE.get(id) || [];
        return cs.length > 0 && cs.every((c) => this.responsePlayed(c.key, c.uci) && this.cardMastered(c.key));
    }
    openingAccuracy(id) {
        const ks = OPENING_CARDS.get(id) || [];
        let at = 0, co = 0;
        for (const k of ks) { const s = this.data.cards[k]; if (s) { at += s.attempts; co += s.correct; } }
        return at ? Math.round(100 * co / at) : null;
    }

    // ── Session building ─────────────────────────────────────────────────────
    // Daily queue: overdue reviews first (most overdue / weakest), then a few new
    // positions, introduced common-first. Falls back to the weakest started cards.
    buildSession(maxItems = 12, maxNew = 4) {
        const unlocked = POSITIONS.filter((n) => this.isTierUnlocked(n.tier));

        const due = unlocked
            .filter((n) => this.cardDue(n.key))
            .sort((a, b) =>
                daysBetween(todayStr(), this.data.cards[a.key].due) - daysBetween(todayStr(), this.data.cards[b.key].due)
                || this.cardStrength(a.key) - this.cardStrength(b.key))
            .map((n) => n.key);

        const fresh = unlocked
            .filter((n) => !this.cardStarted(n.key))
            .sort((a, b) => a.tier - b.tier || b.lineCount - a.lineCount || a.depth - b.depth)
            .slice(0, maxNew)
            .map((n) => n.key);

        let queue = [...due, ...fresh];

        if (!queue.length) {
            queue = unlocked
                .filter((n) => this.cardStarted(n.key))
                .sort((a, b) => this.cardStrength(a.key) - this.cardStrength(b.key))
                .slice(0, 6)
                .map((n) => n.key);
        }
        return queue.slice(0, maxItems);
    }

    // Weakest started positions, for the targeted-drill shortcut.
    weakestCards(n = 6) {
        return POSITIONS
            .filter((p) => this.cardStarted(p.key) && this.isTierUnlocked(p.tier))
            .sort((a, b) => this.cardStrength(a.key) - this.cardStrength(b.key)
                || a.depth - b.depth)
            .slice(0, n)
            .map((p) => p.key);
    }

    // ── Recording a single response ──────────────────────────────────────────
    gradeCard(key, mistakes, uci) {
        const node = POSITION_BY_KEY.get(key);
        let s = this.data.cards[key];
        if (!s) s = this.data.cards[key] = defaultCardState();

        const quality = Store.qualityFromMistakes(mistakes);
        s.started = true;
        s.attempts += 1;
        if (mistakes === 0) s.correct += 1;
        s.lastResult = quality;
        // Credit the specific response the learner played (the card only finishes
        // once they find a correct book move).
        if (uci) { if (!s.moves) s.moves = {}; s.moves[uci] = true; }

        // SM-2 interval / ease update.
        if (quality < 3) {
            s.reps = 0;
            s.interval = 1;
        } else {
            if (s.reps === 0) s.interval = 1;
            else if (s.reps === 1) s.interval = 6;
            else s.interval = Math.round(s.interval * s.ease);
            s.reps += 1;
        }
        s.ease = Math.max(1.3, s.ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
        s.due = addDays(todayStr(), s.interval);

        const xp = this._xpFor(quality, node);
        this.data.xp += xp;
        this.data.totalReviews += 1;
        this._bumpStreak();
        this.save();

        return {
            xp,
            mastery: this.cardMasteryPct(key),
            cardMastered: this.cardMastered(key),
            tier: node ? node.tier : 1,
            tierMastery: Math.round(this.tierMastery(node ? node.tier : 1)),
        };
    }

    _xpFor(quality, node) {
        let xp = 5;
        if (quality === 5) xp += 5;
        else if (quality === 4) xp += 2;
        const tier = node ? node.tier : 1;
        xp += (tier === 1 ? 0 : tier); // rarer positions worth a touch more
        return xp;
    }

    _bumpStreak() {
        const s = this.data.streak;
        const today = todayStr();
        if (s.lastDate === today) return;            // already counted today
        if (s.lastDate && daysBetween(s.lastDate, today) === 1) s.count += 1;
        else s.count = 1;                            // first review today (gap reset)
        s.lastDate = today;
    }

    // Map wrong attempts on a single response to an SM-2 quality grade.
    static qualityFromMistakes(mistakes) {
        if (mistakes === 0) return 5;
        if (mistakes === 1) return 4;
        if (mistakes === 2) return 3;
        return 2;
    }
}

window.Store = Store;
window.POSITIONS = POSITIONS;
window.POSITION_BY_KEY = POSITION_BY_KEY;
window.OPENING_CARDS = OPENING_CARDS;
window.OPENING_LINE = OPENING_LINE;
window.srsTodayStr = todayStr;

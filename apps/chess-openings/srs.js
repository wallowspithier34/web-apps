// Spaced-repetition (SM-2) scheduling, tiered curriculum unlocking,
// progressive move disclosure, and localStorage persistence.

const STORE_KEY = "chess-openings-trainer:v1";

// Tunables
const SEG_FIRST = 4;          // plies tested in the very first segment
const SEG_STEP = 2;           // plies added per subsequent segment
const SEG_ADVANCE_AT = 2;     // good reps before the next depth segment unlocks
const TIER_UNLOCK_MASTERY = 50; // avg % mastery of a tier needed to open the next
const MASTERY_DEPTH_WEIGHT = 0.6;
const MASTERY_STRENGTH_WEIGHT = 0.4;
const STRENGTH_FULL_INTERVAL = 21; // days of interval that counts as "well known"

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

// Depth segments for an opening: [4, 6, 8, … total]. Each ply counts as a "move"
// in the UI ("moves 1–N of total").
function segmentsFor(opening) {
    const total = opening.moves.length;
    const segs = [];
    let d = Math.min(SEG_FIRST, total);
    while (d < total) { segs.push(d); d += SEG_STEP; }
    segs.push(total);
    return segs;
}

function defaultOpeningState() {
    return {
        ease: 2.5,
        interval: 0,
        reps: 0,            // SM-2 successful repetitions
        due: todayStr(),
        seg: 0,             // index of the deepest segment currently being trained
        segReps: 0,         // good reps accumulated at the current depth
        practiced: 0,       // adaptive lessons completed
        attempts: 0,        // total user moves attempted
        correct: 0,         // correct user moves
        started: false,
        lastResult: null,   // last lesson quality 0–5
    };
}

class Store {
    constructor() {
        this.data = this._load();
        this._ensureOpenings();
        this._rolloverStreak();
        this.save();
    }

    _load() {
        try {
            const raw = localStorage.getItem(STORE_KEY);
            if (raw) return JSON.parse(raw);
        } catch (e) { /* ignore corrupt store */ }
        return {
            version: 1,
            xp: 0,
            totalLessons: 0,
            streak: { count: 0, lastDate: null },
            openings: {},
        };
    }

    _ensureOpenings() {
        for (const o of OPENINGS) {
            if (!this.data.openings[o.id]) this.data.openings[o.id] = defaultOpeningState();
        }
    }

    // If the user missed a day, the streak resets (handled lazily on load).
    _rolloverStreak() {
        const s = this.data.streak;
        if (!s.lastDate) return;
        const gap = daysBetween(s.lastDate, todayStr());
        if (gap > 1) s.count = 0; // a full day was skipped
    }

    save() {
        try { localStorage.setItem(STORE_KEY, JSON.stringify(this.data)); } catch (e) { /* quota */ }
    }

    st(id) { return this.data.openings[id]; }

    // ── Mastery & progression ───────────────────────────────────────────────
    masteryPercent(id) {
        const o = OPENINGS.find((x) => x.id === id);
        const s = this.st(id);
        if (!s.started) return 0;
        const segs = segmentsFor(o);
        const unlockedPlies = segs[Math.min(s.seg, segs.length - 1)];
        const depthFrac = unlockedPlies / o.moves.length;
        const strengthFrac = Math.min(1, s.interval / STRENGTH_FULL_INTERVAL);
        const pct = Math.round(
            (depthFrac * MASTERY_DEPTH_WEIGHT + strengthFrac * MASTERY_STRENGTH_WEIGHT) * 100
        );
        return Math.min(100, pct);
    }

    isMastered(id) {
        const o = OPENINGS.find((x) => x.id === id);
        const s = this.st(id);
        const segs = segmentsFor(o);
        // Full line reached AND well-retained.
        return s.seg >= segs.length - 1 && s.interval >= STRENGTH_FULL_INTERVAL;
    }

    accuracy(id) {
        const s = this.st(id);
        return s.attempts ? Math.round((s.correct / s.attempts) * 100) : null;
    }

    // Number of plies currently being tested for an opening.
    unlockedDepth(id) {
        const o = OPENINGS.find((x) => x.id === id);
        const s = this.st(id);
        const segs = segmentsFor(o);
        return segs[Math.min(s.seg, segs.length - 1)];
    }

    // ── Tier curriculum unlocking ───────────────────────────────────────────
    tierAvgMastery(tier) {
        const ids = OPENINGS.filter((o) => o.tier === tier).map((o) => o.id);
        if (!ids.length) return 0;
        return ids.reduce((sum, id) => sum + this.masteryPercent(id), 0) / ids.length;
    }

    isTierUnlocked(tier) {
        if (tier <= 1) return true;
        if (tier === 4) return this.tierAvgMastery(3) >= TIER_UNLOCK_MASTERY && this.isTierUnlocked(3);
        return this.tierAvgMastery(tier - 1) >= TIER_UNLOCK_MASTERY && this.isTierUnlocked(tier - 1);
    }

    // Tier 4 openings trickle in gradually as tiers 1–3 are mastered.
    isOpeningUnlocked(id) {
        const o = OPENINGS.find((x) => x.id === id);
        if (o.tier <= 3) return this.isTierUnlocked(o.tier);
        if (!this.isTierUnlocked(4)) return false;
        const tier4 = OPENINGS.filter((x) => x.tier === 4);
        const combined = (this.tierAvgMastery(1) + this.tierAvgMastery(2) + this.tierAvgMastery(3)) / 3;
        const unlockedCount = Math.max(1, Math.floor((combined / 100) * tier4.length));
        const rank = tier4.findIndex((x) => x.id === id);
        return rank < unlockedCount;
    }

    // ── Adaptive session building ───────────────────────────────────────────
    isDue(id) {
        const s = this.st(id);
        return s.started && daysBetween(s.due, todayStr()) >= 0;
    }

    // Build the daily adaptive queue: overdue reviews first, then new openings in
    // tier order. Falls back to weakest started openings if nothing is due.
    buildSession(maxItems = 8, maxNew = 2) {
        const unlocked = OPENINGS.filter((o) => this.isOpeningUnlocked(o.id));

        const due = unlocked
            .filter((o) => this.isDue(o.id))
            .sort((a, b) => daysBetween(todayStr(), this.st(a.id).due) - daysBetween(todayStr(), this.st(b.id).due)
                || this.masteryPercent(a.id) - this.masteryPercent(b.id))
            .map((o) => o.id);

        const fresh = unlocked
            .filter((o) => !this.st(o.id).started)
            .sort((a, b) => a.tier - b.tier || OPENINGS.indexOf(a) - OPENINGS.indexOf(b))
            .slice(0, maxNew)
            .map((o) => o.id);

        let queue = [...due, ...fresh];

        if (!queue.length) {
            // Nothing due and nothing new — review the weakest started openings.
            queue = unlocked
                .filter((o) => this.st(o.id).started)
                .sort((a, b) => this.masteryPercent(a.id) - this.masteryPercent(b.id))
                .slice(0, 4)
                .map((o) => o.id);
        }
        return queue.slice(0, maxItems);
    }

    // Weakest started openings, for the targeted-drill shortcut.
    weakestOpenings(n = 5) {
        return OPENINGS
            .filter((o) => this.st(o.id).started && this.isOpeningUnlocked(o.id))
            .sort((a, b) => this.masteryPercent(a.id) - this.masteryPercent(b.id)
                || (this.accuracy(a.id) ?? 100) - (this.accuracy(b.id) ?? 100))
            .slice(0, n)
            .map((o) => o.id);
    }

    // ── Recording a completed adaptive lesson ───────────────────────────────
    // quality: SM-2 grade 0–5. moves/correct count the user's attempts this lesson.
    gradeLesson(id, quality, moveCount, correctCount) {
        const o = OPENINGS.find((x) => x.id === id);
        const s = this.st(id);
        s.started = true;
        s.practiced += 1;
        s.attempts += moveCount;
        s.correct += correctCount;
        s.lastResult = quality;

        // SM-2 interval/ease update.
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

        // Progressive disclosure: good performance unlocks deeper segments.
        const segs = segmentsFor(o);
        if (quality >= 4) {
            s.segReps += 1;
            if (s.segReps >= SEG_ADVANCE_AT && s.seg < segs.length - 1) {
                s.seg += 1;
                s.segReps = 0;
            }
        } else if (quality < 3) {
            s.segReps = 0;
        }

        // XP / streak / totals
        const xp = this._xpFor(quality, o);
        this.data.xp += xp;
        this.data.totalLessons += 1;
        this._bumpStreak();
        this.save();
        return { xp, mastery: this.masteryPercent(id), mastered: this.isMastered(id) };
    }

    _xpFor(quality, o) {
        let xp = 10;
        if (quality === 5) xp += 10;
        else if (quality === 4) xp += 5;
        xp += (o.tier === 1 ? 0 : o.tier); // deeper tiers worth a touch more
        return xp;
    }

    _bumpStreak() {
        const s = this.data.streak;
        const today = todayStr();
        if (s.lastDate === today) return;            // already counted today
        if (s.lastDate && daysBetween(s.lastDate, today) === 1) s.count += 1;
        else s.count = 1;                            // first lesson today (gap reset)
        s.lastDate = today;
    }

    // Map mistakes in a lesson to an SM-2 quality grade.
    static qualityFromMistakes(mistakes) {
        if (mistakes === 0) return 5;
        if (mistakes === 1) return 4;
        if (mistakes === 2) return 3;
        return 2;
    }
}

window.Store = Store;
window.srsSegmentsFor = segmentsFor;
window.srsTodayStr = todayStr;

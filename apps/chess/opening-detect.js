// Opening name detection from the move history.
// Builds a prefix index over all OPENINGS at load time; each prefix (UCI moves
// joined by space) maps to the set of opening IDs that are still consistent
// with that move sequence.  detectOpening() returns 0–3 names or an empty
// array (too ambiguous or no match).

let _moveIndex = null;

function _build() {
    _moveIndex = new Map();
    for (const o of OPENINGS) {
        let prefix = "";
        for (const { uci } of o.moves) {
            prefix = prefix ? prefix + " " + uci : uci;
            if (!_moveIndex.has(prefix)) _moveIndex.set(prefix, new Set());
            _moveIndex.get(prefix).add(o.id);
        }
    }
}

// Returns [] when no match or when more than 3 openings share the position
// (still in very common early trunk). Returns 1–3 opening names otherwise.
function detectOpening(uciMoveArray) {
    if (!_moveIndex) _build();
    if (!uciMoveArray || uciMoveArray.length === 0) return [];
    const key = uciMoveArray.join(" ");
    const ids  = _moveIndex.get(key);
    if (!ids || ids.size === 0 || ids.size > 3) return [];
    return [...ids].map((id) => {
        const o = OPENINGS.find((x) => x.id === id);
        return o ? o.name : id;
    });
}

window.detectOpening = detectOpening;

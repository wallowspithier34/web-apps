// Game History screen + replay viewer.
// Reads completed games from chess-v2:games (written by play.js).

function _loadGames() {
    try {
        const g = JSON.parse(localStorage.getItem("chess-v2:games"));
        return Array.isArray(g) ? g : [];
    } catch (_) { return []; }
}

function _resultLabel(game) {
    if (game.result === "stalemate" || (game.result || "").startsWith("draw")) return { text: "Draw", cls: "res-draw" };
    const playerWon = game.winner === game.playerColor;
    return playerWon ? { text: "Win", cls: "res-win" } : { text: "Loss", cls: "res-loss" };
}

function _tcLabel(game) {
    // Prefer the stored bucket (authoritative; robust to preset-list changes).
    if (game.bucket) return game.bucket.endsWith("blitz") ? "Blitz" : "Rapid";
    const base = TIMER_PRESETS[game.timerPreset] ? TIMER_PRESETS[game.timerPreset].seconds : 0;
    return timeControlTag(base) === "blitz" ? "Blitz" : "Rapid";
}

function openHistory() {
    const list = document.getElementById("history-list");
    const games = _loadGames().slice().reverse();  // newest first
    list.innerHTML = "";
    if (!games.length) {
        list.innerHTML = `<p class="history-empty">No games played yet.</p>`;
    } else {
        games.forEach((game) => {
            const res = _resultLabel(game);
            const variant = game.variant === "c960" ? "Chess960" : "Standard";
            const d = game.date ? new Date(game.date) : null;
            const dateStr = d ? d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " +
                d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : "";
            const delta = game.eloDelta != null
                ? `<span class="history-delta ${game.eloDelta >= 0 ? "pos" : "neg"}">${game.eloDelta >= 0 ? "+" : ""}${game.eloDelta}</span>` : "";
            const item = document.createElement("button");
            item.className = "history-item";
            item.innerHTML =
                `<span class="history-res ${res.cls}">${res.text}</span>
                 <span class="history-meta">
                     <span class="history-line1">${variant} · ${_tcLabel(game)} · ${(game.moves || []).length} move${(game.moves || []).length === 1 ? "" : "s"}</span>
                     <span class="history-line2">${dateStr}${game.adaptive ? "" : " · unrated"}</span>
                 </span>
                 ${delta}
                 <span class="history-chevron">›</span>`;
            item.addEventListener("click", () => openReplay(game));
            list.appendChild(item);
        });
    }
    showScreen("screen-history");
}

// ── Replay viewer ───────────────────────────────────────────────────────────
let _rpGame, _rpMoves, _rpStartFen, _rpIndex, _rpOrientation, _rpStyle;

function openReplay(game) {
    _rpMoves       = game.moves || [];
    _rpStartFen    = game.startFen || undefined;
    _rpOrientation = game.playerColor || "w";
    _rpStyle       = getPrefs().pieces;
    _rpIndex       = _rpMoves.length;  // start at final position

    const variant = game.variant === "c960" ? "Chess960" : "Standard";
    document.getElementById("replay-title").textContent = variant + " replay";
    const res = _resultLabel(game);
    document.getElementById("replay-info").innerHTML =
        `<span class="history-res ${res.cls}">${res.text}</span> · ${_tcLabel(game)}` +
        (game.eloDelta != null ? ` · <span class="history-delta ${game.eloDelta >= 0 ? "pos" : "neg"}">${game.eloDelta >= 0 ? "+" : ""}${game.eloDelta} Elo</span>` : "");

    Board.buildBoard(document.getElementById("replay-board"), _rpOrientation, null);
    _renderReplay();
    showScreen("screen-replay");
}

function _renderReplay() {
    _rpGame = new Chess(_rpStartFen);
    let lastUci = null, lastResult = null;
    for (let i = 0; i < _rpIndex; i++) {
        lastResult = _rpGame.move(Chess.parseUci(_rpMoves[i]));
        if (!lastResult) break;
        lastUci = _rpMoves[i];
    }
    const boardEl = document.getElementById("replay-board");
    Board.renderPieces(_rpGame, boardEl, _rpStyle);
    Board.clearHighlights();
    if (lastUci && lastResult) {
        // For a 960 castle the UCI "to" is the rook square; tint the king's destination.
        const toSq = lastResult.castle && lastResult.kingTo != null
            ? idxToName(lastResult.kingTo) : lastUci.slice(2, 4);
        Board.setLastMove({ from: lastUci.slice(0, 2), to: toSq });
        Board.applyLastTint();
    } else {
        Board.setLastMove(null);
    }
    document.getElementById("replay-counter").textContent = `${_rpIndex} / ${_rpMoves.length}`;
}

function _replayGoto(i) {
    _rpIndex = Math.max(0, Math.min(_rpMoves.length, i));
    _renderReplay();
}

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("btn-history-back").addEventListener("click", () => { showScreen("screen-home"); refreshHome(); });
    document.getElementById("btn-replay-back").addEventListener("click", () => openHistory());
    document.getElementById("replay-first").addEventListener("click", () => _replayGoto(0));
    document.getElementById("replay-prev").addEventListener("click", () => _replayGoto(_rpIndex - 1));
    document.getElementById("replay-next").addEventListener("click", () => _replayGoto(_rpIndex + 1));
    document.getElementById("replay-last").addEventListener("click", () => _replayGoto(_rpMoves.length));
});

window.openHistory = openHistory;
window.openReplay  = openReplay;

// Play screen controller — handles both pass-and-play and vs-bot modes.
// Called via initPlay(config) from home.js navigation.

// ── FEN generation ─────────────────────────────────────────────────────────
function fenFromGame(game) {
    let placement = "";
    for (let row = 0; row < 8; row++) {
        let empty = 0;
        for (let file = 0; file < 8; file++) {
            const p = game.board[row * 8 + file];
            if (p) { if (empty) { placement += empty; empty = 0; } placement += p; }
            else empty++;
        }
        if (empty) placement += empty;
        if (row < 7) placement += "/";
    }
    const c = (game.castling.K ? "K" : "") + (game.castling.Q ? "Q" : "") +
              (game.castling.k ? "k" : "") + (game.castling.q ? "q" : "") || "-";
    const ep = game.ep !== null ? idxToName(game.ep) : "-";
    return `${placement} ${game.turn} ${c} ${ep} 0 1`;
}

// ── Module state ─────────────────────────────────────────────────────────────
let _game, _clock, _bot;
let _mode, _playerColor, _style;
let _history = [];        // UCI move strings
let _selectedSq = null;
let _waiting    = false;  // waiting for bot or promotion picker
let _gameOver   = false;
let _boardEl, _timerPreset;
let _promoCallback = null;

// ── Completed-game history ─────────────────────────────────────────────────────
// Every finished game (all modes) is appended here for later browsing/analysis.
// This key starts with "chess", so it is included in export/import save files.
const GAMES_KEY = "chess-v2:games";
const GAMES_MAX = 100;

// Append one completed-game record, keeping only the most recent GAMES_MAX.
function _recordGame(record) {
    let games = [];
    try { games = JSON.parse(localStorage.getItem(GAMES_KEY)) || []; } catch (_) { games = []; }
    if (!Array.isArray(games)) games = [];
    games.push(record);
    if (games.length > GAMES_MAX) games = games.slice(games.length - GAMES_MAX);
    try { localStorage.setItem(GAMES_KEY, JSON.stringify(games)); } catch (_) { /* quota */ }
}

// ── Init ──────────────────────────────────────────────────────────────────────
function initPlay(config) {
    const prefs = getPrefs();
    _mode        = config.mode || "pvp";
    _playerColor = config.playerColor || "w";
    _style       = prefs.pieces;
    _gameOver    = false;
    _waiting     = false;
    _selectedSq  = null;

    // Teardown previous bot
    if (_bot) { _bot.quit(); _bot = null; }
    if (_clock) { _clock.pause(); _clock = null; }

    _boardEl = document.getElementById("play-board");

    // Title & mode-specific UI
    const titleEl   = document.getElementById("play-title");
    const botStatus = document.getElementById("bot-status");
    if (_mode === "bot") {
        titleEl.textContent = "vs Bot";
        botStatus.hidden = false;
        botStatus.textContent = "Loading engine…";
    } else {
        titleEl.textContent = "Pass & Play";
        botStatus.hidden = true;
    }

    if (config.resume) {
        _resumeGame();
    } else {
        _newGame();
    }
}

function _newGame() {
    const prefs = getPrefs();
    _game    = new Chess();
    _history = [];
    localStorage.removeItem(GAME_KEY);

    const orientation = _mode === "bot" ? _playerColor : "w";
    Board.buildBoard(_boardEl, orientation, _onSquareTap);
    Board.renderPieces(_game, _boardEl, _style);

    _setupTimer(prefs);
    _setupClockDisplay();
    _updateMoveList();
    _updateOpeningHint();
    _checkGameOver();

    if (_mode === "bot") {
        _initBot(prefs);
    } else {
        _updateTurnLabels();
    }
}

function _resumeGame() {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(GAME_KEY)); } catch (_) { _newGame(); return; }
    if (!saved) { _newGame(); return; }

    const prefs = getPrefs();
    _mode        = saved.mode || _mode;
    _playerColor = saved.playerColor || _playerColor;
    _history     = saved.history || [];
    _style       = prefs.pieces;

    // Replay moves — bail to a fresh game if the saved history is corrupt
    _game = new Chess();
    for (const uci of _history) {
        const spec = Chess.parseUci(uci);
        if (!_game.move(spec)) { _newGame(); return; }
    }

    const orientation = _mode === "bot" ? _playerColor : "w";
    Board.buildBoard(_boardEl, orientation, _onSquareTap);
    Board.renderPieces(_game, _boardEl, _style);

    // Restore last-move tint
    if (_history.length) {
        const last = _history[_history.length - 1];
        Board.setLastMove({ from: last.slice(0, 2), to: last.slice(2, 4) });
        Board.applyLastTint();
    }

    _setupTimer(prefs, saved.timerState);
    _setupClockDisplay();
    _updateMoveList();
    _updateOpeningHint();
    _checkGameOver();

    if (!_gameOver && _mode === "bot") {
        _initBot(prefs, true);
    } else {
        _updateTurnLabels();
    }
}

// ── Timer setup ────────────────────────────────────────────────────────────
function _setupTimer(prefs, savedState) {
    _timerPreset = prefs.timerPreset ?? NO_TIMER_IDX;
    const preset = TIMER_PRESETS[_timerPreset];
    if (preset.seconds === 0) {
        _clock = null;
        document.getElementById("top-time").textContent = "—";
        document.getElementById("bottom-time").textContent = "—";
        return;
    }

    _clock = new ChessClock(preset.seconds, preset.increment);

    if (savedState) {
        _clock._ms.w = savedState.w ?? _clock._ms.w;
        _clock._ms.b = savedState.b ?? _clock._ms.b;
    }

    _clock.onTick((color, fmt, rem) => {
        _updateClockDisplay(color, fmt, rem);
    });
    _clock.onFlag((color) => {
        if (!_gameOver) _endGame("flag", color === "w" ? "b" : "w");
    });

    // Emit initial values
    _updateClockDisplay("w", ChessClock.format(_clock.remaining("w")), _clock.remaining("w"));
    _updateClockDisplay("b", ChessClock.format(_clock.remaining("b")), _clock.remaining("b"));

    // Start clock for the side to move (if game has started)
    if (_history.length > 0 && !_gameOver) {
        _clock.start(_game.turn);
    }
}

function _setupClockDisplay() {
    const orientation = Board.getOrientation();
    const topColor    = orientation === "w" ? "b" : "w";
    const botColor    = orientation === "w" ? "w" : "b";
    document.getElementById("top-side").textContent    = topColor === "w" ? "White" : "Black";
    document.getElementById("bottom-side").textContent = botColor === "w" ? "White" : "Black";
}

function _updateClockDisplay(color, fmt, rem) {
    const orientation = Board.getOrientation();
    const isTop = (orientation === "w" && color === "b") || (orientation === "b" && color === "w");
    const timeEl  = document.getElementById(isTop ? "top-time" : "bottom-time");
    const rowEl   = document.getElementById(isTop ? "top-clock" : "bottom-clock");
    if (timeEl) {
        timeEl.textContent = fmt;
        timeEl.classList.toggle("clock-low", rem < 10000 && rem > 0);
    }
    if (rowEl) {
        rowEl.classList.toggle("clock-active", _game && _game.turn === color && !_gameOver);
    }
}

function _updateTurnLabels() {
    if (!_game) return;
    const c = _game.turn;
    const orientation = Board.getOrientation();
    const isTop = (orientation === "w" && c === "b") || (orientation === "b" && c === "w");
    document.getElementById("top-clock").classList.toggle("clock-active", isTop);
    document.getElementById("bottom-clock").classList.toggle("clock-active", !isTop);
}

// ── Bot ───────────────────────────────────────────────────────────────────────
function _initBot(prefs, resume = false) {
    const diff  = prefs.botDifficulty;
    const mode  = diff.mode;
    const param = mode === "auto" ? getEloStore().elo : diff.skillLevel;
    _bot = new BotEngine();

    document.getElementById("bot-status").textContent = "Loading engine…";

    _bot.init(mode, param).then(() => {
        const status = document.getElementById("bot-status");
        if (status) status.textContent = `Skill ${_bot.skillLevel}`;

        // If bot moves first (player is black), or resuming with bot's turn
        if (!_gameOver && _game.turn !== _playerColor) {
            _doBotMove();
        }
    }).catch((e) => {
        showToast("Engine failed to load: " + e.message);
        const status = document.getElementById("bot-status");
        if (status) status.textContent = "Engine error";
    });
}

function _doBotMove() {
    if (_gameOver || !_bot) return;
    _waiting = true;
    const status = document.getElementById("bot-status");
    if (status) { status.textContent = "Thinking…"; status.classList.add("bot-thinking"); }

    const remainingMs = _clock ? _clock.remaining(_game.turn) : 0;
    const fen = fenFromGame(_game);

    _bot.getBestMove(fen, remainingMs).then((uci) => {
        if (_gameOver || !uci) {
            _waiting = false;
            if (status) status.classList.remove("bot-thinking");
            return;
        }
        const result = Board.animateMove(_game, uci, _style);
        if (!result) {
            _waiting = false;
            if (status) status.classList.remove("bot-thinking");
            return;
        }
        _history.push(uci);
        if (_clock) _clock.switch(_game.turn === "w" ? "b" : "w");
        _afterMove(result, uci);
        _waiting = false;
        if (status) { status.textContent = `Skill ${_bot.skillLevel}`; status.classList.remove("bot-thinking"); }
    }).catch(() => {
        _waiting = false;
        if (status) status.classList.remove("bot-thinking");
    });
}

// ── Board interaction ─────────────────────────────────────────────────────────
function _onSquareTap(name) {
    if (_gameOver || _waiting) return;
    if (_mode === "bot" && _game.turn !== _playerColor) return;

    const piece = _game.board[nameToIdx(name)];
    const myTurn = _game.turn;

    if (_selectedSq) {
        if (_selectedSq === name) {
            _selectedSq = null;
            Board.deselect();
            return;
        }
        // Try to move
        const legal = _game.legalMovesFrom(_selectedSq);
        const toIdx_  = nameToIdx(name);
        const matching = legal.filter((m) => m.to === toIdx_);
        if (matching.length) {
            const needsPromo = matching.some((m) => m.promotion);
            if (needsPromo) {
                _showPromoModal(_selectedSq, name, myTurn);
            } else {
                _executeMove(_selectedSq, name, null);
            }
            return;
        }
        // Clicking own piece: re-select
        if (piece && (myTurn === "w" ? piece === piece.toUpperCase() : piece === piece.toLowerCase())) {
            _selectedSq = name;
            Board.selectSquare(name, _game.legalMovesFrom(name));
            return;
        }
        _selectedSq = null;
        Board.deselect();
        return;
    }

    // No piece selected yet
    if (!piece) return;
    const isOwn = myTurn === "w" ? piece === piece.toUpperCase() : piece === piece.toLowerCase();
    if (!isOwn) return;
    _selectedSq = name;
    Board.selectSquare(name, _game.legalMovesFrom(name));
}

function _executeMove(from, to, promotion) {
    _selectedSq = null;
    const uci = from + to + (promotion ? promotion.toLowerCase() : "");
    const result = Board.animateMove(_game, uci, _style);
    if (!result) return;
    const movedColor = _game.turn === "w" ? "b" : "w"; // already flipped
    _history.push(uci);
    if (_clock) {
        if (_history.length === 1) _clock.start(_game.turn); // start after first move
        else _clock.switch(movedColor);
    }
    _afterMove(result, uci);
    if (!_gameOver && _mode === "bot") {
        setTimeout(_doBotMove, 200);
    }
}

function _afterMove(result, uci) {
    _updateMoveList();
    _updateOpeningHint();
    _updateTurnLabels();
    _saveGame();

    if (_game.inCheck()) {
        const ki = _game.board.findIndex((p) => p === (_game.turn === "w" ? "K" : "k"));
        if (ki !== -1) Board.markCheck(idxToName(ki));
    }
    _checkGameOver();
}

function _checkGameOver() {
    if (!_game) return;
    const moves = _game.legalMoves();
    if (moves.length === 0) {
        const inCheck = _game.inCheck();
        const winner  = inCheck ? (_game.turn === "w" ? "b" : "w") : null;
        _endGame(inCheck ? "checkmate" : "stalemate", winner);
    }
}

function _endGame(reason, winner) {
    _gameOver = true;
    if (_clock) _clock.pause();
    localStorage.removeItem(GAME_KEY);

    let icon, title, sub;
    if (reason === "checkmate") {
        const winName = winner === "w" ? "White" : "Black";
        icon = "♚"; title = "Checkmate!"; sub = `${winName} wins`;
    } else if (reason === "stalemate") {
        icon = "½"; title = "Stalemate"; sub = "Draw by stalemate";
    } else if (reason === "flag") {
        const winName = winner === "w" ? "White" : "Black";
        icon = "⏱"; title = "Time!"; sub = `${winName} wins on time`;
    } else if (reason === "resign") {
        const winName = winner === "w" ? "White" : "Black";
        icon = "⚑"; title = "Resignation"; sub = `${winName} wins`;
    } else if (reason === "draw") {
        icon = "½"; title = "Draw agreed"; sub = "½–½";
    }

    document.getElementById("go-icon").textContent  = icon;
    document.getElementById("go-title").textContent = title;
    document.getElementById("go-sub").textContent   = sub;

    // Elo update in bot mode (auto difficulty only)
    const goEloDelta = document.getElementById("go-elo-delta");
    let eloDelta = null;
    if (_mode === "bot" && getPrefs().botDifficulty.mode === "auto" && _bot) {
        const score = winner === _playerColor ? 1 : (winner === null ? 0.5 : 0);
        const { delta } = getEloStore().updateAfterGame(score, _bot.skillLevel);
        eloDelta = delta;
        goEloDelta.textContent = (delta >= 0 ? "+" : "") + delta + " Elo";
        goEloDelta.className   = "elo-delta " + (delta >= 0 ? "pos" : "neg");
        goEloDelta.hidden      = false;
        refreshHome();
    } else {
        goEloDelta.hidden = true;
    }

    // Persist the completed game for later browsing/analysis.
    _recordGame({
        date: new Date().toISOString(),
        mode: _mode,
        playerColor: _playerColor,
        result: reason,                 // checkmate|stalemate|flag|resign|draw
        winner,                         // "w" | "b" | null
        moves: _history.slice(),        // UCI strings — enough to replay/analyze
        opening: detectOpening(_history).join(" / "),
        timerPreset: _timerPreset,
        eloDelta,                       // number for bot+auto games, else null
    });

    document.getElementById("gameover-overlay").hidden = false;
}

// ── Promotion modal ────────────────────────────────────────────────────────────
function _showPromoModal(from, to, color) {
    _waiting = true;
    const modal   = document.getElementById("promo-modal");
    const choices = document.getElementById("promo-choices");
    choices.innerHTML = "";
    for (const type of ["Q", "R", "B", "N"]) {
        const btn = document.createElement("button");
        btn.className = `promo-btn ${color === "w" ? "white" : "black"}`;
        const inner = Board.samplePiece(getPrefs().pieces, color, type);
        btn.innerHTML = inner;
        btn.addEventListener("click", () => {
            modal.hidden = true;
            _waiting = false;
            _executeMove(from, to, type.toLowerCase());
        });
        choices.appendChild(btn);
    }
    modal.hidden = false;
}

// ── Move list ─────────────────────────────────────────────────────────────────
function _updateMoveList() {
    const el = document.getElementById("move-list");
    if (!el || !_history.length) { if (el) el.textContent = ""; return; }

    // Rebuild SAN from start for display
    const g = new Chess();
    const parts = [];
    for (let i = 0; i < _history.length; i++) {
        const r = g.move(Chess.parseUci(_history[i]));
        if (!r) break;
        if (i % 2 === 0) parts.push(`${Math.floor(i / 2) + 1}.`);
        parts.push(r.san);
    }
    el.textContent = parts.join(" ");
    el.scrollTop = el.scrollHeight;
}

// ── Opening hint ──────────────────────────────────────────────────────────────
function _updateOpeningHint() {
    const el = document.getElementById("opening-hint");
    if (!el) return;
    const names = detectOpening(_history);
    el.textContent = names.length ? names.join(" / ") : "";
}

// ── Persistence ───────────────────────────────────────────────────────────────
function _saveGame() {
    if (_gameOver) { localStorage.removeItem(GAME_KEY); return; }
    const timerState = _clock
        ? { w: _clock.remaining("w"), b: _clock.remaining("b"), presetIdx: _timerPreset }
        : null;
    try {
        localStorage.setItem(GAME_KEY, JSON.stringify({
            mode: _mode, playerColor: _playerColor,
            history: _history, timerState,
        }));
    } catch (_) {}
}

// ── Action buttons ────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("btn-play-back").addEventListener("click", () => {
        // Dismiss any pending promotion picker so it can't stay overlaid on Home
        document.getElementById("promo-modal").hidden = true;
        _waiting = false;
        if (_clock) _clock.pause();
        if (_bot) { _bot.quit(); _bot = null; }
        showScreen("screen-home");
        refreshHome();
    });

    document.getElementById("btn-flip").addEventListener("click", () => {
        const cur = Board.getOrientation();
        const orientation = cur === "w" ? "b" : "w";
        Board.buildBoard(_boardEl, orientation, _onSquareTap);
        Board.renderPieces(_game, _boardEl, _style);
        _setupClockDisplay();
    });

    document.getElementById("btn-resign").addEventListener("click", () => {
        if (_gameOver) return;
        const winner = _game.turn === "w" ? "b" : "w";
        _endGame("resign", winner);
    });

    document.getElementById("btn-draw").addEventListener("click", () => {
        if (_gameOver) return;
        if (_mode === "bot") {
            _endGame("draw", null);
        } else {
            // PvP: second tap accepts
            const btn = document.getElementById("btn-draw");
            if (btn.dataset.offered) {
                delete btn.dataset.offered;
                btn.textContent = "Draw";
                _endGame("draw", null);
            } else {
                btn.dataset.offered = "1";
                btn.textContent = "Accept?";
                setTimeout(() => { btn.textContent = "Draw"; delete btn.dataset.offered; }, 5000);
            }
        }
    });

    document.getElementById("btn-new-game").addEventListener("click", () => {
        if (_bot) { _bot.quit(); _bot = null; }
        if (_clock) { _clock.pause(); _clock = null; }
        document.getElementById("gameover-overlay").hidden = true;
        _gameOver = false;
        _newGame();  // _newGame() initializes the bot itself in bot mode
    });

    document.getElementById("go-btn-home").addEventListener("click", () => {
        document.getElementById("gameover-overlay").hidden = true;
        if (_bot) { _bot.quit(); _bot = null; }
        showScreen("screen-home");
        refreshHome();
    });

    document.getElementById("go-btn-again").addEventListener("click", () => {
        document.getElementById("gameover-overlay").hidden = true;
        if (_bot) { _bot.quit(); _bot = null; }
        if (_clock) { _clock.pause(); _clock = null; }
        _gameOver = false;
        _newGame();  // _newGame() initializes the bot itself in bot mode
    });
});

window.initPlay = initPlay;

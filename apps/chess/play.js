// Play screen controller — human vs bot only.
// initPlay(config) is called from home.js navigation. config: { variant, resume }.

// ── Completed-game history ──────────────────────────────────────────────────
// Every finished game is appended here for the History screen. Records carry
// enough to replay (start FEN + UCI moves) and to filter by rating bucket.
const GAMES_KEY = "chess-v2:games";
const GAMES_MAX = 500;

function _recordGame(record) {
    let games = [];
    try { games = JSON.parse(localStorage.getItem(GAMES_KEY)) || []; } catch (_) { games = []; }
    if (!Array.isArray(games)) games = [];
    games.push(record);
    if (games.length > GAMES_MAX) games = games.slice(games.length - GAMES_MAX);
    try { localStorage.setItem(GAMES_KEY, JSON.stringify(games)); } catch (_) { /* quota */ }
}

// ── Module state ────────────────────────────────────────────────────────────
let _game, _clock, _bot;
let _variant, _adaptive, _manualSkill, _bucketKey, _startFen;
let _playerColor, _style, _timerPreset;
let _history   = [];        // UCI move strings
let _posCounts = {};        // positionKey → count (threefold repetition)
let _selectedSq = null;
let _waiting    = false;
let _gameOver   = false;
let _boardEl;
let _gen        = 0;         // bumped each game; async bot callbacks bail if it changed
let _preMove    = null;      // queued pre-move { from, to } (played on the player's turn)
let _preSel     = null;      // pre-move source square being selected

// ── Init ────────────────────────────────────────────────────────────────────
function initPlay(config) {
    const prefs = getPrefs();
    _style       = prefs.pieces;
    _gameOver    = false;
    _waiting     = false;
    _selectedSq  = null;

    if (_bot)   { _bot.quit();   _bot = null; }
    if (_clock) { _clock.pause(); _clock = null; }

    _boardEl = document.getElementById("play-board");
    document.getElementById("gameover-overlay").hidden = true;
    document.getElementById("promo-modal").hidden = true;

    if (config.resume) { _resumeGame(); }
    else {
        _variant     = config.variant || prefs.variant || "standard";
        _adaptive    = prefs.difficulty.mode === "adaptive";
        _manualSkill = prefs.difficulty.skill;
        _timerPreset = prefs.timerPreset ?? NO_TIMER_IDX;
        _bucketKey   = bucketKey(_variant, TIMER_PRESETS[_timerPreset].seconds);
        _playerColor = Math.random() < 0.5 ? "w" : "b";
        _newGame();
    }
}

function _setTitle() {
    document.getElementById("play-title").textContent = _variant === "c960" ? "Chess960" : "Chess";
}

// Reset per-game UI state carried on shared DOM: the two-tap resign button and any
// queued pre-move. Called at the start of every game so state can't leak across games.
function _resetControls() {
    const btn = document.getElementById("btn-resign");
    if (btn) { btn.textContent = "Resign"; delete btn.dataset.confirm; }
    _clearPreMove();
}

function _clearPreMove() {
    _preMove = null;
    _preSel  = null;
    Board.clearPremove();
}

function _newGame() {
    _gen++;
    _resetControls();
    _setTitle();
    _startFen = _variant === "c960" ? Chess.random960Fen() : undefined;
    _game     = new Chess(_startFen);   // undefined → standard start
    _history  = [];
    _posCounts = {};
    _recordPosition();
    localStorage.removeItem(GAME_KEY);

    Board.buildBoard(_boardEl, _playerColor, _onSquareTap);
    Board.renderPieces(_game, _boardEl, _style);

    _setupTimer(getPrefs());
    _setupClockDisplay();
    _updateMoveList();
    _checkGameOver();
    if (!_gameOver) _initBot();
}

function _resumeGame() {
    _gen++;
    _resetControls();
    let saved;
    try { saved = JSON.parse(localStorage.getItem(GAME_KEY)); } catch (_) { saved = null; }
    if (!saved) { initPlay({ variant: getPrefs().variant }); return; }

    _variant     = saved.variant || "standard";
    _adaptive    = !!saved.adaptive;
    _manualSkill = saved.manualSkill != null ? saved.manualSkill : getPrefs().difficulty.skill;
    _startFen    = saved.startFen || undefined;
    _playerColor = saved.playerColor || "w";
    _timerPreset = saved.timerPreset != null ? saved.timerPreset : (getPrefs().timerPreset ?? NO_TIMER_IDX);
    _bucketKey   = saved.bucketKey || bucketKey(_variant, TIMER_PRESETS[_timerPreset].seconds);
    _history     = saved.history || [];
    _style       = getPrefs().pieces;

    _game = new Chess(_startFen);
    _posCounts = {};
    _recordPosition();
    let lastResult = null;
    for (const uci of _history) {
        lastResult = _game.move(Chess.parseUci(uci));
        if (!lastResult) { initPlay({ variant: _variant }); return; }
        _recordPosition();
    }

    _setTitle();
    Board.buildBoard(_boardEl, _playerColor, _onSquareTap);
    Board.renderPieces(_game, _boardEl, _style);
    if (_history.length && lastResult) {
        const last = _history[_history.length - 1];
        // For a 960 castle the UCI "to" is the rook square; highlight the king's destination.
        const toSq = lastResult.castle && lastResult.kingTo != null
            ? idxToName(lastResult.kingTo) : last.slice(2, 4);
        Board.setLastMove({ from: last.slice(0, 2), to: toSq });
        Board.applyLastTint();
    }

    _setupTimer(getPrefs(), saved.timerState);
    _setupClockDisplay();
    _updateMoveList();
    _updateCaptured();
    _checkGameOver();
    if (!_gameOver) _initBot(true);
}

// ── Bot ─────────────────────────────────────────────────────────────────────
function _initBot() {
    const opts = _adaptive
        ? { mode: "adaptive", elo: getEloStore().elo(_bucketKey), variant: _variant }
        : { mode: "manual", skill: _manualSkill, variant: _variant };
    _bot = new BotEngine();

    const status = document.getElementById("bot-status");
    status.hidden = false;
    status.textContent = "Loading engine…";

    _bot.init(opts).then(() => {
        if (status) status.textContent = _botLabel();
        if (!_gameOver && _game.turn !== _playerColor) _doBotMove();
    }).catch((e) => {
        showToast("Engine failed to load: " + e.message);
        if (status) status.textContent = "Engine error";
    });
}

function _botLabel() {
    return _adaptive ? "Adaptive" : ("Skill " + _manualSkill);
}

function _doBotMove() {
    if (_gameOver || !_bot) return;
    const gen = _gen;              // if a new game starts, this callback is stale → bail
    _waiting = true;
    const status = document.getElementById("bot-status");
    if (status) { status.textContent = "Thinking…"; status.classList.add("bot-thinking"); }

    const remainingMs = _clock ? _clock.remaining(_game.turn) : 0;
    const legalUci = _game.legalMoves().map(_moveToUci);

    _bot.getBestMove(_game.fen(), remainingMs, legalUci).then((uci) => {
        if (_gen !== gen) return;
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
        _afterMove();
        _waiting = false;
        if (status) { status.textContent = _botLabel(); status.classList.remove("bot-thinking"); }
        _tryPreMove();
    }).catch(() => {
        if (_gen !== gen) return;
        _waiting = false;
        if (status) status.classList.remove("bot-thinking");
    });
}

// Play a queued pre-move if it's now the player's turn and still legal; else discard.
function _tryPreMove() {
    if (_gameOver || !_preMove || _game.turn !== _playerColor) return;
    const { from, to } = _preMove;
    _clearPreMove();
    const legal = _game.legalMovesFrom(from).filter((m) => idxToName(m.to) === to);
    if (!legal.length) return;                 // opponent's move made it illegal → discard
    _executeMove(from, to, legal.some((m) => m.promotion) ? "q" : null);
}

function _moveToUci(m) {
    return idxToName(m.from) + idxToName(m.to) + (m.promotion ? m.promotion.toLowerCase() : "");
}

// ── Board interaction ───────────────────────────────────────────────────────
function _onSquareTap(name) {
    if (_gameOver) return;
    // Opponent to move (bot thinking or about to move): queue/cancel a pre-move.
    if (_game.turn !== _playerColor) { _onPreMoveTap(name); return; }
    // Player to move but busy (own promotion picker open): ignore.
    if (_waiting) return;

    const piece  = _game.board[nameToIdx(name)];
    const myTurn = _game.turn;

    if (_selectedSq) {
        if (_selectedSq === name) { _selectedSq = null; Board.deselect(); return; }
        const legal    = _game.legalMovesFrom(_selectedSq);
        const toIdx_   = nameToIdx(name);
        const matching = legal.filter((m) => m.to === toIdx_);
        if (matching.length) {
            if (matching.some((m) => m.promotion)) _showPromoModal(_selectedSq, name, myTurn);
            else _executeMove(_selectedSq, name, null);
            return;
        }
        if (piece && (myTurn === "w" ? piece === piece.toUpperCase() : piece === piece.toLowerCase())) {
            _selectedSq = name;
            Board.selectSquare(name, _game.legalMovesFrom(name));
            return;
        }
        _selectedSq = null; Board.deselect();
        return;
    }

    if (!piece) return;
    const isOwn = myTurn === "w" ? piece === piece.toUpperCase() : piece === piece.toLowerCase();
    if (!isOwn) return;
    _selectedSq = name;
    Board.selectSquare(name, _game.legalMovesFrom(name));
}

// Pre-move selection (while it's the opponent's turn). No legality check yet — the
// queued move is validated when the player's turn actually arrives (_tryPreMove).
function _onPreMoveTap(name) {
    const piece = _game.board[nameToIdx(name)];
    const isOwn = piece && (_playerColor === "w" ? piece === piece.toUpperCase() : piece === piece.toLowerCase());
    if (_preSel) {
        if (_preSel === name) { _clearPreMove(); return; }   // tap source again → cancel
        _preMove = { from: _preSel, to: name };
        _preSel  = null;
        Board.markPremove(_preMove.from, _preMove.to);
        return;
    }
    if (isOwn) { _clearPreMove(); _preSel = name; Board.markPremove(name, null); }
    else       { _clearPreMove(); }                          // tap empty/enemy → clear
}

function _executeMove(from, to, promotion) {
    _selectedSq = null;
    const uci    = from + to + (promotion ? promotion.toLowerCase() : "");
    const result = Board.animateMove(_game, uci, _style);
    if (!result) return;
    const movedColor = _game.turn === "w" ? "b" : "w"; // already flipped
    _history.push(uci);
    if (_clock) {
        if (_history.length === 1) _clock.start(_game.turn);
        else _clock.switch(movedColor);
    }
    _afterMove();
    if (!_gameOver && _game.turn !== _playerColor) setTimeout(_doBotMove, 200);
}

function _afterMove() {
    _recordPosition();
    _updateMoveList();
    _updateTurnLabels();
    _updateCaptured();
    _saveGame();
    if (_game.inCheck()) {
        const ki = _game.board.findIndex((p) => p === (_game.turn === "w" ? "K" : "k"));
        if (ki !== -1) Board.markCheck(idxToName(ki));
    }
    _checkGameOver();
}

function _recordPosition() {
    const key = _game.positionKey();
    _posCounts[key] = (_posCounts[key] || 0) + 1;
}

// ── Game-over detection ─────────────────────────────────────────────────────
function _checkGameOver() {
    if (!_game || _gameOver) return;
    if (_game.legalMoves().length === 0) {
        const inCheck = _game.inCheck();
        _endGame(inCheck ? "checkmate" : "stalemate", inCheck ? (_game.turn === "w" ? "b" : "w") : null);
        return;
    }
    if (_game.halfmove >= 100)                    { _endGame("draw-50", null); return; }
    if (_game.isInsufficientMaterial())           { _endGame("draw-material", null); return; }
    if (_posCounts[_game.positionKey()] >= 3)     { _endGame("draw-threefold", null); return; }
}

function _endGame(reason, winner) {
    _gameOver = true;
    _clearPreMove();
    if (_clock) _clock.pause();
    localStorage.removeItem(GAME_KEY);

    const winName = winner === "w" ? "White" : "Black";
    let icon, title, sub;
    if (reason === "checkmate")      { icon = "♚"; title = "Checkmate"; sub = `${winName} wins`; }
    else if (reason === "stalemate") { icon = "½"; title = "Stalemate"; sub = "Draw"; }
    else if (reason === "flag")      { icon = "⏱"; title = "Time"; sub = `${winName} wins on time`; }
    else if (reason === "resign")    { icon = "⚑"; title = "Resigned"; sub = `${winName} wins`; }
    else {
        icon = "½"; title = "Draw";
        sub = { "draw-50": "50-move rule", "draw-material": "Insufficient material",
                "draw-threefold": "Threefold repetition" }[reason] || "Draw";
    }
    document.getElementById("go-icon").textContent  = icon;
    document.getElementById("go-title").textContent = title;
    document.getElementById("go-sub").textContent   = sub;

    // Adaptive rating update (player's perspective).
    const score = winner === _playerColor ? 1 : (winner === null ? 0.5 : 0);
    const goDelta = document.getElementById("go-elo-delta");
    let eloDelta = null;
    if (_adaptive) {
        const { delta } = getEloStore().updateAfterGame(_bucketKey, score);
        eloDelta = delta;
        goDelta.textContent = delta === 0 ? "No rating change" : ((delta > 0 ? "+" : "") + delta + " Elo");
        goDelta.className   = "elo-delta " + (delta === 0 ? "neutral" : delta > 0 ? "pos" : "neg");
        goDelta.hidden = false;
        refreshHome();
    } else {
        goDelta.hidden = true;
    }

    _recordGame({
        date: new Date().toISOString(),
        variant: _variant,
        bucket: _bucketKey,
        adaptive: _adaptive,
        playerColor: _playerColor,
        result: reason,
        winner,
        moves: _history.slice(),
        startFen: _startFen || null,
        timerPreset: _timerPreset,
        eloDelta,
    });

    document.getElementById("gameover-overlay").hidden = false;
}

// Resign a paused (saved) game without loading it — used when the player starts a
// new game while one is paused. Mirrors the Elo + history effects of an in-game
// resignation. Returns true if a resignation was recorded.
function resignSavedGame() {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(GAME_KEY)); } catch (_) { return false; }
    if (!saved || !(saved.history || []).length) { localStorage.removeItem(GAME_KEY); return false; }

    const variant     = saved.variant || "standard";
    const playerColor = saved.playerColor || "w";
    const winner      = playerColor === "w" ? "b" : "w";
    const preset      = saved.timerPreset != null ? saved.timerPreset : (getPrefs().timerPreset ?? NO_TIMER_IDX);
    const key         = saved.bucketKey || bucketKey(variant, TIMER_PRESETS[preset].seconds);

    let eloDelta = null;
    if (saved.adaptive) {
        const { delta } = getEloStore().updateAfterGame(key, 0); // player loss
        eloDelta = delta;
    }
    _recordGame({
        date: new Date().toISOString(),
        variant, bucket: key, adaptive: !!saved.adaptive,
        playerColor, result: "resign", winner,
        moves: (saved.history || []).slice(),
        startFen: saved.startFen || null,
        timerPreset: preset, eloDelta,
    });
    localStorage.removeItem(GAME_KEY);
    return true;
}

// ── Timer ───────────────────────────────────────────────────────────────────
function _setupTimer(prefs, savedState) {
    const preset = TIMER_PRESETS[_timerPreset];
    if (!preset || preset.seconds === 0) {
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
    _clock.onTick((color, fmt, rem) => _updateClockDisplay(color, fmt, rem));
    _clock.onFlag((color) => { if (!_gameOver) _endGame("flag", color === "w" ? "b" : "w"); });
    _updateClockDisplay("w", ChessClock.format(_clock.remaining("w")), _clock.remaining("w"));
    _updateClockDisplay("b", ChessClock.format(_clock.remaining("b")), _clock.remaining("b"));
    if (_history.length > 0 && !_gameOver) _clock.start(_game.turn);
}

function _setupClockDisplay() {
    const orientation = Board.getOrientation();
    const topColor    = orientation === "w" ? "b" : "w";
    const botColor    = orientation === "w" ? "w" : "b";
    document.getElementById("top-side").textContent    = topColor === "w" ? "White" : "Black";
    document.getElementById("bottom-side").textContent = botColor === "w" ? "White" : "Black";
    _updateCaptured();
    _updateTurnLabels();
}

// ── Captured-pieces tray ────────────────────────────────────────────────────
const _CAP_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9 };
const _CAP_START = { p: 8, n: 2, b: 2, r: 2, q: 1 };

// Captured pieces are the opponent's missing pieces, drawn in the opponent's
// colour using the player's chosen piece style (same assets as the board) so the
// glyph shape and colour always match what's on the board.
function _capturedFor(capturerColor) {
    const oppColor = capturerColor === "w" ? "b" : "w";
    const counts = { p: 0, n: 0, b: 0, r: 0, q: 0 };
    for (const ch of _game.board) {
        if (!ch) continue;
        const chColor = ch === ch.toUpperCase() ? "w" : "b";
        if (chColor !== oppColor) continue;
        const t = ch.toLowerCase();
        if (counts[t] != null) counts[t]++;
    }
    const style = getPrefs().pieces;
    let html = "", value = 0;
    for (const t of ["q", "r", "b", "n", "p"]) {
        const missing = Math.max(0, _CAP_START[t] - counts[t]);
        for (let i = 0; i < missing; i++) { html += Board.samplePiece(style, oppColor, t.toUpperCase()); value += _CAP_VALUE[t]; }
    }
    return { html, value };
}

function _updateCaptured() {
    const topEl = document.getElementById("top-captured");
    const botEl = document.getElementById("bottom-captured");
    if (!topEl || !botEl || !_game) return;
    const orientation = Board.getOrientation();
    const topColor = orientation === "w" ? "b" : "w";
    const botColor = orientation === "w" ? "w" : "b";
    const topCap = _capturedFor(topColor);
    const botCap = _capturedFor(botColor);
    const adv = topCap.value - botCap.value;
    const badge = (n) => (n > 0 ? `<span class="captured-adv">+${n}</span>` : "");
    topEl.innerHTML = topCap.html + badge(adv);
    botEl.innerHTML = botCap.html + badge(-adv);
}

function _updateClockDisplay(color, fmt, rem) {
    const orientation = Board.getOrientation();
    const isTop = (orientation === "w" && color === "b") || (orientation === "b" && color === "w");
    const timeEl = document.getElementById(isTop ? "top-time" : "bottom-time");
    const rowEl  = document.getElementById(isTop ? "top-clock" : "bottom-clock");
    if (timeEl) { timeEl.textContent = fmt; timeEl.classList.toggle("clock-low", rem < 10000 && rem > 0); }
    if (rowEl)  { rowEl.classList.toggle("clock-active", _game && _game.turn === color && !_gameOver); }
}

function _updateTurnLabels() {
    if (!_game) return;
    const c = _game.turn;
    const orientation = Board.getOrientation();
    const isTop = (orientation === "w" && c === "b") || (orientation === "b" && c === "w");
    document.getElementById("top-clock").classList.toggle("clock-active", isTop && !_gameOver);
    document.getElementById("bottom-clock").classList.toggle("clock-active", !isTop && !_gameOver);
}

// ── Promotion modal ─────────────────────────────────────────────────────────
function _showPromoModal(from, to, color) {
    _waiting = true;
    const modal   = document.getElementById("promo-modal");
    const choices = document.getElementById("promo-choices");
    choices.innerHTML = "";
    for (const type of ["Q", "R", "B", "N"]) {
        const btn = document.createElement("button");
        btn.className = `promo-btn ${color === "w" ? "white" : "black"}`;
        btn.innerHTML = Board.samplePiece(getPrefs().pieces, color, type);
        btn.addEventListener("click", () => { modal.hidden = true; _waiting = false; _executeMove(from, to, type.toLowerCase()); });
        choices.appendChild(btn);
    }
    modal.hidden = false;
}

// ── Move list ───────────────────────────────────────────────────────────────
function _updateMoveList() {
    const el = document.getElementById("move-list");
    if (!el) return;
    if (!_history.length) { el.textContent = ""; return; }
    const g = new Chess(_startFen);
    const lines = [];
    for (let i = 0; i < _history.length; i++) {
        const r = g.move(Chess.parseUci(_history[i]));
        if (!r) break;
        if (i % 2 === 0) lines.push(`${Math.floor(i / 2) + 1}. ${r.san}`);
        else             lines[lines.length - 1] += ` ${r.san}`;
    }
    el.textContent = lines.join("\n");
    el.scrollTop = el.scrollHeight;
}

// ── Persistence ─────────────────────────────────────────────────────────────
function _saveGame() {
    if (_gameOver) { localStorage.removeItem(GAME_KEY); return; }
    const timerState = _clock ? { w: _clock.remaining("w"), b: _clock.remaining("b") } : null;
    try {
        localStorage.setItem(GAME_KEY, JSON.stringify({
            variant: _variant, adaptive: _adaptive, manualSkill: _manualSkill,
            bucketKey: _bucketKey, startFen: _startFen || null,
            playerColor: _playerColor, timerPreset: _timerPreset,
            history: _history, timerState,
        }));
    } catch (_) {}
}

// ── Buttons ─────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("btn-play-back").addEventListener("click", () => {
        // Leaving mid-game keeps it paused (resume from Home). Game already saved.
        document.getElementById("promo-modal").hidden = true;
        _waiting = false;
        _gen++;                     // invalidate any in-flight bot callback
        _clearPreMove();
        if (_clock) _clock.pause();
        if (_bot) { _bot.quit(); _bot = null; }
        showScreen("screen-home");
        refreshHome();
    });

    document.getElementById("btn-flip").addEventListener("click", () => {
        const orientation = Board.getOrientation() === "w" ? "b" : "w";
        const lastMove = Board.getLastMove();   // buildBoard resets it — capture first
        _clearPreMove();
        Board.buildBoard(_boardEl, orientation, _onSquareTap);
        Board.renderPieces(_game, _boardEl, _style);
        if (lastMove) { Board.setLastMove(lastMove); Board.applyLastTint(); }
        _setupClockDisplay();
    });

    document.getElementById("btn-resign").addEventListener("click", () => {
        if (_gameOver) return;
        const btn = document.getElementById("btn-resign");
        if (btn.dataset.confirm) {
            delete btn.dataset.confirm;
            btn.textContent = "Resign";
            _endGame("resign", _playerColor === "w" ? "b" : "w");
        } else {
            btn.dataset.confirm = "1";
            btn.textContent = "Sure?";
            setTimeout(() => { btn.textContent = "Resign"; delete btn.dataset.confirm; }, 5000);
        }
    });

    // Game-over: Rematch keeps the same settings; Edit settings returns Home.
    document.getElementById("go-btn-rematch").addEventListener("click", () => {
        document.getElementById("gameover-overlay").hidden = true;
        if (_bot) { _bot.quit(); _bot = null; }
        if (_clock) { _clock.pause(); _clock = null; }
        _gameOver = false;
        _playerColor = Math.random() < 0.5 ? "w" : "b";
        _newGame();
    });
    document.getElementById("go-btn-edit").addEventListener("click", () => {
        document.getElementById("gameover-overlay").hidden = true;
        if (_bot) { _bot.quit(); _bot = null; }
        showScreen("screen-home");
        refreshHome();
    });
});

window.initPlay        = initPlay;
window.resignSavedGame = resignSavedGame;

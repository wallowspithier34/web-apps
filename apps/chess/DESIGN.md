# Chess — Design & Architecture Reference

Authoritative, exhaustive reference for `apps/chess/`. Update this document whenever
behavior, APIs, constants, or the data schema change — it is meant to be complete
enough that a future change can be checked against it to catch regressions.

---

## 1. Overview

A single-purpose, fully offline Progressive Web App for **playing chess against a
self-tuning bot**. There is no trainer, pass-and-play, or opening library — the only
activity is human-vs-bot.

- **Stack:** plain HTML + CSS + JS. No backend, no build step, no npm, no frameworks.
  Modules are ordinary `<script>` files that communicate via `window` globals.
- **State:** everything in `localStorage` under the `chess-v2:` namespace.
- **Engine:** Stockfish.js 18 (chess.com fork, GPLv3), pure-JS (no WASM, no
  SharedArrayBuffer), run in a Web Worker so it works on static hosting with no
  special headers. Vendored as `stockfish.js` (~10 MB).
- **Target:** mobile-first, iOS Safari primary. Max content width 520 px.
- **Offline:** a cache-first service worker precaches every asset.

### Project rules that constrain this app
- Vanilla only; shipped app must run as static files.
- Namespace all `localStorage` keys (`chess-v2:` here).
- Fully self-contained; works as a standalone offline PWA; relative asset paths.
- Every fetched asset listed in `sw.js` `ASSETS`; bump `CACHE` when any cached file
  changes.
- **Themes are normally fixed** — this app carries a *documented exception*: a manual
  light/dark toggle (see §5). It never reads `prefers-color-scheme`; the default is a
  fixed **dark** theme and the user switches manually.
- Account for iOS safe-area insets on full-screen chrome.

---

## 2. File manifest & load order

Loaded in this order at the bottom of `index.html` (order matters — later files use
globals defined by earlier ones):

| File | Exports (`window.*`) | Responsibility |
|------|----------------------|----------------|
| `chess.js` | `Chess`, `idxToName`, `nameToIdx` | Rules engine: move generation, legality, SAN, FEN, draw primitives, 960 generator. |
| `board.js` | `Board`, `IMG_SETS` | DOM board rendering, piece elements, animation, highlights. |
| `elo.js` | `EloStore`, `bucketKey`, `timeControlTag`, `BUCKET_KEYS` | Ratings, adaptive update, progression history, strength model. |
| `timer.js` | `ChessClock`, `TIMER_PRESETS`, `NO_TIMER_IDX` | Chess clock + time-control presets. |
| `bot.js` | `BotEngine` | Stockfish Web Worker wrapper + weak-play move selection. |
| `export.js` | `downloadSave`, `importSaveFromText` | JSON backup export/import. |
| `home.js` | `showScreen`, `showToast`, `getEloStore`, `getPrefs`, `savePrefs`, `refreshHome`, `applyBoardTheme`, `GAME_KEY`, `BOARD_THEMES`, `PIECE_STYLES` | Prefs, navigation, ratings display, config card, Settings panel, theming. |
| `play.js` | `initPlay`, `resignSavedGame` | Game controller: move flow, clock, persistence, draw detection, Elo update, pre-moves, game-over flow. |
| `history.js` | `openHistory`, `openReplay` | Game History list + replay viewer. |
| `stockfish.js` | (worker) | Vendored engine, spawned via `new Worker("./stockfish.js")`. |

Non-JS: `index.html`, `styles.css`, `manifest.json`, `icon.svg`, `sw.js`,
`app.json` (store catalog metadata), `pieces/<set>/<wb><KQRBNP>.{svg,png}`.

---

## 3. Screens & DOM structure

Single-page app. Each screen is a sibling `<div class="screen">`; `showScreen(id)`
toggles the `.active` class (only one active at a time). Overlays
(`#settings-panel`, `#confirm-modal`, `#promo-modal`, `#gameover-overlay`) are
`position: fixed` and toggled via the `hidden` attribute.

- **`#screen-home`** — title + `#btn-settings` gear; `#ratings` (two rating cards);
  `#resume-banner` (paused-game resume); the **config card** (`#cfg-variant`,
  `#cfg-timer`, `#cfg-diff`, `#cfg-skill-row`/`#cfg-skill`, `#cfg-note`, `#btn-play`).
- **`#screen-play`** — `.play-top` (`.bar` with `#btn-play-back`, `#play-title`,
  `#btn-flip`; `#top-clock` row; `#bot-status`); `.board-wrap > #play-board`;
  `.play-bottom` (`#bottom-clock`, `#move-list`, `.play-actions > #btn-resign`).
  Overlays: `#promo-modal`, `#gameover-overlay` (`#go-icon`, `#go-title`, `#go-sub`,
  `#go-elo-delta`, `#go-btn-edit`, `#go-btn-rematch`).
- **`#screen-history`** — `#btn-history-back`, `#history-list`.
- **`#screen-replay`** — `#replay-title`, `#replay-info`, `#replay-board`,
  controls (`#replay-first/prev/next/last`, `#replay-counter`).
- **`#settings-panel`** — theme `#theme-seg`, `#piece-style-grid`,
  `#board-swatch-grid`, `#ratings-edit`, `#st-history`, `#st-export`, `#st-import`
  (+ hidden `#st-import-file`), `#st-reset`.
- **`#confirm-modal`** — in-app "start new game over paused game" dialog
  (`#confirm-cancel`, `#confirm-ok`).
- **`#toast`** — transient status messages.

---

## 4. Design language & CSS tokens (`styles.css`)

Warm-beige **Semafor**-inspired editorial look: cream backgrounds, **Georgia serif**
headings (`--serif`), system-sans body (`--sans`), warm-brown accents. Consistent
with the landing page, `posts`, and `chess-openings`.

Colors are CSS custom properties on `:root` (light) and overridden on `body.dark`.
`[hidden] { display:none !important }` guarantees the attribute beats class-level
`display` rules.

**Light palette (`:root`):**
`--bg #f5f0d0` · `--surface #fbf7e8` · `--surface2 #efe8cc` · `--text #1f1d1a` ·
`--text-dim #6b6555` · `--text-faint #948d78` · `--border #d9d2ac` ·
`--accent #7c5e3c` · `--accent-2 #5a4228` · `--on-accent #fbf7e8`.
Result colors: `--win #2f7d32` · `--loss #b23b3b` · `--draw #8a7642`.

**Dark palette (`body.dark`):**
`--bg #1a1a1a` · `--surface #262626` · `--surface2 #2f2f2f` · `--text #e8e0d4` ·
`--text-dim #a89880` · `--text-faint #7d7360` · `--border #3b3630` ·
`--accent #c8a87a` · `--accent-2 #e0c090`. Results lighten
(`--win #6fbf73` · `--loss #e07b7b` · `--draw #c8b06a`).

**Board interaction overlays** (tuned per theme where noted): `--sel`, `--sel-bg`,
`--legal-dot`, `--last-bg`, `--chk-bg`, `--wrong-bg`, `--hint-bg`. Pre-move squares
use a fixed warm orange (`rgba(220,120,40,.5)` + outline).

**Piece fills** (`--pw`, `--pb`, `--pw-edge`, `--pb-edge`) — reserved for
color-via-CSS piece rendering; the current image sets carry their own colors.

**Board color themes** — set `--sq-light`/`--sq-dark`/`--last-edge` via
`[data-board="…"]` on `#app`:

| id | light sq | dark sq |
|----|----------|---------|
| `classic` (default) | `#f0d9b5` | `#b58863` |
| `walnut` | `#e8cfa6` | `#9c6b43` |
| `forest` | `#ebecd0` | `#779556` |
| `ocean` | `#dbe6ec` | `#6f92a8` |
| `rose` | `#f3dbe0` | `#b56b82` |
| `amethyst` | `#e3dcf2` | `#8267a8` |

**Layout:** `#app` is a max-520 px centered flex column. `.screen` is
`min-height:100dvh`. The play screen top bar + top clock hug the board; the
`.play-bottom` panel is `flex:1` and its `#move-list` child is `flex:1`, so the
leftover height of a tall portrait viewport (a square board can't fill it) is
absorbed by the move list — no dead gap around the board. Safe-area insets are
applied on bars and bottom padding. Tap targets ≥ 44 px.

---

## 5. Intended operation (behavior)

### 5.1 Game types & rating buckets
- Two game types: **Standard** and **Chess960** (authentic Fischer-random, incl.
  castling).
- Each type keeps a **separate rating per time control**. Time control is derived
  from the base clock time: **≤ 300 s (5 min) ⇒ Blitz**, otherwise (incl. no-timer)
  **⇒ Rapid** (internally "long"). → **four independent buckets**:
  `standard-blitz`, `standard-long`, `c960-blitz`, `c960-long`
  (see `bucketKey` / `timeControlTag`).

### 5.2 Adaptive bot (the core loop)
In **Adaptive** mode (default) the bot's opponent rating is set to the player's
**current** rating for the active bucket. Therefore the expected score is always 0.5
and the update reduces to:

```
delta = round(K · (result − 0.5))      result ∈ {1 win, 0.5 draw, 0 loss}
```

With the base `K = 32`: **win +16, draw 0, loss −16**. Because the bot's *real*
playing strength rises monotonically with the rating (§5.3), the rating random-walks
until it settles where the player scores ~50% — so **wins and losses balance over
time** (draws neutral). This is the canonical property: *the bot keeps re-tuning
itself so the player wins and loses equally.*

**Provisional K** (faster early convergence): a bucket's first games use a larger K —
`gamesPlayed < 5 → 80`, `< 15 → 48`, else `32`. A new player therefore reaches their
true balance point in far fewer games, then settles into small, stable ±16 steps.

### 5.3 Strength model (`EloStore.strengthFromRating(elo)`)
Pure function mapping a rating to concrete engine controls
`{ skill, movetime, multipv, weakness, blunderProb, depthCap }`. Two regimes:

- **`elo ≥ 800` (engine regime):**
  - `skill = clamp(round((elo−800)/100), 0, 20)`
  - `movetime = clamp(round(100 + (elo−800)·0.6), 100, 1500)` ms
  - `multipv = elo≥2000 ? 1 : elo≥1400 ? 2 : 3`
  - `weakness = clamp((2000−elo)/1200, 0, 0.6)`
  - `blunderProb = 0`, `depthCap = 0`
- **`elo < 800` (beginner regime):**
  - `skill = 0`, `movetime = 80`, `multipv = 4`
  - `weakness = clamp(0.6 + (800−elo)/700·0.4, 0.6, 1)`
  - `blunderProb = elo<500 ? clamp((500−elo)/400·0.7, 0, 0.7) : 0`
  - `depthCap = elo<300 ? 1 : 0`

Representative values:

| elo | skill | movetime | multipv | weakness | blunderProb | depthCap |
|-----|-------|----------|---------|----------|-------------|----------|
| 100 | 0 | 80 | 4 | 1.00 | 0.70 | 1 |
| 300 | 0 | 80 | 4 | 0.89 | 0.35 | 0 |
| 500 | 0 | 80 | 4 | 0.77 | 0.00 | 0 |
| 800 | 0 | 100 | 3 | 0.60 | 0.00 | 0 |
| 1200 | 4 | 340 | 3 | 0.60 | 0.00 | 0 |
| 1600 | 8 | 580 | 2 | 0.33 | 0.00 | 0 |
| 2000 | 12 | 820 | 1 | 0.00 | 0.00 | 0 |
| 2800 | 20 | 1300 | 1 | 0.00 | 0.00 | 0 |

**How the controls are used** (see `BotEngine._selectMove`): the engine runs with
`MultiPV = multipv` so it reports its top-N candidate first-moves. Move choice:
1. If `blunderProb > 0` and `Math.random() < blunderProb`, play a **uniformly random
   legal move** (the only path that can go arbitrarily weak — this is how a true
   beginner can still reach 50%).
2. Otherwise sample among the MultiPV candidates biased by `weakness`:
   `r = clamp(floor(weakness · rand · N), 0, N−1)`; play candidate `r`
   (`weakness = 0` always yields the best move). This is more human than pure random.

Monotonic strength + a reachable weak floor is what guarantees a balance point exists
for every player.

### 5.4 Manual mode
The player fixes a Skill Level 0–20 (`multipv 1`, `weakness 0`, no blunder — pure
Stockfish at that skill). **Manual games are unrated** — they never change any bucket.
(Backlog: change manual to a target-Elo control routed through `strengthFromRating`.)

### 5.5 Progression tracking
Every **rated** (adaptive) game appends a history entry to its bucket:
`{ ts, gameNo, elo, delta, result }` — ISO timestamp, the bucket's cumulative game
number, the **post-game** rating, the delta, and the score. Capped at ~1000 entries
per bucket. This supports charting Elo over time or over the last N games; the
**Stats tab** to visualize it is a future feature (data is stored now, not shown).

### 5.6 Game flow
1. **Home / config card:** choose game type, time control, Adaptive/Manual (+ skill
   slider when Manual). `#cfg-note` states which rating the game affects, or
   "unrated". Prefs persist immediately on change.
2. **Play:** on **Play**, player color is randomized (`_playerColor`), the board
   orients to the player, and the bot initializes. If a game is already paused, an
   **in-app `#confirm-modal`** (not a system dialog) asks to confirm; confirming
   resigns the paused game first.
3. **During play:** optional clock; automatic draw detection (§5.8); no draw-offer
   button (the bot never agrees; real draws end the game on their own).
4. **Pre-moves:** while it's the bot's turn (thinking or about to move), the player
   may queue **one** move — tap own piece (source highlighted), tap target (both
   squares highlighted orange). It is played automatically the instant it becomes the
   player's turn **if still legal**, otherwise silently discarded. Tapping the source
   again, or an empty/enemy square, cancels it. Promotion pre-moves default to queen.
5. **Game end:** `#gameover-overlay` shows the result icon/title/subtitle and, for
   adaptive games, the Elo delta (`+N`/`−N`, or "No rating change" for a draw).
   Actions: **Rematch** (new game, identical settings, re-randomized color) and
   **Edit settings** (return Home).
6. **Leaving mid-game** via the back arrow keeps the game **paused** (auto-saved to
   `chess-v2:game`); resume it from the Home banner. Starting a new game while one is
   paused, or abandoning it, counts as a **resignation** (rating loss if adaptive —
   see `resignSavedGame`).

### 5.7 Clock behavior
- Presets in `TIMER_PRESETS`. `None` (0 s) disables the clock (`_clock = null`).
- The clock starts only after the first move is made (the very first mover's first
  move is "free"). After each move the mover's remaining time is decremented and the
  increment added, then the opponent's clock starts (`ChessClock.switch`).
- Flagging (`onFlag`) ends the game as `"flag"`, opponent wins on time.
- Bot think time is `strength.movetime` (scales with rating, ≤ 1500 ms), and when a
  clock is running it is additionally capped at `10% of remaining` so the bot never
  flags. This keeps Blitz fast (no flat multi-second thinks); see `getBestMove`.

### 5.8 Draw detection (`_checkGameOver`)
After each move, in order: no legal moves ⇒ checkmate/stalemate; then
- **50-move rule:** `_game.halfmove ≥ 100` (half-moves since last pawn move/capture),
- **Insufficient material:** K vs K, K + single minor vs K, or K+B vs K+B with both
  bishops on same-colored squares (`Chess.isInsufficientMaterial`),
- **Threefold repetition:** current `positionKey()` seen ≥ 3 times (tracked in
  `_posCounts`, rebuilt on resume).

All draws score 0.5. Real move counters are tracked by the engine and written into
the FEN sent to Stockfish.

### 5.9 Settings, history, data
- **Settings** (gear): theme toggle (`body.dark`), piece style (5; default
  `merida`), board color (6; default `classic`), per-bucket rating display + manual
  edit, a link to Game History, export/import save, and reset-all-data (double
  confirm; wipes every `chess`-prefixed key).
- **History:** newest-first list of finished games; tap to open the **replay** viewer
  (step through the game on a static board with first/prev/next/last controls).
- **Export/Import:** JSON payload of all `chess-v2:*` keys (see §8) — the backup for
  ratings and history. Import also accepts a legacy Markdown export's ```json block.

---

## 6. Module API reference

### 6.1 `chess.js` — rules engine

**Board representation:** a 64-length array. `index = row*8 + file`, where `row 0 =
rank 8` (top of the board) and `file 0 = a-file`. Pieces are single chars —
uppercase White (`KQRBNP`), lowercase Black; empty = `""`.

**Coordinate helpers (module-level):** `fileOf(i)`, `rowOf(i)`, `onBoard(f,r)`,
`toIdx(f,r)`, `nameToIdx(name)`, `idxToName(i)`, `colorOf(p)`, `isWhite`, `isBlack`.
Attack/offset tables: `KNIGHT_DELTAS`, `KING_DELTAS`, `ROOK_DIRS`, `BISHOP_DIRS`.
`START_FEN` is the standard start.

**Instance state** (after `load`): `board`, `turn` (`"w"|"b"`),
`castling {K,Q,k,q}` (booleans), `rookFile {K,Q,k,q}` (start file index of each
side's castling rook, or null), `chess960` (bool), `ep` (en-passant target index or
null), `halfmove`, `fullmove`.

**Move object** (produced by move generation): `{ from, to, piece, captured,
promotion?, double?, ep?, castle?, kingTo?, rookTo? }`. `from`/`to` are board indices;
`captured` is the captured piece char or null; `castle` is the side letter
(`K|Q|k|q`); for castles `kingTo`/`rookTo` are the final square indices and (in 960)
`to` is the rook's start square.

**API:**
- `new Chess(fen = START_FEN)` / `load(fen)` — parse a FEN (placement, turn,
  castling, ep, halfmove, fullmove). `_parseCastling(field)` handles both standard
  `KQkq` and Shredder-FEN file letters; sets `chess960` when file letters are used or
  the king is off the e-file.
- `pieceAt(name)` — piece char at a square name.
- `inCheck(color = turn)` — is that king attacked.
- `legalMoves()` — fully legal moves for the side to move (pseudo-moves filtered by
  king safety via `_apply`/`_undo`).
- `legalMovesFrom(name)` — legal moves originating at a square name.
- `move(spec)` — apply a legal move; `spec` is `{from, to, promotion?}` as names or
  indices. Returns the applied move object augmented with `san`, `fromName`,
  `toName`, or `null` if illegal.
- `static parseUci(uci)` — `"e2e4"` / `"e7e8q"` → `{from, to, promotion?}` (names).
- `toSAN(move)` — Standard Algebraic Notation (castles → `O-O` / `O-O-O`, with
  disambiguation and check/mate suffix).
- `fen()` — full FEN of the current position; castling written as `KQkq` or, for 960,
  Shredder-FEN file letters (accepted by Stockfish under `UCI_Chess960`). Includes
  halfmove/fullmove.
- `positionKey()` — FEN minus the move counters (placement + turn + castling + ep);
  the identity used for threefold repetition.
- `isInsufficientMaterial()` — see §5.8.
- `static random960Fen()` — a uniformly-drawn legal Chess960 start position as a
  Shredder-FEN (bishops on opposite colors; king between the rooks).

**Internal move gen:** `_pseudoMoves`, `_addPromos`, `_addCastles` (standard),
`_addCastles960` + `_canCastle960` (960: king-captures-rook encoding, arbitrary
king/rook files, full path-clearance and king-not-through-check checks), `_apply`
(returns an undo snapshot; updates board, castling rights via recorded rook files,
ep, halfmove/fullmove, turn), `_undo(snap)`, `_attacked(idx, byColor)`,
`_kingIdx(color)`.

### 6.2 `board.js` — `window.Board` (IIFE module)

Renders an 8×8 grid of `.square` cells plus absolutely-positioned `.piece` elements.
Each piece is `12.5% × 12.5%` and positioned with
`transform: translate(col·800%, row·800%)` (800% of 12.5% = one square). Orientation
is tracked internally (`"w"` = white at bottom).

**Piece sets:** image sets `IMG_SETS = [pixel, cburnett, merida, maestro]` (SVG
`<img>`), plus the inline `letters` style (letter text via `LETTER`). `_pieceInner`
picks image vs letters.

**API:** `buildBoard(container, orientation, onSquareTap)`,
`renderPieces(game, container, style)`, `animateMove(game, uci, style) → moveResult`
(handles capture removal, en-passant, promotion glyph swap, and castling — moving the
king and rook to their true final squares, incl. the 960 case where the king's target
is the rook's start square); highlight helpers `selectSquare`, `deselect`,
`clearHighlights`, `applyLastTint`, `markCheck`, `markWrong`, `markHints`,
`markPremove(from,to)`, `clearPremove`, `flashConfirm`, `shakeWrong`;
`samplePiece(style,color,type)` (settings previews); orientation/state
`setOrientation`, `getOrientation`, `getPieceEl`, `getLastMove`, `setLastMove`,
`clearPieces`, `whenPiecesReady`, `squarePos`. `buildBoard` resets the internal
`_lastMove` to null (so callers that flip must capture/re-apply the last move).

**Highlight classes:** `sq-sel`, `sq-legal`, `sq-legal-cap`, `sq-last`, `sq-check`,
`sq-wrong`, `sq-hint`, `sq-premove` (all cleared by `clearHighlights`).

### 6.3 `timer.js`

`TIMER_PRESETS` (index-addressed): `1+0, 2+1, 3+2, 5+0, 5+1, 5+5, 10+0, 15+10, 30+0,
None`. `None` has `seconds:0`. `NO_TIMER_IDX = TIMER_PRESETS.findIndex(seconds===0)`
(derived, so it stays correct if the list changes). ≤ 300 s presets are Blitz.

`ChessClock(initialSeconds, increment)` — drift-free via `Date.now()` snapshots.
Methods: `onTick(cb)` (cb(color, formatted, ms) — fired via rAF only when the
formatted string changes), `onFlag(cb)`, `remaining(color)`, `isExpired(color)`,
`start(color)`, `switch(movedColor)` (decrement mover, add increment, start
opponent), `pause()`, `reset()`. `static format(ms)` → `M:SS` (or `M:SS.d` under 10 s).

### 6.4 `elo.js`

Constants: `ELO_KEY = "chess-v2:elo"`, `DEFAULT_ELO = 1200`, `K_FACTOR = 32`,
`HISTORY_MAX = 1000`, `BUCKET_KEYS = [standard-blitz, standard-long, c960-blitz,
c960-long]`.

Helpers: `timeControlTag(baseSeconds)` → `"blitz" | "long"`;
`bucketKey(variant, baseSeconds)` → e.g. `"c960-blitz"`.

`EloStore` — loads `chess-v2:elo`, **migrating** the old flat `{elo, history}` schema
into `standard-long` (reconstructing each historical game's post-game rating by
walking deltas backward from the current rating). Bucket shape:
`{ elo, gamesPlayed, history:[…] }`.
- `elo(key)`, `bucket(key)`, `history(key)`, `all()`, `keys()`.
- `setElo(key, n)` — manual edit, clamps `[100, 3000]`.
- `updateAfterGame(key, result)` — provisional K by `gamesPlayed`
  (`<5→80, <15→48, else 32`); `delta = round(K·(result−0.5))`; clamp `[100,3000]`;
  increment `gamesPlayed`; push `{ts, gameNo, elo, delta, result}` (cap 1000); returns
  `{pre, post, delta}`.
- `static strengthFromRating(elo)` — see §5.3.
- `static movetimeFromSkill(level)` — 200/500/1000/2000 ms by skill band (manual mode).

### 6.5 `bot.js` — `BotEngine`

Wraps `stockfish.js` in a Web Worker. UCI flow:
`init → "uci" → (uciok) → _configure → "isready" → (readyok, resolves init)`;
`getBestMove → "position fen …" + "go …" → (bestmove, resolves)`.

- `init({ mode, elo, skill, variant })` — `mode` `"adaptive"|"manual"`; sets
  `_strength` from `strengthFromRating(elo)` (adaptive) or a fixed manual skill.
  Returns a Promise resolved on `readyok`.
- `_configure()` — `Threads 1`, `Hash 16`, `Skill Level`, `MultiPV`, and
  `UCI_Chess960 true` for 960.
- `getBestMove(fen, remainingMs = 0, legalUci = null)` — resets `_pv`, queues the
  request, sends `position fen` + `go`. `go` is `go depth <depthCap>` when a depth cap
  is set, else `go movetime <mt>` where `mt = strength.movetime`, capped at
  `10% of remaining` when a clock is running (floor 20 ms).
- `_onMsg(line)` — parses `info … multipv K … pv <move>` lines into `_pv[K-1]`; on
  `bestmove` treats `(none)` as null and resolves via `_selectMove`.
- `_selectMove(best, legalUci)` — blunder (random legal) with `blunderProb`, else
  MultiPV weighted pick by `weakness` (§5.3), fallback `best`.
- Getters `skillLevel`, `blunderProb`, `weakness`; `quit()` terminates the worker.

### 6.6 `home.js`

Keys: `PREFS_KEY = "chess-v2:prefs"`, `GAME_KEY = "chess-v2:game"`.
Constants: `BOARD_THEMES` (6, §4), `PIECE_STYLES` (5), `DEFAULT_PREFS =
{ theme:"dark", pieces:"merida", board:"classic", variant:"standard",
timerPreset:6 /* 10+0 */, difficulty:{mode:"adaptive", skill:8} }`. `RATING_GROUPS`
(Standard/Chess960 cards) and `RATING_EDIT_ROWS` (the four Settings rating rows).

Prefs: `loadPrefs`/`savePrefs`/`getPrefs`; validates saved piece/board ids.
Theming: `applyTheme` (`body.dark`), `applyBoardTheme` (`#app[data-board]`).
Navigation: `showScreen(id)`. Toast: `showToast(msg, ms)`.
Home rendering: `renderRatings`, `refreshHome` (ratings + resume banner + config
note), `_renderConfig` (segment/slider states + the "Rated · … / unrated" note).
Settings: `openSettings`, `_renderPieceStyleGrid`, `_renderBoardSwatches`,
`_renderRatingsEdit`. `_readSavedGame` reads `chess-v2:game`.
Bootstrap wires all buttons: Play (→ in-app confirm when a game is paused), resume
banner, gear, theme/piece/board pickers, rating edits, history/export/import/reset.

### 6.7 `play.js` — game controller

Keys/consts: `GAMES_KEY = "chess-v2:games"`, `GAMES_MAX = 500`.
Module state: `_game, _clock, _bot, _variant, _adaptive, _manualSkill, _bucketKey,
_startFen, _playerColor, _style, _timerPreset, _history (UCI[]), _posCounts,
_selectedSq, _waiting, _gameOver, _boardEl, _gen (per-game token), _preMove, _preSel`.

- `initPlay({ variant, resume })` — entry point from `home.js`. Fresh game: pick
  bucket + random color, `_newGame()`; or `_resumeGame()`.
- `_newGame()` / `_resumeGame()` — bump `_gen`, `_resetControls()` (reset the
  two-tap resign button + clear pre-move), build the position (960 → `random960Fen`),
  build/​render board, set up clock, init bot. Resume replays saved UCI history,
  rebuilds `_posCounts`, and restores the last-move highlight (king destination for
  960 castles).
- `_initBot()` — constructs `BotEngine`, `init` with adaptive elo or manual skill;
  on ready, if it's the bot's turn, `_doBotMove()`.
- `_doBotMove()` — captures `_gen`; requests a move with the current legal UCI list;
  on resolve (bailing if `_gen` changed) animates, records, switches clock,
  `_afterMove()`, then `_tryPreMove()`.
- `_tryPreMove()` — if a pre-move is queued and now legal, `_executeMove` it (queen
  promo default), else discard.
- `_onSquareTap(name)` — routes to normal move flow (player's turn, not `_waiting`)
  or `_onPreMoveTap(name)` (opponent's turn). Normal flow: select/deselect, legal
  target ⇒ move (with `_showPromoModal` when promoting).
- `_executeMove(from,to,promotion)` — animate, push UCI, clock start/switch, then
  `_afterMove()`; schedules `_doBotMove` (200 ms) if it becomes the bot's turn.
- `_afterMove()` — record position, update move list / turn labels / captured tray,
  save game, mark check, `_checkGameOver()`.
- `_checkGameOver()` / `_endGame(reason, winner)` — §5.8; `_endGame` clears pre-move,
  pauses clock, removes the saved game, fills the overlay, updates the bucket rating
  (adaptive only; neutral label on a draw), records the completed game, shows overlay.
- `resignSavedGame()` — resign a *paused* game without loading it (mirrors the Elo +
  history effects); used when starting a new game over a paused one.
- Support: `_setupTimer`, `_setupClockDisplay`, captured-tray helpers
  (`_capturedFor`/`_updateCaptured`), `_updateClockDisplay`, `_updateTurnLabels`,
  `_showPromoModal`, `_updateMoveList` (rebuilds SAN from `_startFen`), `_saveGame`.
- Button handlers: back (pause + `_gen++`), flip (preserve last-move highlight),
  resign (two-tap), rematch, edit-settings.

### 6.8 `history.js`

`_loadGames()` reads `chess-v2:games`. `_resultLabel(game)` → Win/Loss/Draw;
`_tcLabel(game)` prefers the stored `game.bucket` (falls back to the timer preset).
`openHistory()` renders the newest-first list (pluralized move counts, Elo delta,
"unrated" tag); each row opens `openReplay(game)`. Replay viewer state
(`_rpGame/_rpMoves/_rpStartFen/_rpIndex/_rpOrientation/_rpStyle`): `_renderReplay`
rebuilds the position from `startFen` + the first `_rpIndex` moves and tints the last
move (king destination for 960 castles); `_replayGoto(i)` clamps to
`[0, moves.length]`.

### 6.9 `export.js`

`downloadSave()` — writes `{ app:"chess", version:2, exported, data:{…all chess-v2:*} }`
as `chess-save-<date>.json`. `importSaveFromText(text)` — parses the JSON (or a
legacy Markdown ```json block), unwraps `{data}`, confirms, restores every
`chess`-prefixed key, and reloads.

### 6.10 `sw.js` — service worker

`CACHE = "chess-v17"` (bump on any cached-file change; older names in `OLD_CACHES`
are deleted on activate). `ASSETS` precaches: `./`, `index.html`, `styles.css`,
`manifest.json`, `icon.svg`, all JS modules, `stockfish.js`, and the four SVG piece
sets (`pixel`, `cburnett`, `merida`, `maestro`; 12 files each). Strategy:
**cache-first** for same-origin GETs, caching network responses on miss. The
`letters` piece style needs no assets (rendered inline).

---

## 7. Chess960 details

- **Encoding.** A 960 castle move is generated as **"king captures own rook"**: the
  move's `to` is the rook's start square, `kingTo`/`rookTo` carry the standard final
  squares (kingside → K g-file, R f-file; queenside → K c-file, R d-file). This
  exactly matches Stockfish's `UCI_Chess960` output (e.g. `e1h1` for O-O), so engine
  moves need **no translation**.
- **Detection.** `_parseCastling` marks a position `chess960` when the castling field
  uses Shredder file letters, or when the king is off the e-file. Standard games keep
  the classic path (rooks a/h, king e-file, `to` = g/c square) unchanged.
- **Verification.** Confirmed by JS self-play: this Stockfish build emits king-to-rook
  castling notation under `UCI_Chess960`, and the engine↔board round-trip is legal
  across long 960 games (including O-O and O-O-O from unusual files).

---

## 8. localStorage schema (`chess-v2:` namespace)

| Key | Shape |
|-----|-------|
| `chess-v2:elo` | `{ "standard-blitz": B, "standard-long": B, "c960-blitz": B, "c960-long": B }`, `B = { elo:Number, gamesPlayed:Number, history:[{ ts:ISO, gameNo:Number, elo:Number, delta:Number, result:0\|0.5\|1 }] }`. Migrated from the old flat `{elo, history}` into `standard-long`. |
| `chess-v2:prefs` | `{ theme:"light"\|"dark", pieces, board, variant:"standard"\|"c960", timerPreset:Number, difficulty:{ mode:"adaptive"\|"manual", skill:0–20 } }` |
| `chess-v2:game` | Paused game (deleted on game end): `{ variant, adaptive:Bool, manualSkill, bucketKey, startFen:String\|null, playerColor:"w"\|"b", timerPreset, history:[uci], timerState:{w,b}\|null }` |
| `chess-v2:games` | Completed games, ≤ 500, newest-last: `[{ date:ISO, variant, bucket, adaptive:Bool, playerColor, result, winner:"w"\|"b"\|null, moves:[uci], startFen:String\|null, timerPreset, eloDelta:Number\|null }]`. `result ∈ {checkmate, stalemate, flag, resign, draw-50, draw-material, draw-threefold}`. |

Reset-all-data wipes every key beginning with `chess` (also clears any legacy keys).

---

## 9. Control flow — life of a move

**Player move:** tap source → `_onSquareTap` selects (highlights legal targets) → tap
target → `_executeMove` → `Board.animateMove` (mutates `_game`, animates) → push UCI,
clock start/switch → `_afterMove` (move list, captured tray, save, check,
`_checkGameOver`) → if game continues and it's the bot's turn, `setTimeout(_doBotMove,
200)`.

**Bot move:** `_doBotMove` captures `_gen`, gathers legal UCI, calls
`BotEngine.getBestMove(fen, remainingMs, legalUci)` → engine returns `bestmove` (+
MultiPV `info`) → `_selectMove` applies weakness/blunder → Promise resolves → (bail if
`_gen` changed) `Board.animateMove` → push UCI, switch clock → `_afterMove` →
`_tryPreMove` (auto-play a queued pre-move if legal).

---

## 10. Testing & verification

No automated tests. Verify via the browser preview (`web-apps-home`, port 3000,
`/apps/chess/`) and, for pure engine logic, JavaScriptCore
(`osascript -l JavaScript`, loading `chess.js`/`elo.js` with `window.` rewritten to a
plain object). Key checks: adaptive rating trends to ~50% and provisional-K moves the
rating faster early; `strengthFromRating` is monotonic; MultiPV `info` lines are
parsed on this build; pre-moves auto-play/discard/cancel; 960 self-play stays legal;
draw/checkmate/flag detection; theme toggle + board themes; no console errors, no
404s; SW cache bumped.

---

## 11. Backlog (future)

1. **Stats tab** — visualize per-bucket progression history: Elo over time (e.g. last
   year) and over the last N games, plus win/loss/draw breakdowns. Data already
   recorded in `chess-v2:elo` bucket histories.
2. **Manual difficulty → Elo** — manual mode currently sets the Stockfish Skill Level
   (0–20) directly; change it to a target-**Elo** control routed through
   `strengthFromRating` (fixed strength, still unrated) so it lines up with the
   adaptive rating scale.

---

## 12. Resolved / changelog

- **2026-07-06 — rebuild.** Reduced from a 3-mode suite (trainer/pass-and-play/bot)
  to a single-purpose play-vs-bot app; added Standard + Chess960, four rating
  buckets, the adaptive self-tuning loop, progression history, Semafor restyle with a
  light/dark toggle, game history + replay, and JSON export/import. Removed
  `srs.js`, `trainer.js`, `library.js`, `openings.js`, `opening-detect.js`,
  `script.js`.
- **2026-07-06 — fixes & features.** Implemented backlog items: pre-moves; MultiPV
  weighted weak play with a residual random-move floor; provisional-K faster
  convergence + recalibrated `strengthFromRating`. Added: Merida-knight-on-black
  icon; in-app new-game confirm dialog; dead-space layout fix; `5+1`/`5+5` time
  controls. Fixed the full 8-item known-bugs audit: slow convergence (provisional K),
  resign-confirm leak (reset in `_newGame`), stale bot-move callback (`_gen` guard),
  `bestmove (none)` parsing, flip last-move highlight, 960 castle highlight in
  resume/replay, adaptive-draw Elo label, and history/resume-banner pluralization.
- **2026-07-07 — polish batch (backlog #3–8).** Captured-pieces tray now renders with
  the selected piece style (was hardcoded Unicode + CSS recolor); bot think time
  scaled to the clock so Blitz is fast (no flat 3 s/move); defaults changed to **dark**
  theme + **Merida** pieces; piece styles trimmed to 5 (removed shaded/modern/classic/
  flat + their assets); board themes Coffee/Slate replaced with **Rose**/**Amethyst**;
  removed the superseded standalone `apps/chess-openings/` app (index.json + README).

# Chess — Design & Architecture

A single-purpose, fully offline PWA for **playing chess against a self-tuning bot**.
No backend, no build step, no frameworks — plain HTML/CSS/JS, all state in
`localStorage`. Mobile-first; primary target is iOS Safari.

## Intended operation

### Modes & ratings
- The **only** activity is human-vs-bot. There is no trainer, pass-and-play, or
  opening library.
- Two game types: **Standard** and **Chess960** (authentic Fischer-random,
  including castling).
- Each game type keeps a **separate Elo rating per time control**: a base time of
  **≤ 5 minutes** per side is *Blitz*; anything longer, including no-timer games,
  is *Rapid* (a.k.a. "long"). That yields **four independent rating buckets**:
  `standard-blitz`, `standard-long`, `c960-blitz`, `c960-long`.

### Self-tuning bot (adaptive difficulty)
- In **Adaptive** mode (default) the bot is tuned to the player's *current* rating
  for the active bucket. Because the opponent's strength always equals the
  player's own rating, the expected score is 0.5 every game and the update is
  `delta = round(K · (result − 0.5))` with `K = 32` → **win +16, draw 0, loss −16**.
- Since the bot's real playing strength rises monotonically with the rating (see
  the strength model), the rating settles wherever the player scores ~50%, so
  **wins and losses balance over time** (draws neutral). This is the canonical
  behavior: *the bot keeps re-tuning itself so the player wins and loses equally.*
- **Weak play** is produced by two layers (`EloStore.strengthFromRating` +
  `BotEngine`): the engine runs with **MultiPV** so it reports its top *N* moves,
  and a `weakness` factor biases the actual choice toward the weaker candidates
  (0 = always the best move; higher as the rating drops). This looks more human
  than pure random play. To reach true beginners — **weaker than Stockfish's
  lowest Skill Level (0)** — a small residual **random-move** probability kicks in
  only at the very bottom (below ~500 rating), plus a shallow depth cap at the
  extreme low end. This keeps arbitrarily-weak play reachable so the balance point
  exists for everyone.
- **Provisional rating.** A bucket's first games use a larger K-factor (80 for the
  first 5 games, 48 up to 15, then the base 32) so a new player reaches their true
  balance point in far fewer games before settling into small, stable adjustments.
- **Manual** mode lets the player fix a Skill Level (0–20). Manual games are
  **unrated** — they never change any bucket's Elo.

### Progression tracking
- Every **rated** game appends a history entry to its bucket:
  `{ ts, gameNo, elo, delta, result }` — an ISO timestamp, the bucket's cumulative
  game number, and the **post-game** rating. This supports charting Elo over time
  or over the last N games. Kept ~1000 entries/bucket. Visualizing this is a
  **future feature** (see Backlog: Stats tab) — the data is stored now, not shown.

### Game flow
1. On **Home**, configure the game up front: game type, time control, and
   Adaptive/Manual. A note shows which rating the game will affect (or "unrated").
2. **Play**. Player colour is randomized each game; the board orients to the
   player. Optional clock; draws are detected automatically (below). No draw-offer
   button — the bot never agrees to a draw, and real draws end the game on their own.
3. At game end an overlay shows the result and (adaptive only) the Elo delta, with
   two actions: **Rematch** (new game, identical settings) and **Edit settings**
   (return Home to change settings for the next game).
- **Pre-moves.** While it's the bot's turn (thinking or about to move), the player
  may queue one move (tap piece → target); it is highlighted, then played
  automatically the instant it becomes their turn if still legal, otherwise
  discarded. Tapping the source again, or an empty/enemy square, cancels it.
- Leaving mid-game via the back arrow keeps the game **paused** (resume from the
  Home banner). Starting a *new* game while one is paused prompts an **in-app
  confirm dialog** (not a system dialog) and, if confirmed, counts the paused game
  as a **resignation** (rating loss if it was adaptive).

### Draw detection
Games end in a draw on **stalemate**, **threefold repetition** (position identity =
FEN placement + side to move + castling + en passant), the **50-move rule**
(`halfmove ≥ 100`), or **insufficient material** (K vs K, K+minor vs K, K+B vs K+B
with same-coloured bishops). The move counters that back these are tracked by the
engine and written into the FEN sent to Stockfish.

### Settings, history, data
- **Settings** (gear): light/dark theme toggle, piece style (9; CBurnett default),
  board colour (6; beige/brown "Classic" default), per-bucket rating display +
  manual edit, a link to Game History, export/import save, and reset-all-data.
- **Game History**: every finished game is recorded to `chess-v2:games` (start FEN
  + UCI moves + result + bucket + Elo delta) and listed newest-first; tap to open a
  **replay** viewer (step through the game on a board).
- **Export/Import**: dumps/restores all `chess-v2:*` keys as JSON (ratings, history,
  prefs, paused game). This is the backup for your ratings.

### Design language
- Warm-beige **Semafor**-inspired editorial look: cream background, Georgia serif
  headings, system sans body, warm-brown accents — consistent with the rest of the
  store (landing page, `posts`, `chess-openings`).
- A **manual light/dark toggle** is offered. This is an *intentional exception* to
  the project's "single fixed theme" rule: it never reads `prefers-color-scheme`
  (no system detection); the default is a fixed light theme and the user switches
  manually.

## Architecture

Plain `<script>` files loaded in order by `index.html`:

- **`chess.js`** — `Chess` rules engine (`window.Chess`): board array, legal-move
  generation (incl. **Chess960 castling**), SAN, `fen()` serializer (standard KQkq
  or Shredder-FEN for 960), `positionKey()` (repetition), `isInsufficientMaterial()`,
  and `Chess.random960Fen()` (random legal 960 start).
- **`board.js`** — `window.Board`: renders the 8×8 grid + absolutely-positioned
  piece elements, animates moves (incl. 960 castling via engine-provided
  king/rook targets), highlights, captured-piece glyphs, sample pieces for settings.
- **`elo.js`** — `EloStore` (four buckets, migration from the old flat schema into
  `standard-long`, adaptive update, progression history) and the static
  `strengthFromRating(elo) → { skill, movetime, blunderProb, depthCap }` strength
  model. Helpers `bucketKey(variant, baseSeconds)` and `timeControlTag(seconds)`.
- **`timer.js`** — `ChessClock` (drift-free via `Date.now()`) and `TIMER_PRESETS`.
- **`bot.js`** — `BotEngine`: Stockfish Web Worker (pure-JS `stockfish.js`, no WASM).
  Configures Skill Level (+ `UCI_Chess960` for 960), applies movetime/depth, and
  performs blunder injection (random legal move at `blunderProb`).
- **`home.js`** — prefs, navigation, ratings display, the pre-game config card, and
  the Settings panel. Applies theme (`body.dark`) and board theme (`[data-board]`).
- **`play.js`** — the game controller: move flow, clock, persistence, draw
  detection, per-bucket Elo update, game-over overlay + Rematch/Edit.
- **`history.js`** — Game History list + replay viewer.
- **`export.js`** — JSON save export/import.
- **`sw.js`** — cache-first service worker; bump `CACHE` when any cached file changes.

### Chess960 castling (the tricky part)
- Castling is encoded internally as **"king captures own rook"** — the castle move's
  `to` is the rook's start square. This matches Stockfish's `UCI_Chess960` output
  (e.g. `e1h1`), so engine moves need **no translation**. Final squares are the
  standard ones (kingside → K g-file / R f-file; queenside → K c-file / R d-file).
- Standard games keep the classic path unchanged (king on e-file, rooks a/h,
  `to` = g/c square). The engine distinguishes 960 via the FEN castling field
  (Shredder file letters, or a king off the e-file).
- The board animates the king and rook to their true final squares (handling the
  case where the king's destination is the rook's start square, and vice-versa).

## localStorage keys (`chess-v2:` namespace)

| Key | Shape |
|-----|-------|
| `chess-v2:elo` | `{ "standard-blitz": B, "standard-long": B, "c960-blitz": B, "c960-long": B }` where `B = { elo, gamesPlayed, history:[{ts,gameNo,elo,delta,result}] }`. Migrated from the old flat `{elo,history}` into `standard-long`. |
| `chess-v2:prefs` | `{ theme, pieces, board, variant, timerPreset, difficulty:{mode,skill} }` |
| `chess-v2:game` | Paused game: `{ variant, adaptive, manualSkill, bucketKey, startFen, playerColor, timerPreset, history:[uci], timerState }` |
| `chess-v2:games` | `[{ date, variant, bucket, adaptive, playerColor, result, winner, moves:[uci], startFen, timerPreset, eloDelta }]`, ≤500, newest-last |

## Backlog (future)

1. **Stats tab** — visualize the per-bucket progression history: Elo over time
   (e.g. last year) and over the last N games, plus win/loss/draw breakdowns.
   Data is already recorded in `chess-v2:elo` bucket histories.
2. **Manual difficulty → Elo** — manual mode currently sets the Stockfish Skill
   Level (0–20) directly; change it to a target-**Elo** control routed through
   `strengthFromRating` (fixed strength, still unrated) so it lines up with the
   adaptive rating scale.

## Resolved

- **Backlog implemented** (see Intended operation): pre-moves vs bot; MultiPV
  weighted weak play with a residual random-move floor; provisional-K faster
  convergence + recalibrated `strengthFromRating`.
- **Known-bugs audit 2026-07-06** — all 8 items fixed: slow convergence
  (provisional K), resign-confirm leak (reset in `_newGame`), stale bot-move
  callback (`_gen` guard), `bestmove (none)` parsing, flip last-move highlight,
  960 castle highlight in resume/replay, adaptive-draw Elo label, history
  pluralization.

# Chess App — Design & Operations Reference

A living document describing the intended behavior, architecture, and design of the unified chess app. Update this file whenever a feature changes significantly.

---

## Overview

A fully self-contained PWA for chess training and play. No backend, no npm, no frameworks — plain HTML, CSS, and JavaScript only. All data lives in `localStorage`. Works offline via a service worker.

**Primary target:** iPhone / iOS Safari  
**Layout:** Mobile-first, max 520 px wide, centered  
**Theme:** Fixed dark retro pixel-art aesthetic — no system dark-mode switching

The app consolidates three separate activities into one:
- **Opening Trainer** — spaced-repetition drilling of chess openings
- **Pass & Play** — two humans on one screen
- **vs Bot** — play against Stockfish at calibrated difficulty

It shares its spaced-repetition progress (the `chess-openings-trainer:v2` localStorage key) with the older standalone `apps/chess-openings/` app, which still exists separately (its removal is tracked as Known Issue #1).

---

## Architecture & File Map

Everything is plain `<script>` files loaded in dependency order by `index.html`; there is no module system, bundler, or build step. Modules communicate through globals hung on `window`. There is exactly one HTML page; "screens" are sibling `<div class="screen">` blocks toggled by `showScreen(id)`.

### Source files (load order matters — later files depend on earlier globals)

| # | File | Lines | Responsibility | Key globals it defines |
|---|------|------:|----------------|------------------------|
| 1 | `chess.js` | ~335 | Self-contained rules engine (move gen, legality, SAN, FEN load) | `Chess`, `idxToName`, `nameToIdx` |
| 2 | `openings.js` | ~425 | Opening dataset (32 entries) | `OPENINGS` |
| 3 | `srs.js` | ~347 | Position graph + SM-2 spaced repetition `Store` | `Store`, `POSITIONS`, `POSITION_BY_KEY`, `OPENING_CARDS`, `OPENING_LINE`, `srsTodayStr` |
| 4 | `board.js` | ~287 | Board rendering, piece styles, animation, highlights | `Board`, `IMG_SETS` |
| 5 | `elo.js` | ~74 | `EloStore` rating + skill/movetime tables | `EloStore`, `SKILL_ELO` |
| 6 | `timer.js` | ~135 | `ChessClock` + timer presets | `ChessClock`, `TIMER_PRESETS`, `NO_TIMER_IDX` |
| 7 | `bot.js` | ~105 | `BotEngine` — Stockfish Web Worker UCI wrapper | `BotEngine` |
| 8 | `opening-detect.js` | ~35 | Detect opening name(s) from a UCI move list | `detectOpening` |
| 9 | `export.js` | ~134 | Markdown export + save-file import | `downloadMarkdown`, `importProgressFromText` |
| 10 | `home.js` | ~299 | App bootstrap, navigation, prefs, settings, home UI | `showScreen`, `showToast`, `getStore`, `getEloStore`, `getPrefs`, `savePrefs`, `refreshHome`, `GAME_KEY`, `BOARD_THEMES`, `PIECE_STYLES` |
| 11 | `play.js` | ~543 | Play screen (PvP + bot): move flow, clock, persistence, game-over, completed-game history | `initPlay`, `fenFromGame` |
| 12 | `trainer.js` | ~445 | Trainer dashboard + drill flow + practice/browse screen | `initTrainer`, `initPractice` |
| 13 | `library.js` | ~65 | Read-only opening reference screen | `initLibrary` |
| — | `stockfish.js` | — | Vendored **Stockfish.js 18** (chess.com fork, GPLv3), pure-JS, **~10.5 MB**. Loaded as a Web Worker by `bot.js`, never via a `<script>` tag. | — |
| — | `sw.js` | ~92 | Service worker (cache-first precache) | — |

**Bootstrap:** `home.js`'s `DOMContentLoaded` handler runs `loadPrefs()`, constructs `new Store()` and `new EloStore()`, applies the board theme, calls `refreshHome()`, and wires every home/settings event listener. `play.js`, `trainer.js`, and `library.js` add their own `DOMContentLoaded` listeners for their screens' buttons and expose `initX()` entry points called on navigation.

**Dead code:** `script.js` (~193 lines) is the old standalone pass-and-play controller; it is **not** referenced by `index.html` and not precached — orphaned (tracked as Known Issue #39).

### Global `window` API surface (the cross-module contract)
- **Engine/board:** `Chess`, `idxToName`, `nameToIdx`, `Board`, `IMG_SETS`
- **Data/graph:** `OPENINGS`, `POSITIONS`, `POSITION_BY_KEY`, `OPENING_CARDS`, `OPENING_LINE`, `Store`, `srsTodayStr`, `detectOpening`
- **Play/engine:** `EloStore`, `SKILL_ELO`, `ChessClock`, `TIMER_PRESETS`, `NO_TIMER_IDX`, `BotEngine`, `initPlay`, `fenFromGame`
- **Trainer/library:** `initTrainer`, `initPractice`, `initLibrary`
- **App services (home.js):** `showScreen`, `showToast`, `getStore`, `getEloStore`, `getPrefs`, `savePrefs`, `refreshHome`, `GAME_KEY`, `BOARD_THEMES`, `PIECE_STYLES`
- **Import/export:** `downloadMarkdown`, `importProgressFromText`

---

## Screens & Navigation

All screens are `<div class="screen">` elements that toggle `.active`. Navigation is driven by `showScreen(id)` calls; there is no URL routing.

```
Home
 ├── Settings panel (overlay)
 ├── Trainer screen
 │    ├── Drill screen       ← active during a session
 │    └── Practice/Browse screen
 ├── Play screen             ← shared by Pass & Play and vs Bot
 ├── Library screen
 └── Resume banner           ← visible on Home when a game is paused
```

### Home screen
Shows the user's current Elo rating, daily streak, total XP, and reviews count. Four mode tiles launch each mode. A resume banner appears if a Pass & Play or Bot game is saved mid-game. Bot difficulty and timer preset are configured here before starting a bot game.

### Settings panel
A full-screen overlay (`#settings-panel`, `position: fixed; inset: 0`) opened from the ⚙ button (`openSettings()`); closed with its own ← button. Controls:
- Manual Elo override (100–3000), edited via an inline Edit → input → Save/Cancel flow
- Piece style (9 options) — grid of preview tiles
- Board color theme (6 options) — colour swatches
- Export Progress (Markdown) and Import Save File buttons

### Trainer screen
Entry point for SRS learning. Shows per-opening progress across four tiers. Buttons: Daily Session, Review Weakest, Browse Openings.

### Drill screen
Active during a training session. Shows a progress indicator (dots), the current opening name, whose turn it is, and the interactive board. After each correct move an overlay confirms the result and awards XP.

### Practice / Browse screen
Filterable list of all openings (by tier and side). Each row shows the opening name, strategic idea, learned positions, mastery %, and accuracy %. Tapping "Drill" starts a targeted session for that opening.

### Play screen
Shared by Pass & Play and vs Bot. Shows both player clocks, a scrollable move list in algebraic notation, and an opening-name hint once a known position is reached. Action buttons: Resign, Draw, New Game.

**Board feedback (canonical):**
- **Last move is highlighted.** After every move the from and to squares are tinted and outlined with a per-board accent colour (`.sq-last` + `--last-edge`, set per board theme so it stays legible on each), so the move just played is immediately visible.
- **Resign requires confirmation.** Tapping Resign once shows "Sure?"; only a second tap within ~5 s resigns — a single mis-tap won't forfeit. (Draw uses the same two-tap pattern in Pass & Play; the Draw button is hidden vs the bot.)
- Coordinate labels (file letters on the bottom rank, rank numbers on the left file) are rendered light with a dark halo so they read on any square colour.

### Library screen
Read-only browser. Every opening's full move sequence with annotations is visible here. Locked openings (tier not yet unlocked) show a notice but can still be read.

---

## Features — Correct Operation

### Trainer Mode (SRS)

The trainer uses **SM-2 spaced repetition** applied at the position level, not the opening level.

**Position-graph architecture**  
Each opening's mainline is walked move by move. Every position where it is the learner's turn to move becomes a "card." If two openings reach the same board position via different move orders (transpositions), they share one card — the learner is never penalised for playing a move that is valid in any of the openings that pass through that position.

**SM-2 scheduling**  
Each card tracks: ease factor (starts 2.5), interval (days until next review), rep count, due date, total attempts, and correct attempts. After each answer the interval and ease are updated by the standard SM-2 formula. A card is considered "mastered" once its interval reaches 21 days.

**Quality grading** (based on first-attempt mistakes in a session):  
- 5 — Perfect (0 mistakes)  
- 4 — Good (1 mistake / hint)  
- 3 — Okay (2 mistakes)  
- 2 — Poor (3+ mistakes)

**Tier system**  
Openings are grouped into four tiers by popularity and complexity:  
- Tier 1 (Core): always unlocked  
- Tier 2 (Club): unlocks at ≥ 50% average mastery of Tier 1  
- Tier 3 (Specialised): unlocks at ≥ 50% Tier 2  
- Tier 4 (Rare): unlocks at ≥ 50% Tier 3

**Session building** (`buildSession`)  
Up to 12 items per session: overdue cards (oldest first) + up to 4 new positions + weakest-mastered cards as fill. "Daily Session" mixes due and new; "Review Weakest" targets only the lowest-mastery cards.

**Metrics displayed per opening** (trainer card, built by `_buildOpeningCard` in `trainer.js`)  
Each opening card shows, in order: the **opening name**; a sub-line of **mastery word-label · side chip (W/B) · `learned/total moves`**; an optional **`N% correct`** tag (accuracy, shown only once attempts exist); and a circular **mastery ring** displaying the mastery %.
- *Mastery %* — average SM-2 progress across every learner-turn position in that opening. 0 % = never touched; 100 % = all positions have interval ≥ 21 days. Rendered both as the ring number and as a plain-language label via `_masteryLabel(pct)`: **New** (0), **Learning** (1–39), **Familiar** (40–79), **Strong** (80–99), **Mastered** (100). The exact thresholds are part of the contract — a regression is any drift from these boundaries.
- *Accuracy* — (first-attempt correct answers) ÷ (total attempts) × 100 for positions belonging to that opening, labelled "% correct".
- *Learned count* — positions where at least one correct answer has been recorded, out of the total positions in the opening; shown as `learned/total moves`.
- *ECO codes are intentionally NOT shown on trainer cards* (they are jargon — e.g. "B18" = Caro-Kann Classical). ECO codes remain visible in the **Library** screen, which is the reference view. Re-adding ECO to trainer cards would be a regression of issue #4.
- A one-line **legend** appears once at the top of the opening list (prepended in `_buildTierSections`) explaining what the ring means. Its absence is a regression.

**XP**  
Base 5 XP per card reviewed. Bonuses: +5 for perfect, +2 for good, +1–4 for rarer tiers. Streak increments once per calendar day with any review activity and resets if a day is skipped.

**Drill hint behavior** (issue #7 — implemented in `_attemptDrillMove` in `trainer.js`, using `Board.markHints` in `board.js`)  
While drilling a card, each incorrect attempt increments `_drillMistakes` and sets the move-note to "Try again". **On the 3rd incorrect attempt — and every incorrect attempt thereafter — the app highlights the pieces that can play a correct/book move:** it collects the unique from-squares (`uci.slice(0,2)`) of every key in the current position's `node.responses` map and calls `Board.markHints(froms)`, which adds the `.sq-hint` class (background `--hint-bg`, the phosphor-green tint) to those squares; the move-note changes to **"Hint: move a highlighted piece"**. Only squares with a real book response are highlighted — squares the learner happened to move to are not. Hints are cleared automatically by `clearHighlights()` on the learner's next `selectSquare`/`deselect`, and re-applied after each subsequent wrong try. Expected: the hint must NOT appear before the 3rd mistake, and the highlighted set must equal the distinct from-squares of `node.responses`.

---

### Pass & Play Mode

Two human players take turns on one device. Full chess rules are enforced (castling, en passant, promotion, check, checkmate, stalemate). An optional chess clock can be set before starting; both sides share the same preset. The game is saved to `localStorage` after each move and can be resumed from the Home screen.

---

### vs Bot Mode

Stockfish.js 18 runs as a pure-JavaScript Web Worker (no WASM, no SharedArrayBuffer) so it works on standard static hosting and iOS Safari. Communication is via the UCI protocol: `position fen … go movetime …` → `bestmove …`.

**Game rules (bot mode)** — canonical intended behavior:
- **Random colour each game.** Starting a vs-Bot game assigns the player White or Black at random (`Math.random()` in the `tile-bot` handler, `home.js`). When the player is Black the board is oriented Black-at-bottom and the bot (White) makes the opening move.
- **No draw offer against the bot.** The Draw action is hidden in bot mode (`btn-draw.hidden = (_mode === "bot")`, set in `initPlay`); the engine never "agrees" to a draw, so the only results vs the bot are checkmate, stalemate, flag, or resignation.
- **Starting a new game mid-game is a resignation.** Tapping **New** while a bot game is in progress (`_mode === "bot" && !_gameOver && _history.length > 0`) calls `_endGame("resign", <bot colour>)` **before** the new game starts — recording a loss in both the Elo rating and the completed-game history (`chess-v2:games`). (This applies only to the in-game New button; the back button keeps the game saved for resume, and "Play Again" only appears after the game has already ended.)

**Difficulty**  
Stockfish exposes a Skill Level setting (0–20). Two modes:  
- *Auto* — skill level is derived from the user's current Elo rating using a linear mapping (Skill 0 ≈ 200 Elo, Skill 10 ≈ 1200 Elo, Skill 20 ≈ 2700 Elo).  
- *Manual* — a fixed skill level set by the user, regardless of Elo.

**Movetime** (when no clock is active):  
- Skill 0–5: 200 ms  
- Skill 6–10: 500 ms  
- Skill 11–15: 1000 ms  
- Skill 16–20: 2000 ms

When a chess clock is active the engine is given 5% of the engine's remaining time, capped at 3000 ms.

**Elo rating**  
K-factor 32, standard Elo formula. After each bot game the user's rating is updated and stored. The last 50 games are kept as history. Elo can be manually edited from Settings at any time.

---

### Opening Library

A read-only reference for all openings in the database. Each entry shows the opening name, ECO code, which side plays it, its tier, the strategic idea, the full mainline move sequence with annotations, and the user's current mastery and accuracy stats. Openings from locked tiers display a notice but are still readable.

---

## Piece Styles & Board Themes

### Piece styles (9)
| ID | Name | Description |
|----|------|-------------|
| `pixel` | Pixel | Lichess pixel set — blocky, retro |
| `shaded` | Shaded | Pixel-art Staunton with 3D shading (PNG) |
| `flat` | Flat | Bold flat pixel-art silhouettes (PNG) |
| `cburnett` | CBurnett | Colorful hand-drawn (default Lichess style) |
| `merida` | Merida | Ornate serif Staunton |
| `maestro` | Maestro | Geometric modern |
| `modern` | Modern | Contemporary outlined |
| `classic` | Classic | Traditional Staunton |
| `letters` | Letters | Plain letters only (K/Q/R/B/N/P) |

Image-based sets live at `./pieces/[style]/[wb][PIECE].(svg|png)`. The original four image sets (`pixel`, `cburnett`, `merida`, `maestro`) are SVG; the two newer sets (`shaded`, `flat`) are PNG — listed in `PNG_SETS` in `board.js`, which selects the `.png` extension. `classic`/`letters` are glyph/text (no files); `modern` is inline SVG.

### Board color themes (6)
| ID | Name | Light square | Dark square |
|----|------|-------------|------------|
| `dungeon` | Mono (default) | #3a3a3a | #1c1c1c |
| `amber` | Amber | #6a4420 | #3a2010 |
| `walnut` | Walnut | #d9b97a | #8b5e38 |
| `forest` | Forest | #d9e8c0 | #5a7a3a |
| `ocean` | Ocean | #b8d8e8 | #3a5a78 |
| `slate` | Slate | #b8b8c8 | #5a5a6a |

The `dungeon` id is retained (so saved prefs keep working) but is now a neutral grayscale "Mono" theme; the other five remain color options. The swatch colors in `BOARD_THEMES` (`home.js`) must stay in sync with the `[data-board="…"]` CSS tokens — a mismatch (e.g. a green swatch over a gray board) is a regression.

### Current global color tokens (`styles.css`) — monochrome
- Background: `#0a0a0a`, Surface: `#161616` (neutral grays, no green tint)
- Text: `#e6e6e6`, Dim: `#9a9a9a`, Faint: `#555`
- Accent (`--gold*`, `--sel`): white/grey (`#e8e8e8` / `#ffffff`)
- Board glow (`--phosphor`): `#e8e8e8` (monochrome)
- Pieces: white `#ececec` (edge `#444`), black `#181818` (edge `#8a8a8a`, a light outline for legibility on dark squares)
- **Functional reds are intentionally kept** (not chrome): `--chk-bg`/`--wrong-bg` (check / wrong-move), the low-time clock blink (`#e03030`), and win/loss `elo-delta` colors. Re-introducing amber/green into the UI chrome would be a regression of issue #10.

---

## Data & Persistence

All persistence is `localStorage` only. No server, no sync, no account.

| Key | Contents |
|-----|---------|
| `chess-openings-trainer:v2` | SRS cards, XP, streak, review count |
| `chess-v2:elo` | Elo rating, last 50 game results |
| `chess-v2:prefs` | Piece style, board theme, timer preset, bot difficulty |
| `chess-v2:game` | In-progress game (mode, color, move history, clock state) |
| `chess-v2:games` | **Completed-game history** — array of finished games (all modes), newest-last, capped at the last 100 |

**Completed-game history** (`chess-v2:games`, written by `_recordGame` in `play.js`, hooked from `_endGame`) — every finished game in **every** mode appends one record. Schema (the contract for the future Game Browser): `{ date (ISO), mode ("bot"|"pvp"), playerColor, result (checkmate|stalemate|flag|resign|draw), winner ("w"|"b"|null), moves (UCI string array), opening (detected name(s)), timerPreset, eloDelta (number for bot+auto games, else null) }`. Capped to the most recent 100 games.

**Export** — the Export button downloads a Markdown file containing Elo history, trainer stats, per-opening progress, settings, and a raw-JSON appendix of **every** `chess*` localStorage key (so the game history above is part of the save file). Filename: `chess-progress-YYYY-MM-DD.md`.

**Import / restore** (`importProgressFromText` in `export.js`, wired to the "Import Save File" button in Settings) — accepts a previously exported `.md` (its ```json appendix is extracted) **or** a raw `.json`. It validates the parsed object contains ≥1 key starting with `chess`, asks for confirmation (the action overwrites all local progress), restores every `chess*` key to localStorage, then reloads so all stores re-initialise. Invalid files are rejected with a toast and no change. Export → Import is a lossless round-trip of all four/five keys above.

**Service worker** — cache-first strategy; all HTML/CSS/JS/SVG/PNG assets cached on install under the current key (`chess-v9`), **including `stockfish.js`** so the vs-Bot mode works fully offline. Older caches (`chess-v1`…`chess-v8`) are cleaned up on activation. Bump the cache version whenever cached assets change, or returning users keep the stale copy. (Exact per-key shapes are tabulated under "localStorage — exact shapes" below.)

---

## Intended Design Language

- **Aesthetic:** Dark retro pixel-art. Feels like a CRT terminal or an old LCD game.
- **Theme:** Always dark; light mode is never shown regardless of system setting.
- **Typography:** Monospace or small-caps labels; uppercase headings; no decorative fonts.
- **Spacing:** Compact. Tap targets ≥ 44 px. No horizontal scroll.
- **Animations:** Piece slides via CSS `transform: translate`. Subtle, fast (150–200 ms).
- **Colors:** Monochrome — neutral grays + white accents (no green/amber in the UI chrome). Functional reds (check, wrong move, low time, loss) are kept for meaning. Board *themes* still offer color options; the default is the grayscale "Mono" theme.
- **Iconography:** Emoji-based icons for mode tiles and tier badges; SVG for pieces.

---

## Module Reference

### `chess.js` — rules engine
Pure logic, no DOM. Exposes the `Chess` class plus `idxToName`/`nameToIdx`.
- **Board model:** `board` is a 64-length array of single chars (uppercase = White, lowercase = Black, `""` = empty). Index = `row*8 + file`; **row 0 = rank 8** (top), file 0 = a-file. Helpers: `fileOf`, `rowOf`, `toIdx(f,r)`, `onBoard`, `colorOf`, `isWhite`, `isBlack`.
- **State:** `turn` (`"w"|"b"`), `castling` `{K,Q,k,q}` booleans, `ep` (en-passant target index or `null`).
- **Construction:** `new Chess(fen = START_FEN)` → `load(fen)` parses placement/turn/castling/ep (it ignores the halfmove/fullmove fields).
- **Move generation:** `_pseudoMoves()` generates all moves for the side to move; `legalMoves()` filters them by making each move on a snapshot and rejecting any that leave the own king attacked (`_apply`/`_undo` with a shallow board snapshot). `legalMovesFrom(name)` filters by origin.
- **Move object shape:** `{ from, to, piece, captured, promotion?, double?, ep?, castle? }` (indices for from/to). `castle` ∈ `K|Q|k|q`.
- **Special rules implemented:** castling (with through-/into-check checks via `_attacked`, and empty-square checks including b1/b8 for queenside), en passant (target set on double pawn push; capture removes the pawn on the mover's row), promotion (`_addPromos` adds Q/R/B/N), check detection (`inCheck`/`_attacked` covers pawn/knight/king/sliding attackers). **Not implemented:** threefold repetition, the 50-move rule, insufficient-material draws (see #18).
- **`move(spec)`** accepts `{from,to,promotion}` as names or indices, finds the matching legal move (defaulting promotion to Q), computes SAN via `toSAN` **before** applying, applies it, and returns `{...move, san, fromName, toName}` or `null` if illegal.
- **`toSAN(m)`** produces display SAN incl. castling (`O-O`/`O-O-O`), capture `x`, file/rank disambiguation, `=Q` promotion, and `+`/`#` suffixes (computed by applying the move on a snapshot).
- **`Chess.parseUci("e2e4"|"e7e8q")`** → `{from, to, promotion}` (names).
- **No `fen()` method exists** — `fenFromGame(game)` in `play.js` generates a FEN for Stockfish (it hardcodes the move counters as `0 1`, see #18).

### `srs.js` — position graph & spaced repetition
- **`posKey(game)`** — a unique position key: `board-chars + turn + castling + ep`. This is what makes transpositions collapse to one card.
- **`buildPositionGraph()`** runs once at load over every opening. For each ply where it is the learner's turn (`g.turn === o.color`), it creates/looks-up a node keyed by `posKey`, records the opening's move as a pooled correct **response**, and tracks `tier` (min across hosting openings = most common wins), `depth`, `path` (UCI moves to reach it), and a SAN label. Produces `POSITIONS` (nodes), `POSITION_BY_KEY`, `OPENING_CARDS` (opening id → [posKey…]), `OPENING_LINE` (opening id → [{key, uci}] — the move *this* opening plays at each card).
- **Node shape:** `{ key, sideToMove, responses: Map<uci,{uci,note,openings:Set}>, openings:Set, tier, depth, path:[], san, rep, lineCount }`.
- **`Store` (localStorage `chess-openings-trainer:v2`)** — data: `{ version:2, xp, totalReviews, streak:{count,lastDate}, cards:{ [posKey]: cardState } }`. `cardState` = `{ ease:2.5, interval:0, reps:0, due, attempts, correct, started, lastResult, moves:{uci:true} }`.
- **SM-2 grading (`gradeCard(key, mistakes, uci)`):** quality from mistakes via `qualityFromMistakes` (0→5, 1→4, 2→3, ≥3→2). If quality<3: reps=0, interval=1. Else interval steps 1→6→`round(interval*ease)`. `ease = max(1.3, ease + (0.1 − (5−q)(0.08 + (5−q)·0.02)))`. `due = today + interval`. Records the specific `uci` into `moves`. Returns `{xp, mastery, cardMastered, tier, tierMastery}`.
- **XP:** base 5, +5 if quality 5, +2 if quality 4, plus tier bonus (`tier===1?0:tier`).
- **Streak:** `_bumpStreak` increments once/day if yesterday was the last day, else resets to 1; `_rolloverStreak` (on load) zeroes the count if >1 day elapsed.
- **Strength/mastery math:** `cardStrength = min(1, interval/21)`; `cardProgress = started ? 0.4 + 0.6·strength : 0`; `cardMastered` when `interval ≥ 21`. `tierMastery(tier)` = mean `cardProgress` over that tier's positions ×100. `isTierUnlocked(tier)` requires the previous tier's mastery ≥ `TIER_UNLOCK_MASTERY` (50) **and** all lower tiers unlocked (recursive).
- **Per-opening (keyed off `OPENING_LINE`):** `openingTotal`, `openingLearned` (responses actually played), `openingMastery` (mean progress over the line's cards), `openingMastered` (all line cards mastered), `openingAccuracy` (Σcorrect/Σattempts over `OPENING_CARDS`, or `null`).
- **Session building:** `buildSession(maxItems=12, maxNew=4)` = due cards (sorted most-overdue then weakest — `daysBetween` returns b−a, so `daysBetween(today,due)` is negative for overdue → overdue first) + up to 4 unseen cards (tier, then popularity `lineCount`, then depth), falling back to the 6 weakest started cards. `weakestCards(n=6)` for the "Review Weakest" shortcut.
- **Dates** are day-granular `YYYY-MM-DD` strings via `todayStr`/`addDays`/`daysBetween` (local time, midnight-anchored).

### `board.js` — rendering & interaction (`Board` singleton)
- **Coordinate system:** each piece is an absolutely-positioned `12.5% × 12.5%` div placed with `transform: translate(col*800%, row*800%)` (800% of 12.5% = one square). Square colour: `(row+file)%2===0 ? sq-light : sq-dark` (computed on the *logical* square, so colours stay correct when flipped).
- **`buildBoard(container, orientation, onSquareTap)`** builds the 8×8 `.square` grid (each `data-sq="e4"`), file labels on the bottom rank, rank labels on the left file, and a click handler per square. `orientation` `"w"` = White at bottom.
- **`renderPieces(game, container, style)`** clears and redraws all pieces. **`animateMove(game, uci, style)`** applies the move to the engine, animates the moving piece via transform, removes captured pieces (incl. en-passant pawn), swaps the rook on castling, replaces the glyph on promotion, sets `_lastMove`, and **calls `clearHighlights()` + `applyLastTint()`** (so selection highlights are cleared and the from/to squares get `sq-last` after every move).
- **Highlight API (CSS classes on squares):** `selectSquare` (`sq-sel` + `sq-legal`/`sq-legal-cap`), `deselect`, `clearHighlights`, `applyLastTint` (`sq-last`), `markCheck` (`sq-check`), `markWrong` (`sq-wrong`, auto-clears 500 ms), `markHints(fromNames)` (`sq-hint`), plus piece-element effects `flashConfirm` (`piece-confirm`) and `shakeWrong` (`piece-shake`).
- **Piece-style rendering (`_pieceInner`):** `IMG_SETS = ["pixel","cburnett","merida","maestro","shaded","flat"]` render as `<img src="./pieces/<style>/<wb><TYPE>.<ext>">` where `ext = .png` for `PNG_SETS = ["shaded","flat"]`, else `.svg`. `classic` uses Unicode `GLYPH`, `letters` uses a `LETTER` span (`P` included), `modern` uses inline `PIECE_SVG` paths, and the fallback is a `LETTER` text node.
- **`whenPiecesReady(cb)`** awaits `img.decode()` for all piece images then `requestAnimationFrame` (an iOS-Safari paint safeguard). Note: rAF is throttled in background/headless tabs, which can stall drill setup during automated testing only.
- **`samplePiece(style,color,type)`** renders a 28 px preview used by the settings grid.

### `play.js` — Pass & Play + vs Bot
- **State:** `_game, _clock, _bot, _mode ("pvp"|"bot"), _playerColor, _style, _history (UCI[]), _selectedSq, _waiting, _gameOver, _boardEl, _timerPreset`.
- **`initPlay({mode, playerColor?, resume?})`** sets up the screen, tears down any previous bot/clock, then calls `_resumeGame()` (if `resume`) or `_newGame()`.
- **Move flow:** `_onSquareTap` handles select/move/re-select (and shows the promotion modal when needed); `_executeMove(from,to,promo)` animates, pushes to `_history`, drives the clock (`start` on move 1, else `switch`), then `_afterMove` (move list, opening hint, turn labels, `_saveGame`, check highlight, `_checkGameOver`); in bot mode it schedules `_doBotMove` after 200 ms.
- **Bot:** `_initBot(prefs, resume)` creates a `BotEngine`, configures skill from prefs/Elo, and (if it's the bot's turn) plays. `_doBotMove` requests `getBestMove(fen, remainingMs)` and applies the reply.
- **Persistence:** `_saveGame()` writes `chess-v2:game` `{mode, playerColor, history, timerState:{w,b,presetIdx}|null}` after each move; cleared on game end. `_resumeGame` replays the saved history (bailing to a new game on any illegal move — #20), restores clock ms, and `_setupTimer` restarts the side-to-move's clock when `history.length>0` (so resume is correctly timed).
- **Game end:** `_endGame(reason, winner)` (`checkmate|stalemate|flag|resign|draw`) updates Elo for bot+auto games, appends a record to the completed-game history, and shows the overlay.
- **Completed-game history (`chess-v2:games`, `_recordGame`):** array (cap 100) of `{date, mode, playerColor, result, winner, moves (UCI[]), opening, timerPreset, eloDelta}`. No browse UI yet (#14); included in export/import because the key starts with `chess`.
- **`fenFromGame(game)`** builds a FEN (placement/turn/castling/ep) with `0 1` move counters for Stockfish.

### `elo.js` — `EloStore` (localStorage `chess-v2:elo`)
- Data `{ elo:1200, history:[] }`; history capped at 50, each `{date, delta, result, opponentElo}`.
- `updateAfterGame(result, skillLevel)`: opponent Elo from `SKILL_ELO[skillLevel]`, expected score `1/(1+10^((opp−elo)/400))`, `delta = round(32·(result−expected))`, new elo clamped `[100,3000]`.
- `setElo(n)` clamps `[100,3000]`. `skillLevelFromElo(userElo)` maps Elo→0–20. `movetimeFromSkill(level)`: ≤5→200 ms, ≤10→500, ≤15→1000, else 2000.
- **`SKILL_ELO` (index = skill 0–20):** `[200,300,400,500,600,700,800,900,1000,1100,1200,1300,1400,1500,1600,1700,1900,2100,2300,2500,2700]`.

### `timer.js` — `ChessClock` + presets
- Drift-free: tracks ms per side, computing elapsed from `Date.now()` snapshots; `requestAnimationFrame` loop emits ticks only when the formatted string changes. `start(color)`, `switch(movedColor)` (adds increment to mover, starts opponent), `pause`, `reset`, `remaining(color)`, `isExpired`, `onTick(cb)`, `onFlag(cb)`. `ChessClock.format(ms)` → `M:SS`, or `M:SS.d` under 10 s.
- **`TIMER_PRESETS` (index → {label, seconds, increment}):** `1+0` (60/0), `2+1` (120/1), `3+2` (180/2), `5+0` (300/0), `10+0` (600/0), `15+10` (900/10), `30+0` (1800/0), `None` (0/0). `NO_TIMER_IDX = 7` (default).

### `bot.js` — `BotEngine` (Stockfish UCI over a Web Worker)
- `init(mode, skillOrElo)` spawns `new Worker("./stockfish.js")`, runs the UCI handshake (`uci`→`uciok`→configure→`isready`→`readyok`), and resolves. `_configure` sets `Threads 1`, `Hash 16`, and `Skill Level` (from Elo in auto mode, else the manual level).
- `getBestMove(fen, remainingMs)`: movetime = `min(5% of remaining, 3000 ms)` with a clock, else `movetimeFromSkill`. Resolves with the `bestmove` UCI (or `null` for `(none)`).
- `quit()` terminates the worker. `skillLevel` getter reports the active level.

### `opening-detect.js`, `export.js`, `openings.js`
- **`opening-detect.js`:** builds a prefix index (UCI-prefix → set of opening ids) once; `detectOpening(uciArray)` returns 1–3 opening names, or `[]` when there's no match or >3 candidates (still in shared early theory).
- **`export.js`:** `downloadMarkdown(store, eloStore, prefs)` writes `chess-progress-YYYY-MM-DD.md` (Elo/bot history, trainer stats, per-opening progress table, settings, and a fenced `json` appendix of **every** `chess*` localStorage key). `importProgressFromText(text)` parses raw JSON or extracts the fenced block, validates ≥1 `chess*` key, `confirm()`s, restores the keys, and reloads.
- **`openings.js`:** `OPENINGS` — **32** entries. Each: `{ id, name, eco, tier (1–4), color ("w"|"b" — the side the learner plays), idea, moves:[{uci, note}] }`. The mainline is authored as the full sequence; `srs.js` derives the learner's cards from the plies where `turn === color`.

### `trainer.js` & `library.js`
- **`trainer.js`** controls three screens: the **trainer dashboard** (`initTrainer` → stats + four collapsible tier sections of opening cards, with the mastery-ring legend and `_masteryLabel` New/Learning/Familiar/Strong/Mastered thresholds 0/1/40/80/100), the **drill** (`_startDrillSession`/`_loadDrillCard`/`_onDrillTap`/`_attemptDrillMove`/`_completeDrillCard`/`_showCompletionOverlay`/`_advanceDrill`; tracks `_drillSession`, `_drillIdx`, `_drillMistakes`, `_drillKey`, `_drillGame`, `_drillWaiting`; hint after 3 wrong via `Board.markHints`), and the **practice/browse** screen (`initPractice` with tier/colour chip filters). Drill correctness pools all `node.responses`.
- **`library.js`** (`initLibrary`) renders every opening as an expandable row with its idea, the user's mastery/learned/accuracy, a lock notice, and the full SAN mainline with per-ply notes.

---

## Constants & Tunables (quick reference)

| Constant | File | Value | Meaning |
|----------|------|-------|---------|
| `TIER_UNLOCK_MASTERY` | srs.js | 50 | % mastery of a tier to unlock the next |
| `STRENGTH_FULL_INTERVAL` | srs.js | 21 | interval (days) counted as fully known |
| default `ease` | srs.js | 2.5 | SM-2 starting ease (floor 1.3) |
| session size / new cap | srs.js | 12 / 4 | `buildSession` limits |
| `DEFAULT_ELO` | elo.js | 1200 | starting/elo-reset value |
| Elo K-factor | elo.js | 32 | rating volatility |
| Elo clamp | elo.js | 100–3000 | min/max rating |
| history caps | elo.js / play.js | 50 / 100 | bot-game Elo history / saved games |
| `NO_TIMER_IDX` | timer.js | 7 | default = no clock |
| bot movetime (clock) | bot.js | 5% rem, max 3000 ms | per-move budget |
| bot `Hash`/`Threads` | bot.js | 16 MB / 1 | engine options |
| SW cache | sw.js | `chess-v9` | current precache key |

---

## localStorage — exact shapes

All state is `localStorage`, namespaced. Stores read on construction; **import = overwrite keys + reload**. (See "Data & Persistence" above for the export/import contract and SW behaviour.)

| Key | Writer | Shape |
|-----|--------|-------|
| `chess-openings-trainer:v2` | `Store` (srs.js) | `{version:2, xp, totalReviews, streak:{count,lastDate}, cards:{[posKey]:{ease,interval,reps,due,attempts,correct,started,lastResult,moves:{uci:true}}}}` |
| `chess-v2:elo` | `EloStore` (elo.js) | `{elo, history:[{date,delta,result,opponentElo}]}` (≤50) |
| `chess-v2:prefs` | home.js | `{pieces, board, timerPreset, botDifficulty:{mode,skillLevel}}` |
| `chess-v2:game` | play.js | `{mode, playerColor, history:[uci], timerState:{w,b,presetIdx}|null}` (deleted on game end) |
| `chess-v2:games` | play.js | `[{date,mode,playerColor,result,winner,moves:[uci],opening,timerPreset,eloDelta}]` (≤100) |

`loadPrefs()` migrates `pieces`/`board` from a legacy `chess-openings-prefs` key if present and resets an unknown piece style to the default. The trainer key is intentionally shared with `apps/chess-openings/`. `sw.js`'s `ASSETS` precaches the HTML/CSS, all JS (incl. `stockfish.js`), and every image-set file (`pixel`/`cburnett`/`merida`/`maestro` SVGs; `shaded`/`flat` PNGs).

---

## Rendering & CSS internals

- **Layout:** `#app` is a `max-width:520px`, `100dvh` flex column with `padding-bottom: env(safe-area-inset-bottom)`. Top headers carry `--safe-top` (`max(1.5rem, env(safe-area-inset-top)+.4rem)`) so controls clear the iOS status bar. Board theme is applied via `#app[data-board="…"]` (`applyBoardTheme`).
- **Design tokens (`:root`, monochrome):** neutrals `--bg #0a0a0a / --bg2 #101010 / --surface #161616 / --surface2 #222 / --border #2a2a2a`; text `--text #e6e6e6 / --text-dim #9a9a9a / --text-faint #555`; accents `--gold #e8e8e8 / --gold-bright #fff / --gold-lo #3a3a3a`; glow `--phosphor #e8e8e8`; pieces `--pw #ececec / --pb #181818 / --pw-edge #444 / --pb-edge #8a8a8a`; status `--sel/--sel-bg/--last-bg/--legal-dot` (whites), `--hint-bg rgba(255,255,255,.28)`, and **functional reds kept**: `--chk-bg`, `--wrong-bg`, low-time blink `#e03030`.
- **Board theme tokens:** `#app[data-board="<id>"]` overrides `--sq-light`/`--sq-dark` **and `--last-edge`** (the last-move border colour, chosen per theme to contrast with that theme's squares). Swatch colours in `BOARD_THEMES` (home.js) must stay in sync with the square colours.
- **Last-move marker:** `.sq-last` = `--last-bg` fill tint (`rgba(255,255,255,.18)`) + a 2px `--last-edge` outline on both from/to squares. Coordinate labels (`.coord`) are light (`rgba(255,255,255,.85)`) with a dark halo.
- **Square state classes:** `sq-light`/`sq-dark` (base), `sq-sel`, `sq-legal`/`sq-legal-cap`, `sq-last`, `sq-check`, `sq-wrong`, `sq-hint`. Piece effect classes: `piece-moved`, `piece-captured`, `piece-confirm`, `piece-shake`.
- **Effects:** `.board-wrap` has a radial **vignette** overlay (`::before`) and a slow `flicker` animation (CRT feel); low time triggers `blink-red`; overlays fade via `fade-in`. (The vignette darkens edge squares, so equal-coloured squares can look uneven near the border — relevant to #38.)

---

## Asset pipeline (piece sets)

SVG sets (`pixel`,`cburnett`,`merida`,`maestro`) are vendored from the Lichess project. The two PNG sets were generated locally (one-off Pillow script; the app itself stays vanilla):
- **`shaded`** — from a 6×2 contact-sheet image: sliced into 12 cells, background flood-keyed to transparent, largest connected component kept, trimmed, downscaled to 160 px. Because the sheet's white pieces are near-white on a gray ground (un-keyable cleanly), the **white pieces are the colour-inverted clean black pieces** (matched, solid).
- **`flat`** — from a folder of opaque-background PNGs: black pieces background-keyed; **white pieces colour-inverted from black** (the supplied white "no outer outline" set was white-on-white and un-keyable).
- Both: pawns scaled to ~2/3 of the frame so they read smaller than the back-rank pieces. Sets are a few hundred KB total (vs ~10 MB raw). Raw sources are not kept in the repo.

---

## Verification

No automated tests. Verify changes in the browser preview (`web-apps-home` launch config, `/apps/chess/`): clear the SW/caches and reload after asset/JS changes, exercise the affected screen, check `preview_console_logs` for errors, and screenshot/inspect for visual changes. For offline behaviour, load once (populating the cache) then go offline. Always bump `sw.js` `CACHE` when cached files change.

---

## Known Issues / To Be Implemented

Items are listed in rough priority order but none are scheduled yet.

---

**1. Remove the standalone chess-openings app**  
`apps/chess-openings/` is a legacy standalone opening trainer that pre-dates this unified app. All its functionality now exists in the Trainer and Library screens. The standalone app should be retired and removed (or at minimum de-linked from the home page index).

---

**2. Change the app icon** — ✅ Resolved 2026-06-20  
~~The current icon is a generic chess pawn/king glyph.~~ Fixed: `icon.svg` now renders the **existing pixel-art knight from the piece set** (`pieces/pixel/wN.svg`, embedded verbatim as a nested `<svg>`) centered on a **solid black rounded square** (`viewBox 0 0 64 64`, `rx 12`, fill `#000`). The knight's own `#000` outline recedes into the black background, leaving a clean light/silver pixel knight. `manifest.json` already points at `icon.svg` with `sizes:"any"`, so no manifest change was needed; no new artwork was drawn (per request, the existing knight is reused).

---

**3. Back button unreachable on iPhone** — ✅ Resolved 2026-06-20  
~~The `←` back arrow in play-screen and drill-screen headers is positioned too close to the top of the screen. On iPhone it falls directly behind the iOS status bar (where the clock is displayed), making it impossible to tap.~~ Fixed: introduced a `--safe-top: max(1.5rem, calc(env(safe-area-inset-top) + .4rem))` token applied to every top-level header (`.bar`, `.drill-bar`, `.home-header`, `.settings-bar`) — the `max()` floor guarantees clearance even on non-notch iPhones where the inset reports 0. Back buttons (`.btn-icon`) are now ≥44px tap targets.

---

**4. Clarify or remove confusing metrics in Trainer** — ✅ Resolved 2026-06-20  
~~Each card showed an ECO code (e.g. "B18") and bare mastery/accuracy percentages with no labels.~~ Fixed (see "Metrics displayed per opening" and the legend, above, for the precise contract): ECO codes were **removed from trainer cards** (still in the Library); a **plain-language mastery label** (New/Learning/Familiar/Strong/Mastered) now accompanies the ring; the learned count reads `learned/total moves`; the accuracy tag reads `% correct`; and a **one-line legend** explaining the ring is shown once atop the opening list.

---

**5. Import / restore a save file** — ✅ Resolved 2026-06-20  
~~The Export button downloaded a progress file but there was no way to load it back.~~ Fixed: an "Import Save File" button in Settings (`importProgressFromText` in `export.js`) reads an exported `.md` (extracts its ```json appendix) or raw `.json`, validates it, confirms, restores every `chess*` localStorage key, and reloads. See the **Import / restore** contract in "Data & Persistence" above. Export → Import is a lossless round-trip.

---

**6. Auto-save all completed games** — ✅ Resolved 2026-06-20  
~~Finished games were not persisted anywhere.~~ Fixed: every finished game (all modes) is appended to `chess-v2:games` via `_recordGame` (hooked from `_endGame` in `play.js`), capped at the last 100, and included in export/import save files. See the **Completed-game history** schema in "Data & Persistence" above. The browse/analyse UI is tracked separately as item #14.

---

**7. Hint highlighting after three wrong tries in Trainer** — ✅ Resolved 2026-06-20  
~~There was no visual hint — only the move-note text updated.~~ Fixed: on the 3rd (and every subsequent) wrong attempt, the from-squares of all correct book responses are highlighted via `Board.markHints` (`.sq-hint` tint) and the move-note reads "Hint: move a highlighted piece". See the full **"Drill hint behavior"** spec in the Trainer section above for the exact, regression-detectable contract.

---

**8. Promotion picker icons too small** — ✅ Resolved 2026-06-20  
~~When a pawn reaches the back rank and a promotion modal appears, the piece icons inside the picker are rendered at a very small size on mobile.~~ Fixed: `.promo-btn` enlarged from 3.4rem to 4.6rem (~74px) and the sampled piece is scaled to fill the button (the 28px glyph from `samplePiece` no longer floats in empty space).

---

**9. Stockfish difficulty calibration**  
The Elo ↔ Skill Level mapping (Skill 0 ≈ 200 Elo, …, Skill 20 ≈ 2700 Elo) is a rough approximation. The actual playing strength depends on the JS engine, movetime, and device speed. The calibration should be tested empirically — play several games at each skill level and compare results against the expected Elo bracket. Adjust the `SKILL_ELO` lookup table in `elo.js` if the bot plays significantly above or below the stated rating.

---

**10. Change color scheme to black and white** — ✅ Resolved 2026-06-20  
~~The palette was dark green + amber gold + phosphor green.~~ Fixed: the `:root` design tokens in `styles.css` were remapped to a monochrome palette (neutral grays + white accents); the default board theme became the grayscale "Mono" theme (other color themes retained); `manifest.json` `theme_color` and the `index.html` meta theme-color are now `#0a0a0a`. Functional reds (check, wrong move, low-time blink, loss delta) are intentionally kept. See "Current global color tokens — monochrome" above for the exact contract.

---

**11. Integrate two new pixel piece set variants** — ✅ Resolved 2026-06-20  
~~Two new piece designs were sitting as stray assets (a contact-sheet image and a folder of images).~~ Both are now selectable styles (`shaded`, `flat`) in Settings, and `board.js` loads `.png` for them via `PNG_SETS`. Processing notes (the source assets were not directly usable):
- **`shaded`** — built from the contact-sheet image (12 pieces, 6×2, on an opaque gray background) by slicing into cells, flood-filling the background to transparent, keeping the largest connected component (drops neighbor-cell fragments), trimming, and downscaling to 160px.
- **`flat`** — the supplied folder had **opaque** (not transparent) RGB backgrounds, and its white set was white-on-white with no outer outline (un-keyable). So the black pieces were background-keyed from the folder, and the **white pieces were derived by color-inverting the keyed black pieces** (matched silhouettes, internal detail preserved).
- Both sets are downscaled/optimized to ~80–215 KB total each (the raw sources were ~1 MB per piece, ~10 MB+) and precached in `sw.js` (cache `chess-v8`).
- The raw source assets (the contact-sheet PNG and `pixel_chess_set_exact_previous_images/`) are intentionally kept on disk **untracked** as a regeneration backup; they are not committed.

---

**12. Pawns invisible when using the Letters piece style** — ✅ Resolved 2026-06-20  
~~When the "Letters" piece style is selected, pawns do not appear on the board.~~ Fixed: the `LETTER` map in `board.js` mapped the pawn to an empty string (`P:""`); changed to `P:"P"`.

---

**13. Letters piece style: improve black/white contrast** — ✅ Resolved 2026-06-20  
~~Both sides' letters rendered in similar colors, making White and Black hard to distinguish.~~ Fixed: White letters render `#fff` and Black letters `#181818`, each with a contrasting halo `text-shadow` (dark halo for white, light halo for black) so both stay legible on any square color. Note: an initial `-webkit-text-stroke` approach was rejected — at the small glyph size the stroke overwhelmed the fill and visually inverted the colors; a soft halo shadow preserves the fill color identity.

---

**14. Game Browser & Analysis mode** *(new — enabled by #6)*  
Auto-save (#6) now persists every finished game to `chess-v2:games` (schema in "Data & Persistence"), but there is no UI to view them. Build a screen — reachable from Home — that lists saved games (date, mode, result, opening, Elo delta) and lets the user open one to replay it move-by-move on a board and analyse it. Should read from `chess-v2:games`; consider adding delete/clear and per-game export. This is the "mode to browse and analyze them" referenced when #6 was requested.

---

*Items #15–#26 below were found during a comprehensive code audit on 2026-06-20 (not yet fixed). Severity tags are guidance only. Note: several initially-suspected issues were verified as NOT bugs and deliberately excluded — the SRS overdue-sort is correct (`daysBetween(a,b)` returns `b−a`), coordinate labels recompute correctly when the board is flipped, and shared A00/B00 ECO codes are legitimate chess classification.*

### Correctness / gameplay

**15. (High) `stockfish.js` is missing from the service-worker precache** — ✅ Resolved 2026-06-20  
~~`bot.js:30` loads `new Worker("./stockfish.js")` but it wasn't in the `sw.js` `ASSETS` list, so vs-Bot failed on first offline use.~~ Fixed: added `"./stockfish.js"` to `ASSETS` and bumped the cache to `chess-v7`. The Stockfish bot now works fully offline.

**16. (High) Double bot initialization on "New Game" / "Play Again"** — ✅ Resolved 2026-06-20  
~~`_newGame()` already calls `_initBot()`, but the `btn-new-game` and `go-btn-again` handlers called `_initBot()` again, spawning a second leaked Stockfish worker and risking a double bot move.~~ Fixed: removed the redundant `_initBot()` calls from both handlers; `_newGame()` is now the single initialization path.

**17. (Med) A failed bot move permanently freezes the board** — ✅ Resolved 2026-06-20  
~~In `_doBotMove`, the early returns for a falsy `uci` or a null `animateMove` result left `_waiting=true`, locking the board in "Thinking…".~~ Fixed: both early-return paths now reset `_waiting=false` and clear the `bot-thinking` status before returning.

**18. (Med) No draw detection: threefold repetition, 50-move rule, insufficient material**  
`chess.js` ends games only on checkmate/stalemate; `play.js` adds flag/resign/draw-offer. A drawn position such as K-vs-K never auto-draws and play can continue forever. Relatedly, `fenFromGame` hardcodes the halfmove/fullmove counters to `0 1` (`play.js:20`), so the data needed for the 50-move rule isn't tracked and the FEN handed to Stockfish is slightly inaccurate.

### Timer / resume

**19. ~~Resuming a timed game doesn't restart the side-to-move's clock~~ — ❌ Not a bug (false positive, retracted 2026-06-20)**  
A re-read of the code shows `_setupTimer` **does** start the clock on resume: after restoring `_clock._ms`, it calls `_clock.start(_game.turn)` when `_history.length > 0 && !_gameOver` (play.js, ~lines 178–181). The original audit's read window stopped just short of those lines. Resume is correctly timed; nothing to fix.

**20. (Low) Resume replays saved moves without validating them** — ✅ Resolved 2026-06-20  
~~`_resumeGame` looped `_game.move(spec)` ignoring the return value, so a corrupt `chess-v2:game` history produced a wrong/partial position.~~ Fixed: the replay loop now checks each move's return and falls back to `_newGame()` if any saved move is rejected.

### State / navigation

**21. (Med) Promotion modal isn't dismissed when leaving the play screen** — ✅ Resolved 2026-06-20  
~~Pressing Back while the promotion modal was open navigated Home while the fixed-position modal stayed overlaid.~~ Fixed: the Back handler now hides `#promo-modal` and resets `_waiting=false` before navigating Home.

**22. (Low) "Draw" against the bot is an instant, unconditional draw**  
In bot mode `btn-draw` immediately ends the game as a draw (`play.js:491-492`) — the engine never "agrees". The player can claim a draw at any time. Fix: only allow a claim in a legitimate draw situation (ties into #18), or at least require confirmation.

### Quality-of-life / polish

**23. (Low) Resign has no confirmation** — ✅ Resolved 2026-06-21  
~~`btn-resign` forfeited on a single tap.~~ Fixed: Resign now uses a two-tap confirm (first tap → "Sure?", reverts after ~5 s; second tap resigns), mirroring the Draw-offer pattern. Canonical behavior under **Play screen → Board feedback**.

**24. (Low) Bot movetime ignores the increment**  
`getBestMove` uses `min(5% of remaining, 3000ms)` (`bot.js:78`) without accounting for the per-move increment, so in increment time controls the bot can drift toward flagging instead of using its added time.

**25. (Low) Missing feedback / keyboard affordances**  
Export shows no success confirmation (`home.js:265`); the Settings panel can't be closed with Escape and the Elo editor can't be submitted with Enter. Minor on iOS, but expected on desktop/keyboard.

**26. (Low) Long Stockfish load shows only a static "Loading engine…"**  
The ~10 MB engine load (`play.js:222`) has no progress indicator, timeout, or cancel, so on a slow first load the app appears frozen. Fix: add a spinner/progress and a fallback/timeout message.

---

*Items #27–#36 below are feature requests / improvements added on 2026-06-20 (not yet implemented).*

### Accessibility & legibility

**27. Adjustable text size & color in Settings (accessibility)**  
Add Settings controls to scale the UI text size (e.g. a few steps from normal → large → extra-large) and to choose the text color, persisted in prefs. Should drive a root token (e.g. a `--text-scale` multiplier and a `--text` override) so it applies app-wide. This is the core accessibility request and also the Settings half of #31.

**28. Legibility overhaul — darker, higher-contrast UI**  
Make the whole UI more legible: push backgrounds darker (solid `#000` where possible), and make more UI elements white or white-bordered so controls and panels read clearly. Tighten contrast on dimmed/faint text (`--text-dim`, `--text-faint`) which is currently low-contrast on the dark surfaces. Pairs with #27 (user-adjustable text) and #29.

**29. Rank/file coordinate markers are hard to read** — ✅ Resolved 2026-06-21  
~~Labels rendered in `--text-faint` (#555) and were barely visible.~~ Fixed: `.coord` now renders at `rgba(255,255,255,.85)` with a dark `text-shadow` halo and a slightly larger font, legible on every board theme.

### Gameplay features

**30. Pre-move vs the bot**  
Allow the player to queue a move while the bot is thinking (`_waiting`), then auto-play it (if legal) once the bot replies — like lichess/chess.com pre-moves. Needs a pre-move buffer in `play.js`, a distinct highlight for the queued from/to squares, and cancel-on-tap behavior.

**31. Randomize player color vs the bot** — ✅ Resolved 2026-06-21  
~~Starting a bot game always made the player White.~~ Fixed: the `tile-bot` handler now picks `Math.random() < 0.5 ? "w" : "b"`; `_newGame`/`_initBot` already orient the board and let the bot open when the player is Black. Canonical behavior documented under **vs Bot Mode → Game rules**.

**32. Clearer last-move indicator** — ✅ Resolved 2026-06-21  
~~The last-move tint was too faint in the monochrome theme.~~ Fixed: both the from and to squares now get a stronger fill (`--last-bg` .18) **and** a 2px accent border (`.sq-last` + `--last-edge`) whose colour is defined **per board theme** (amber/cyan/blue/orange/teal etc.) so it's immediately legible against each theme's squares. Canonical behavior under **Play screen → Board feedback**. This also resolves the practical "looks off after moves" part of #38.

**33. Captured-pieces tray**  
Add an in-game UI element showing the pieces each side has captured so far (and ideally a material-difference indicator). Derive it from the move history / board diff; show it near each player's clock row.

**34. Move/capture/check sounds**  
Add short sound effects for a normal move, a capture, and check (and likely castle / game-end). Bundle small audio assets (precached in `sw.js`), respect a mute toggle in Settings, and unlock audio on first user interaction (iOS requirement).

### Bot game rules

**35. Remove the Draw option vs the bot** — ✅ Resolved 2026-06-21 (also closes #22)  
~~The "Draw" button granted an instant unconditional draw vs the bot.~~ Fixed: the Draw button is hidden when `_mode === "bot"` (`initPlay`), and its handler early-returns in bot mode. Canonical behavior documented under **vs Bot Mode → Game rules**.

**36. "New Game" mid-game vs the bot should count as a resignation** — ✅ Resolved 2026-06-21  
~~Tapping New mid-bot-game abandoned it with no result.~~ Fixed: the `btn-new-game` handler calls `_endGame("resign", <bot colour>)` first when a bot game is in progress (`_mode === "bot" && !_gameOver && _history.length > 0`), recording an Elo + game-history loss before the new game. Verified: 1200 → 1184 with a `{result:"resign"}` record on abandon. Canonical behavior documented under **vs Bot Mode → Game rules**.

### UI placement

**37. Move the Export Progress button into the Settings menu only**  
The Export Progress button currently appears on both the Home screen (`btn-export`, `index.html:88`) and in Settings (`st-export`, alongside Import). Remove the Home-screen copy so export lives only in Settings next to Import, decluttering the home screen and keeping save/restore together.

### Board rendering

**38. (Bug — investigate) Board tiling looks off after moves**  
User-reported: the board's square shading looks inconsistent after moves. **Correction to the original root-cause guess:** highlights are *not* the problem — `animateMove` already calls `clearHighlights()` + `applyLastTint()` after every move, and a reproduction (e4 e5 Nf3 Nc6) confirms the *only* post-move classes are `sq-last` on the latest from/to squares; base `sq-light`/`sq-dark` parity is correct. The likely visual causes to investigate are therefore presentational, not state: (a) the `.board-wrap` **vignette** overlay (`::before`) plus the slow `flicker` animation darken edge/corner squares, so two same-coloured squares can read as different shades near the border; and (b) in the monochrome theme the `sq-last` tint (white ~12%) is subtle/ambiguous, so the two last-move squares can look like a random colour change rather than a deliberate highlight. Investigate & decide: tone down or disable the vignette/flicker in the monochrome theme, and make the last-move highlight clearer (ties into #32). **Update 2026-06-21:** the last-move-clarity half is now resolved by #32 (stronger tint + per-theme accent border), which should remove most of the "looks off after moves" perception. The only remaining open question is whether to tone down the `.board-wrap` vignette/flicker — left as-is for now since it's a deliberate retro-CRT aesthetic; revisit only if still bothersome.

### Housekeeping (found during the 2026-06-20 documentation audit)

**39. (Low) Remove dead `script.js`**  
`apps/chess/script.js` (~193 lines) is the old standalone pass-and-play controller (references `#board`, `#status`, etc.). It is not loaded by `index.html` and not precached by `sw.js` — pure dead weight. Delete it.

**40. (Low) `app.json` accent colour is stale**  
`app.json` still has `"color": "#c8903a"` (the old amber). After the monochrome redesign (#10) it should be a neutral/black value so the launcher card matches the app.

**41. (Low) `#complete-overlay` lacks the `hidden` attribute**  
Unlike `#promo-modal` and `#gameover-overlay`, the drill completion overlay (`index.html`) has no initial `hidden` attribute — it relies solely on CSS (`.show` toggling). Harmless today, but inconsistent; add `hidden` (and have the JS toggle it) for parity and safety.

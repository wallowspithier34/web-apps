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
Opened from the ⚙ button. Controls:
- Manual Elo override (100–3000)
- Piece style (7 options)
- Board color theme (6 options)
- Export progress button

### Trainer screen
Entry point for SRS learning. Shows per-opening progress across four tiers. Buttons: Daily Session, Review Weakest, Browse Openings.

### Drill screen
Active during a training session. Shows a progress indicator (dots), the current opening name, whose turn it is, and the interactive board. After each correct move an overlay confirms the result and awards XP.

### Practice / Browse screen
Filterable list of all openings (by tier and side). Each row shows the opening name, strategic idea, learned positions, mastery %, and accuracy %. Tapping "Drill" starts a targeted session for that opening.

### Play screen
Shared by Pass & Play and vs Bot. Shows both player clocks, a scrollable move list in algebraic notation, and an opening-name hint once a known position is reached. Action buttons: Resign, Draw, New Game.

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

Stockfish 16 runs as a pure-JavaScript Web Worker (no WASM, no SharedArrayBuffer) so it works on standard static hosting and iOS Safari. Communication is via the UCI protocol: `position fen … go movetime …` → `bestmove …`.

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

### Piece styles (7)
| ID | Name | Description |
|----|------|-------------|
| `pixel` | Pixel | Lichess pixel set — blocky, retro |
| `cburnett` | CBurnett | Colorful hand-drawn (default Lichess style) |
| `merida` | Merida | Ornate serif Staunton |
| `maestro` | Maestro | Geometric modern |
| `modern` | Modern | Contemporary outlined |
| `classic` | Classic | Traditional Staunton |
| `letters` | Letters | Plain letters only (K/Q/R/B/N/P) |

Pieces are SVG files at `./pieces/[style]/[wb][PIECE].svg`.

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

**Service worker** — cache-first strategy; all HTML/CSS/JS/SVG assets cached on install under the current key (`chess-v7`), **including `stockfish.js`** so the vs-Bot mode works fully offline. Older caches (`chess-v1`…`chess-v6`) are cleaned up on activation. Bump the cache version whenever cached assets change, or returning users keep the stale copy.

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

**11. Integrate two new pixel piece set variants**  
Two new piece set variants have been saved in `pieces/pixel_chess_set_exact_previous_images/` and are ready to wire up:
- `black/` — pixel pieces rendered with a black fill style
- `white_no_outer_outline/` — pixel pieces with white fill and no outer outline

These need to be registered as selectable styles in the Settings panel alongside the existing 7 styles. They are PNGs (not SVGs), so the board renderer may need a small adjustment to load `.png` instead of `.svg` for these two styles.

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

**19. (Med) Resuming a timed game doesn't restart the side-to-move's clock**  
`_resumeGame` restores `_clock._ms` (`play.js:162-165`) but never calls `_clock.start(_game.turn)`. After a resume the active player's clock is paused, so their first move costs zero time (`switch()` sees `_startedAt === null` → 0 elapsed). Fix: start the clock for the side to move on resume.

**20. (Low) Resume replays saved moves without validating them** — ✅ Resolved 2026-06-20  
~~`_resumeGame` looped `_game.move(spec)` ignoring the return value, so a corrupt `chess-v2:game` history produced a wrong/partial position.~~ Fixed: the replay loop now checks each move's return and falls back to `_newGame()` if any saved move is rejected.

### State / navigation

**21. (Med) Promotion modal isn't dismissed when leaving the play screen** — ✅ Resolved 2026-06-20  
~~Pressing Back while the promotion modal was open navigated Home while the fixed-position modal stayed overlaid.~~ Fixed: the Back handler now hides `#promo-modal` and resets `_waiting=false` before navigating Home.

**22. (Low) "Draw" against the bot is an instant, unconditional draw**  
In bot mode `btn-draw` immediately ends the game as a draw (`play.js:491-492`) — the engine never "agrees". The player can claim a draw at any time. Fix: only allow a claim in a legitimate draw situation (ties into #18), or at least require confirmation.

### Quality-of-life / polish

**23. (Low) Resign has no confirmation**  
`btn-resign` forfeits on a single tap (`play.js:483-487`); an accidental tap instantly loses the game. Fix: add a confirm step (or a two-tap pattern like the draw offer).

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

**29. Rank/file coordinate markers are hard to read**  
The board coordinate labels (`.coord-rank` / `.coord-file` in `styles.css`) render in `--text-faint` (`#555`) over the board squares and are barely visible. Fix: increase contrast/size, or give them an outline/halo so they read on both light and dark squares.

### Gameplay features

**30. Pre-move vs the bot**  
Allow the player to queue a move while the bot is thinking (`_waiting`), then auto-play it (if legal) once the bot replies — like lichess/chess.com pre-moves. Needs a pre-move buffer in `play.js`, a distinct highlight for the queued from/to squares, and cancel-on-tap behavior.

**31. Randomize player color vs the bot**  
Starting a bot game currently always makes the player White (`playerColor` defaults to `"w"`). Randomly assign White/Black at game start (and have the bot open when the player is Black). Touches the bot-game launch path in `home.js` / `initPlay`.

**32. Clearer last-move indicator**  
A faint last-move tint exists (`Board.applyLastTint` / `.sq-last`), but it's hard to see (especially in the monochrome theme). Make it clearly mark both the piece that just moved and the square it came from (e.g. stronger highlight on both from/to squares, or a marker on the moved piece).

**33. Captured-pieces tray**  
Add an in-game UI element showing the pieces each side has captured so far (and ideally a material-difference indicator). Derive it from the move history / board diff; show it near each player's clock row.

**34. Move/capture/check sounds**  
Add short sound effects for a normal move, a capture, and check (and likely castle / game-end). Bundle small audio assets (precached in `sw.js`), respect a mute toggle in Settings, and unlock audio on first user interaction (iOS requirement).

### Bot game rules

**35. Remove the Draw option vs the bot**  
Remove the "Draw" action entirely in bot mode (the engine never agrees, and it currently grants an instant unconditional draw). Supersedes #22 — rather than gating the claim, just drop the button when `_mode === "bot"`.

**36. "New Game" mid-game vs the bot should count as a resignation**  
Starting a new game (or "Play Again" before the current game ends) while a bot game is in progress currently abandons the game with no result. It should be recorded as a loss/resignation (Elo + game history) before the new game starts.

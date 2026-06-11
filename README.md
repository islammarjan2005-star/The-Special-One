# Perfect Season

An FM-lite football management game for the browser. One league, one season,
38 matchweeks, playable start-to-finish in 30–45 minutes. The economy is the
game: wage bills and transfer budgets drive every decision.

## Play

```bash
npm install
npm run dev
```

Mobile-first — open it on a phone-sized viewport for the intended experience.

## How it works

- **Real clubs, real players.** All 20 Premier League clubs with their real
  2025-26 squads — 400 players sourced from the open
  [Fantasy Premier League dataset](https://github.com/vaastav/Fantasy-Premier-League).
  Ratings are derived from FPL prices (normalized per position) and minutes
  played. Regenerate with `node scripts/build-data.mjs`.
- Pick one of three clubs: **Chelsea** (rich, easy), **West Ham**
  (mid-table, normal), or **Burnley** (broke, hard). The budget is the
  difficulty.
- Each matchweek: read the inbox, pick your XI (4-4-2), choose a mentality
  (defensive / balanced / attacking), and sim the match. If you're not
  winning at half-time you get **one** intervention: switch mentality, give
  the hairdryer treatment (form boost, morale risk), or hold steady.
- **The market never closes — but the windows do.** Every player in the
  league is searchable year-round. While a window is open (pre-season,
  January) deals complete instantly; between them, deals you agree are
  queued and go through when the January window opens, with funds committed
  up front and refundable on cancel. After the January deadline you can
  browse and plan, but nobody signs until summer. A club's top three players
  carry a hold-out premium. Buying requires the fee to fit the transfer
  budget **and** the projected wage bill (counting agreed deals) to fit the
  weekly wage budget — the UI tells you exactly which constraint you're
  breaking.
- **The Gem Draw**: if your wage bill is in the league's bottom third (or
  your transfer budget is below the median player value), your scouts unearth
  one mystery signing per window — 25% wonderkid, 50% honest pro, 25% dud.
  Being broke is a different kind of fun, not a worse one.
- Notable results generate tabloid back-page headline cards (template engine
  with name-pun fragments — no LLM) that download as shareable PNGs.
- The board sacks you if patience hits zero. Champions, European spots,
  relegation and survival each get their own ending.

State persists to localStorage (one career slot), so a refresh resumes where
you left off.

## Architecture

- `src/engine/` — pure-JS game engine, no DOM. Seedable RNG lives inside the
  game state, so the entire game (randomness included) serializes to JSON.
  - `match.js` — Poisson goal model from weighted positional strength
    (GK ×1.3, DEF ×1.15, MID ×1.1, ATT ×1.0), weakest-link penalty, +3 home
    advantage, mentality multipliers, ~3% per-starter injury risk per match.
  - `game.js` — weekly loop, board patience, transfer windows, season end.
  - `headlines.js` — ~40 headline templates + pun fragments keyed to player
    surname syllables, behind a swappable `generateHeadline` interface.
- `src/ui/` — React screens: club select, matchday hub, market, table,
  headline modal (canvas PNG export), season review.
- `test/season.test.js` — headless vitest suite that autoplays full seasons
  for all three starter clubs and asserts the economy rules.

```bash
npm test        # autoplay seasons + rule checks
npm run build   # production build
```

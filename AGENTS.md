# stumpchess — agent / AI handoff

Read this first in a **new chat**. It maps the monorepo, features, file roles, invariants, and known pitfalls so you do not re-discover the architecture from scratch.

Human-facing overview: [`README.md`](README.md). This file is for agents.

---

## What this product is

**stumpchess** — small club chess site:

- Online play (matchmaking + challenges + WebRTC with socket relay fallback)
- **Watch** live human games (spectators: no engine during play)
- **Tournaments** (Swiss): host with VIP+ or `TOURNAMENT_HOST`; LTA+ assigns roles
- Direct **Messages** between users
- Board themes in **Settings** (plus site light/dark)
- vs Computer (personality bots + Stockfish engine lane)
- **Openings explorer** (`/openings`) from a local ECO book (no external explorer API)
- Classic forum with roles
- **VIP**: deep game review (`/analysis`), Practice (`/practice`), mistake drills
- Client-side **Stockfish 19 lite** WASM (no cloud engine cost)

Owner account: username `jOjo`, avatar `/avatars/tree-stump.jpg`, public stats hidden.

Remote: `https://github.com/Spydero/stumpchess.git` (branch `main`).

---

## Monorepo layout

```
chess-platform/
├── AGENTS.md                 ← this file
├── README.md
├── package.json              ← pnpm workspace root scripts
├── apps/
│   ├── web/                  ← Next.js 15 (UI + Better Auth)
│   └── server/               ← Express + Socket.IO API
├── packages/
│   ├── shared/               ← roles, bots, TCs, VIP helpers (build → dist)
│   └── db/                   ← Prisma schema + client + seed
├── scripts/bootstrap-owner.sh
└── docs/screenshots/
```

| Package | Name | Role |
|---------|------|------|
| `apps/web` | `@chess/web` | Next app, pages, Stockfish in browser |
| `apps/server` | `@chess/server` | REST + sockets, matchmaking |
| `packages/shared` | `@chess/shared` | Shared constants/types (must `npm run build` after edits) |
| `packages/db` | `@chess/db` | Prisma + SQLite |

**Ports:** web `3000`, API `4000`.

**Env:** root `.env.example` → copy into `.env`, `apps/web/.env.local`, `apps/server/.env`, `packages/db/.env`. DB default: `file:.../packages/db/prisma/dev.db`.

---

## Commands

```bash
pnpm install
pnpm db:push && pnpm db:seed
pnpm dev                          # web + server
pnpm --filter @chess/shared build # after editing packages/shared/src
cd apps/web && node scripts/copy-engine.mjs   # copy SF WASM into public/engines
cd apps/web && pnpm build-openings           # rebuild openings-book.json from TSV
```

Engine binaries are **gitignored** (`apps/web/public/engines/*.js|*.wasm`). They are copied from `node_modules/stockfish` via `apps/web/scripts/copy-engine.mjs` (often hooked from web `postinstall` / package scripts). Without them, analysis/bots fail in the browser.

COOP/COEP headers in `apps/web/next.config.ts` enable `SharedArrayBuffer` for multi-thread WASM (`credentialless` so API calls still work).

---

## Roles & VIP

Defined in `packages/shared/src/index.ts` + Prisma `Role` enum.

| Role | Access |
|------|--------|
| MEMBER | Play, forum, free vs computer, openings book + live SF on `/openings` |
| TOURNAMENT_HOST | Can create/run tournaments (no VIP features by itself) |
| VIP_30 / VIP_PERM | `/analysis`, `/practice`, mistake drills, host tournaments (`hasVipAccess`) |
| STA | Limited forum mod (time-limited); cannot assign roles |
| LTA+ | Can assign roles incl. Tournament Host / VIP (`/admin`) |
| OWNER | Everything; profile stats hidden |

VIP check: `hasVipAccess(role, vipExpiresAt)` in shared; web helper `apps/web/src/lib/roles.ts` (`userHasVip`).

---

## Routes (web pages)

| Path | File | Notes |
|------|------|--------|
| `/` | `app/page.tsx` | Home |
| `/play` | `app/play/page.tsx` | Queue, vs computer, challenge |
| `/watch` | `app/watch/page.tsx` | Live human games lobby → spectate `/game/[id]` |
| `/tournaments`, `/tournaments/[id]` | tournament pages | Swiss events, standings, pairings |
| `/messages`, `/messages/[id]` | messages pages | DMs inbox + thread |
| `/settings` | `app/settings/page.tsx` | Site theme + board theme |
| `/openings` | `app/openings/page.tsx` | ECO book explorer; free Analysis toggle; Book badges |
| `/game/[id]` | `app/game/[id]/page.tsx` | Live game / spectate shell → `GameBoard` |
| `/games` | `app/games/page.tsx` | History; VIP → analyze / mistakes |
| `/analysis` | `app/analysis/page.tsx` | VIP deep review (SF batch) |
| `/practice` | `app/practice/page.tsx` | VIP Practice gate → `PracticeBoard` |
| `/practice/mistakes` | `app/practice/mistakes/page.tsx` | Drill from `analysisJson` |
| `/forum`, `/forum/[slug]`, `/forum/thread/[id]` | forum pages | Categories / threads / posts |
| `/admin` | `app/admin/page.tsx` | Role assignment |
| `/login`, `/register` | auth pages | Better Auth |
| `/u/[username]`, `/leaders`, `/search` | profiles / ladder / search | |

Auth API: `app/api/auth/[...all]/route.ts` → `lib/auth.ts` + `lib/auth-client.ts`.

---

## Server (`apps/server`)

| File | Role |
|------|------|
| `src/index.ts` | Express app, CORS, socket auth, game sockets |
| `src/matchmaking.ts` | Queue by time control |
| `src/routes/games.ts` | CRUD, bot create, challenge, result, analysis cache POST |
| `src/routes/forum.ts` | Categories, threads, posts, mod |
| `src/routes/users.ts` | Profiles, leaders, search |
| `src/routes/admin.ts` | Role assign (LTA+ only; not STA) |
| `src/routes/messages.ts` | DM inbox / threads |
| `src/middleware.ts` | `requireUser` etc. |
| `src/purge.ts` | Old game cleanup (history retention) |
| `src/params.ts` | Helpers |

Bot game create encodes strength in `Game.botLevel` (see **Bot lanes** below).

---

## Shared package (`packages/shared/src/index.ts`)

Single source of truth for:

- Roles, `OWNER_USERNAME`
- `TIME_CONTROLS` (online play: 3+0, 5+0, 10+0)
- `PRACTICE_TIME_CONTROLS` (∞, increments, longer TCs)
- `BOT_PRESETS`, `PERSONALITY_BOTS`, `STOCKFISH_BOT`
- `ENGINE_ELO_MIN/MAX/FULL`, `clampEngineElo`, `formatEngineElo`
- `encodeBotLevel` / `decodeBotLevel` — how `botLevel` is stored
- `personalityThinkMs` / `engineThinkMs` / legacy `botThinkMs`
- `hasVipAccess`, forum/role helpers

**After editing shared:** rebuild (`pnpm --filter @chess/shared build`). Web aliases source in webpack but server/types often use `dist`.

---

## Bot lanes (important)

Two separate systems — do not merge casually:

### 1) Personality (`PERSONALITY_BOTS`)

- Named bots (Pebble…Oracle) with `skill`, `elo`, `style`
- Strength: Stockfish `UCI_LimitStrength` + `UCI_Elo` (Skill Level kept at 20; do **not** stack low Skill + Elo)
- Style: `chooseStyledMove` in `lib/bot-personality.ts` — light MultiPV spice within a tight cp band

### 2) Engine (`STOCKFISH_BOT`)

- UI toggle/optgroup “Stockfish”
- Settable Elo 800–2850 or **Max** (unlimited)
- MultiPV + `chooseEngineMove` — free-floats among near-equal best moves (~12cp)
- Longer think via `engineThinkMs`

### `botLevel` encoding (DB / API)

| Value | Meaning |
|-------|---------|
| 0–18 | Personality skill |
| 20 | Full Stockfish (Max) |
| 800–2850 | Stockfish at that Elo |

Helpers: `encodeBotLevel` / `decodeBotLevel`.

---

## Client Stockfish (`apps/web/src/lib/stockfish.ts`)

- Loads `/engines/stockfish-19-lite(.js|.wasm)` or `-single` if no SharedArrayBuffer
- `createStockfish({ forceSingle?: true })`
- `configure(skill, elo)` — personality path
- `configureEngine(elo, { multipv })` — engine path
- `configureCoach({ multipv, hash })` — full strength analysis
- `analyze` / `bestMove` / `analyzeFenBatch` (parallel workers for game review)
- **Search epoch** — overlapping `stop`/`analyze` must not resolve the wrong search; `dispose` resolves waiters
- Practice uses **two engines** when coaching vs bot: `playEngine` + `coachEngine` (both often `forceSingle`)

---

## Practice (VIP) — core UI

| File | Role |
|------|------|
| `components/PracticeBoard.tsx` | Main practice logic: modes, clocks, bots, coach, promo, premove, PGN |
| `components/PracticeChessBoard.tsx` | Memoized board; stable `ClassificationSquare`; multi-arrows |
| `components/MistakeDrill.tsx` | Replay mistakes from reviews |
| `lib/practice-utils.ts` | Clock format, move sounds, promotion detect |
| `lib/bot-personality.ts` | `chooseStyledMove`, `chooseEngineMove` |
| `lib/classify.ts` | Move labels (Best/Mistake/…) from eval delta |
| `lib/analysis-cache.ts` | localStorage + parse stored reviews / drill extraction |

### Practice modes

- `sandbox` — both sides
- `bot` — vs personality or Stockfish
- `coach` — vs bot + live analysis forced on

### Practice features (implemented)

- TC picker + clocks (start **after first move**); flag; increments
- Promotion picker, resign/draw/takeback, copy PGN, open `/analysis` via `sessionStorage` key `stumpchess-analyze-pgn`
- **Saves finished games** via `POST /api/games/practice` (VIP, one-shot FINISHED row) so they appear under `/games` and can feed mistake drills after review
- Premove vs bot; optional Web Audio move sounds
- Live coach: eval bar, MultiPV **candidate arrows** (within ~25cp), Best/Mistake labels after human moves
- Coach strength presets: Fast/Normal/Strong/Deep depths

### Practice invariants / anti-jank (do not regress)

1. **Never** recreate `customSquare` component type per render → remounts 64 squares. Use `ClassificationSquare` + `ClassificationSquareProvider` (`ClassificationMarker.tsx`).
2. `PracticeChessBoard` is `memo`; keep board style objects stable module-level constants.
3. Coach `onUpdate`: throttle UI (arrow-sig change or depth milestones), clear arrows on fen change, retry if `busyRef` (judge) blocked coach.
4. Bot moves: `botGen` + fen-before check; takeback/new game must `botGen++` and `playEngine.stop()`.
5. Clocks: tick in refs; `setClocks` only when **displayed second** changes (~1Hz), not every 100ms.
6. Avoid em-dash “—” and fluffy AI copy in user-facing strings (project preference).

### Generation refs in PracticeBoard

- `coachGen`, `judgeGen`, `botGen` — cancel in-flight work
- `busyRef` — judge in progress (coach must retry, not stay stale)
- `skipCoachFenRef` — fen already analyzed by judge

---

## Analysis / review

| File | Role |
|------|------|
| `app/analysis/page.tsx` | VIP PGN review; batch SF; keyboard step; save to game + localStorage |
| `lib/analysis-cache.ts` | Cache key by PGN hash; drill extractors |
| `lib/classify.ts` | Classification thresholds |

Flow: Games → Analyze → `analysisJson` on `Game` → Practice mistakes can load that JSON.

---

## Online / bot game board

| File | Role |
|------|------|
| `components/GameBoard.tsx` | Live clocks, moves, resign, bot moves, WebRTC/relay, open analysis |
| `lib/socket.ts` | Socket.IO client |

Bot games run Stockfish **in the browser** on the human client (not server-side engine).

---

## UI chrome

| File | Role |
|------|------|
| `components/Nav.tsx` | Nav links including Practice |
| `components/RoleBadge.tsx` | Role pills |
| `components/UserAvatar.tsx` | Avatar / initials; owner stump image |
| `components/EvalBar.tsx` | Vertical eval |
| `components/MoveBadge.tsx` | Classification chip |
| `components/ThemeProvider.tsx` | light/dark (`stumpchess-theme`) |
| `app/globals.css` | Design tokens, forum, roles, buttons |

Owner avatar asset: `public/avatars/tree-stump.jpg` (seed sets `image`). Fallback SVG also exists.

---

## Database (`packages/db`)

- Schema: `prisma/schema.prisma`
- Seed: `prisma/seed.ts` — forum categories + promote Owner + stump avatar path
- Important `Game` fields: `pgn`, `fen`, `isBot`, `botLevel`, `analysisJson`, `analysisDepth`, `analyzedAt`

---

## Design / copy preferences

- Prefer plain UI copy; avoid em dashes (`—`) and marketing fluff
- Frontend design: follow existing cream/green club look in `globals.css`; do not invent a new purple/AI aesthetic on branded surfaces unless asked
- Keep Practice board performant; prefer refs + throttled React state for engine streams

---

## Common tasks → where to edit

| Task | Start here |
|------|------------|
| Change personality bots / Elo tables / TCs | `packages/shared/src/index.ts` → rebuild shared |
| Practice clocks / coach / premove / promo | `PracticeBoard.tsx` |
| Board remount / arrows / markers | `PracticeChessBoard.tsx`, `ClassificationMarker.tsx` |
| Engine think / MultiPV / search races | `lib/stockfish.ts`, `lib/bot-personality.ts` |
| Move quality labels | `lib/classify.ts` |
| Game review speed / batch | `app/analysis/page.tsx`, `analyzeFenBatch` |
| VIP gate | `hasVipAccess` + page-level checks |
| Bot API level encoding | `encodeBotLevel` + `routes/games.ts` POST `/bot` |
| Matchmaking | `server/src/matchmaking.ts` |
| Copy SF into public | `apps/web/scripts/copy-engine.mjs` |
| Openings book / explorer UI | vendored TSV in `apps/web/data/chess-openings/`, `build-openings.mjs`, `lib/openings.ts`, `OpeningsExplorer.tsx` |

---

## Pitfalls checklist

- [ ] Edited `@chess/shared`? Rebuild it.
- [ ] Engines missing locally? Run `copy-engine.mjs`.
- [ ] WASM multi-thread needs COOP/COEP (`next.config.ts`).
- [ ] Do not recreate `customSquare` inline.
- [ ] Do not stack low Skill Level on top of UCI_Elo for “Elo accuracy.”
- [ ] Personality vs Stockfish are separate lanes.
- [ ] Practice clocks must not run before first move.
- [ ] Cancel bot/coach gens on takeback / new game / unmount.
- [ ] Never commit `.env`, `*.db`, or large `public/engines/*.wasm` (gitignored).
- [ ] Openings explorer must stay offline (vendored ECO book). Do not call Lichess explorer APIs.

---

## Openings explorer

| File | Role |
|------|------|
| `apps/web/data/chess-openings/*.tsv` | Vendored lichess-org/chess-openings (CC0) |
| `apps/web/scripts/build-openings.mjs` | TSV → `src/data/openings-book.json` trie |
| `apps/web/src/lib/openings.ts` | Lookup / children / roots |
| `components/OpeningsExplorer.tsx` | Board + book table + Analysis toggle + Book badges |
| `components/BookMoveBadge.tsx` | Green Book move chip |
| `app/openings/page.tsx` | Route (browse + live SF free; deep `/analysis` still VIP) |

“Popularity” bars = book-line coverage counts, not live win rates. Live Analysis uses client Stockfish (same as Practice coach); do not call `stop()` in the fen-effect cleanup or searches race.

## Spectating / anti-cheat

- Non-participants on an ACTIVE human game are spectators (read-only board).
- No Stockfish / eval / Analysis during live spectating.
- Analyze is allowed only after `FINISHED` (existing VIP `/analysis`).
- Human moves always go through socket relay (even if WebRTC is up) so spectators + DB stay synced.

## Deferred / not shipped

- Full rated puzzle bank (mistake drills are the current “puzzle-like” loop)
- Payment for VIP (admin-assigned only)
- Live master/Lichess win-rate explorer stats
- Activity badges / richer arena formats
- Rated puzzle bank; paid VIP

---

## Suggested new-chat opener

> Read `AGENTS.md` first, then help with: \<task\>.

That alone should load architecture + file map without pasting chat history.

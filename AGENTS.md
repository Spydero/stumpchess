# stumpchess — agent / AI handoff

Read this first in a **new chat**. It maps the monorepo, features, file roles, invariants, and known pitfalls so you do not re-discover the architecture from scratch.

Human-facing overview: [`README.md`](README.md). This file is for agents.

---

## What this product is

**stumpchess** — small club chess site:

- Online play (matchmaking + challenges + WebRTC with socket relay fallback)
- **Watch** live human games (chess.com-style: find any player via search / DMs / profile `?u=`, or browse all live; spectators: no engine during play)
- **Tournaments** (Swiss): public or private (invite whitelist); optional rating gates; host with VIP+ or `TOURNAMENT_HOST`
- Club **Glicko ratings** (bullet / blitz / rapid pools, provisional `?`)
- Direct **Messages** between users
- Board themes in **Settings** (plus site light/dark)
- vs Computer (personality bots + Stockfish engine lane)
- **Openings explorer** (`/openings`) from a local ECO book (no external explorer API)
- Classic **forum** (authors edit posts; STA+ delete only)
- **VIP**: deep game review (`/analysis`), Practice (`/practice`), mistake drills (replay wrong move, then fix)
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
│   ├── shared/               ← roles, bots, TCs, VIP, Glicko helpers (build → dist)
│   └── db/                   ← Prisma schema + client + seed
├── scripts/bootstrap-owner.sh
└── docs/screenshots/
```

| Package | Name | Role |
|---------|------|------|
| `apps/web` | `@chess/web` | Next app, pages, Stockfish in browser |
| `apps/server` | `@chess/server` | REST + sockets, matchmaking, ratings |
| `packages/shared` | `@chess/shared` | Shared constants/types (must rebuild after edits) |
| `packages/db` | `@chess/db` | Prisma + SQLite |

**Ports:** web `3000`, API `4000`.

**Env:** root `.env.example` → copy into `.env`, `apps/web/.env.local`, `apps/server/.env`, `packages/db/.env`. DB default: `file:.../packages/db/prisma/dev.db`.

**Stack notes:** Next **15.5.x** with `next dev --turbopack`. Turbopack `@chess/shared` alias must be a **path relative to `apps/web`** (absolute paths break as `./Users/...`).

---

## Commands

```bash
pnpm install
pnpm db:push && pnpm db:seed
pnpm dev                          # web (Turbopack) + server
pnpm --filter @chess/shared build # after editing packages/shared/src
cd apps/web && node scripts/copy-engine.mjs   # copy SF WASM into public/engines
cd apps/web && pnpm build-openings           # rebuild openings-book.json from TSV
```

Engine binaries are **gitignored** (`apps/web/public/engines/*.js|*.wasm`). They are copied from `node_modules/stockfish` via `apps/web/scripts/copy-engine.mjs` (often hooked from web `postinstall` / package scripts). Without them, analysis/bots fail in the browser.

COOP/COEP headers in `apps/web/next.config.ts` enable `SharedArrayBuffer` for multi-thread WASM (`credentialless` so API calls still work).

---

## Roles & VIP

Defined in `packages/shared/src/index.ts` + Prisma `Role` enum.

| Role | Badge label (UI) | Access |
|------|------------------|--------|
| MEMBER | (hidden) | Play, forum, free vs computer, openings book + live SF on `/openings` |
| TOURNAMENT_HOST | Tournament Host | Can create/run tournaments (no VIP features by itself) |
| VIP_30 | VIP (30 days) | Yellow badge; `/analysis`, `/practice`, drills, host tournaments |
| VIP_PERM | VIP (Permanent) | Yellow badge; same VIP access |
| STA | Short Term Admin | Forum mod (time-limited); cannot assign roles; can delete forum posts |
| LTA | Long Term Admin | Assign roles incl. Tournament Host / VIP (`/admin`) |
| MANAGER | Manager | Site manage + assign |
| OWNER | Owner (green badge) | Everything; profile stats hidden |

VIP check: `hasVipAccess(role, vipExpiresAt)` in shared; web helper `apps/web/src/lib/roles.ts` (`userHasVip`).

**Role badges:** `components/RoleBadge.tsx` shows **full** `ROLE_LABEL` strings (not LTA/STA abbreviations). Colors in `globals.css` (`--role-vip*`, `--role-owner` green).

---

## Routes (web pages)

| Path | File | Notes |
|------|------|--------|
| `/` | `app/page.tsx` | Home |
| `/play` | `app/play/page.tsx` | Queue, vs computer, challenge |
| `/watch` | `app/watch/page.tsx` | Live lobby + player filter (`?u=username`); CTAs from profile / DMs / search → spectate `/game/[id]` |
| `/tournaments`, `/tournaments/[id]` | tournament pages | Swiss; public/private + invites; rating gates; signature soft-poll |
| `/messages`, `/messages/[id]` | messages pages | DMs inbox + thread (**Watch** CTAs) |
| `/settings` | `app/settings/page.tsx` | Site theme + board theme |
| `/openings` | `app/openings/page.tsx` | ECO book explorer; free Analysis toggle; Book badges |
| `/game/[id]` | `app/game/[id]/page.tsx` | Live game / spectate shell → `GameBoard` |
| `/games` | `app/games/page.tsx` | History; VIP → analyze / mistakes |
| `/analysis` | `app/analysis/page.tsx` | VIP deep review (SF batch) |
| `/practice` | `app/practice/page.tsx` | VIP Practice gate → `PracticeBoard` |
| `/practice/mistakes` | `app/practice/mistakes/page.tsx` | Drill from `analysisJson` (replay mistake → solve) |
| `/forum`, `/forum/[slug]`, `/forum/thread/[id]` | forum pages | Edit own posts; STA+ delete |
| `/admin` | `app/admin/page.tsx` | Role assignment (full labels in select) |
| `/login`, `/register` | auth pages | Better Auth |
| `/u/[username]`, `/leaders`, `/search` | profiles / ladder / search | Ratings on profile + leaders (pool tabs) |

Auth API: `app/api/auth/[...all]/route.ts` → `lib/auth.ts` + `lib/auth-client.ts`.

---

## Server (`apps/server`)

| File | Role |
|------|------|
| `src/index.ts` | Express app, CORS, socket auth, game sockets; calls `applyRatedGameResult` on finish |
| `src/matchmaking.ts` | Queue by time control |
| `src/routes/games.ts` | CRUD, bot create, challenge, result, practice save, analysis cache |
| `src/routes/forum.ts` | Categories, threads, posts; `PATCH /posts/:id` (author/STA+); `DELETE` STA+ only |
| `src/routes/users.ts` | Profiles, leaders (by rating), search; includes Glicko fields |
| `src/routes/admin.ts` | Role assign (LTA+ only; not STA) |
| `src/routes/messages.ts` | DM inbox / threads |
| `src/routes/tournaments.ts` | Swiss create/join/start/rounds; privacy + invites + rating gates; host `PATCH` while OPEN |
| `src/elo.ts` | `applyRatedGameResult` (Glicko per pool) |
| `src/invites.ts` | Tournament invite username parse/match |
| `src/tournament-score.ts` | Swiss standings updates from game results |
| `src/middleware.ts` | `requireUser` etc. |
| `src/purge.ts` | Old game cleanup (history retention) |
| `src/params.ts` | Helpers |

Bot game create encodes strength in `Game.botLevel` (see **Bot lanes** below).

---

## Shared package

| File | Role |
|------|------|
| `packages/shared/src/index.ts` | Roles, TCs, bots, VIP, botLevel encode |
| `packages/shared/src/rating.ts` | Glicko math, pools, provisional helpers (re-exported from index) |

Also: `TIME_CONTROLS` kinds follow chess.com pools (`3+0`/`5+0` = blitz, `10+0` = rapid).

**After editing shared:** rebuild (`pnpm --filter @chess/shared build`). Web aliases source in webpack/turbopack; server often uses `dist`.

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
| `components/MistakeDrill.tsx` | Mistake drills: **replay bad move → then solve** |
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
- Coach strength: depth slider (8–22) + Fast/Normal/Strong/Deep presets; TC-aware Recommended; persisted in `localStorage`

### Mistake drills (`MistakeDrill.tsx`)

1. **Replay phase:** show `fenBefore`, animate the played mistake (`san`) with classification tint/arrow  
2. **Solve phase:** rewind to `fenBefore`; user finds better move (`bestMove`)  
3. Reveal / Skip / Replay mistake; score solved vs missed  

Do not regress to “puzzle-only” (skipping the mistake replay).

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
| `components/GameBoard.tsx` | Live clocks (~1Hz UI), moves, resign, bot moves, WebRTC/relay, open analysis |
| `lib/socket.ts` | Socket.IO client |

Bot games run Stockfish **in the browser** on the human client (not server-side engine).

---

## Tournaments

| Concern | Detail |
|---------|--------|
| Format | Swiss; host starts rounds; bye if odd |
| Host | VIP or `TOURNAMENT_HOST` (`canHostTournament`) |
| Visibility | `isPrivate` + `inviteUsernames` JSON whitelist (host always allowed) |
| Rating gates | Optional `minRating` / `maxRating` against **event TC pool** rating |
| Live UI | Soft poll with content signature (OPEN ~3s, RUNNING ~5s); no `setState` if unchanged; host invite form not overwritten while typing |
| API | `GET/POST /api/tournaments`, `PATCH /:id` (host, OPEN only), join/leave/start/next-round/finish/cancel |

---

## Forum

| Action | Who |
|--------|-----|
| Create thread / reply | Signed-in users (unless locked) |
| Edit post | Author or STA+ (`PATCH /api/forum/posts/:id`); locked thread → STA+ only |
| Delete post | **STA+ only** (not authors); deleting last post removes thread |
| Lock thread | STA+ |

UI: `app/forum/thread/[id]/page.tsx` (Edit / Delete buttons accordingly).

---

## Club ratings (Glicko)

Chess.com-inspired pools in `packages/shared/src/rating.ts`:

- Pools: **bullet** (under 3m), **blitz** (3 to under 10m), **rapid** (10m+)
- Start **1200** with RD **350**; updates on finished **human vs human** games only (not bots)
- Provisional shown with `?` until 20 games and RD under 110 (`formatClubRating`)
- User fields: `ratingBullet/Blitz/Rapid`, `rd*`, `games*`, overall `rating` + `ratedGames`
- Server apply: `apps/server/src/elo.ts` → `applyRatedGameResult({ timeControl, ... })`
- UI: profile shows three pools; `/leaders` has Blitz/Rapid/Bullet tabs; tournament standings show pool rating for that TC

---

## Spectating / Watch / anti-cheat

- Non-participants on an ACTIVE human game are spectators (read-only board).
- No Stockfish / eval / Analysis during live spectating.
- Analyze is allowed only after `FINISHED` (existing VIP `/analysis`).
- Human moves always go through socket relay (even if WebRTC is up) so spectators + DB stay synced.
- **Watch any player:** `GET /api/games/live?username=` (case-insensitive); profile returns `liveGames`; entry points `/watch?u=`, profile **Watch games**, DM thread / inbox **Watch**, search **Watch**. Soft poll (~10–12s) + `liveSig` / `profileSig` so unchanged payloads do not re-render.

---

## UI chrome

| File | Role |
|------|------|
| `components/Nav.tsx` | Nav links including Practice |
| `components/RoleBadge.tsx` | Full role labels + theme colors |
| `components/UserAvatar.tsx` | Avatar / initials; owner stump image |
| `components/EvalBar.tsx` | Vertical eval |
| `components/MoveBadge.tsx` | Classification chip |
| `components/ThemeProvider.tsx` | light/dark (`stumpchess-theme`) |
| `app/globals.css` | Design tokens, forum, roles, buttons |
| `app/loading.tsx` | Instant nav feedback under Turbopack compiles |

Owner avatar asset: `public/avatars/tree-stump.jpg` (seed sets `image`). Fallback SVG also exists.

---

## Database (`packages/db`)

- Schema: `prisma/schema.prisma`
- Seed: `prisma/seed.ts` — forum categories + promote Owner + stump avatar path
- Important `Game` fields: `pgn`, `fen`, `isBot`, `botLevel`, `analysisJson`, `analysisDepth`, `analyzedAt`
- Important `User` rating fields: `rating`, `ratedGames`, `ratingBullet/Blitz/Rapid`, `rd*`, `games*`
- Important `Tournament` fields: `isPrivate`, `inviteUsernames`, `minRating`, `maxRating`

After schema edits: `pnpm db:push` (and restart API).

---

## Design / copy preferences

- Prefer plain UI copy; avoid em dashes (`—`) and marketing fluff
- Frontend design: follow existing cream/green club look in `globals.css`; do not invent a new purple/AI aesthetic on branded surfaces unless asked
- Keep Practice board performant; prefer refs + throttled React state for engine streams
- Soft-polled lists (Watch, profile live, tournaments): **content signature** before `setState`

---

## Common tasks → where to edit

| Task | Start here |
|------|------------|
| Change personality bots / Elo tables / TCs | `packages/shared/src/index.ts` → rebuild shared |
| Club Glicko / provisional rules | `packages/shared/src/rating.ts` + `server/src/elo.ts` |
| Practice clocks / coach / premove / promo | `PracticeBoard.tsx` |
| Mistake drill replay/solve UX | `MistakeDrill.tsx` |
| Board remount / arrows / markers | `PracticeChessBoard.tsx`, `ClassificationMarker.tsx` |
| Engine think / MultiPV / search races | `lib/stockfish.ts`, `lib/bot-personality.ts` |
| Move quality labels | `lib/classify.ts` |
| Game review speed / batch | `app/analysis/page.tsx`, `analyzeFenBatch` |
| VIP gate | `hasVipAccess` + page-level checks |
| Role badge labels/colors | `RoleBadge.tsx`, `ROLE_LABEL`, `globals.css` |
| Bot API level encoding | `encodeBotLevel` + `routes/games.ts` POST `/bot` |
| Matchmaking | `server/src/matchmaking.ts` |
| Tournaments privacy / invites / Elo gates | `routes/tournaments.ts`, `tournaments/*.tsx`, `invites.ts` |
| Forum edit/delete | `routes/forum.ts`, `forum/thread/[id]/page.tsx` |
| Watch player find | `routes/games.ts` live, `watch/page.tsx`, profile/DM/search CTAs |
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
- [ ] Watch / profile / tournament live lists: poll with a content signature; never `setState` when unchanged.
- [ ] Game / Practice clocks: tick refs often, `setClocks` only when the displayed second changes (~1Hz).
- [ ] Turbopack `resolveAlias` for `@chess/shared` must be **relative** to `apps/web`.
- [ ] Forum delete is staff-only; do not re-open author self-delete.
- [ ] Mistake drills must replay the bad move before the solve phase.
- [ ] Rated games: pass `timeControl` into `applyRatedGameResult`; skip bots.

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

---

## Deferred / not shipped

- Full rated puzzle bank (mistake drills from your own reviews are the current loop)
- Payment for VIP (admin-assigned only)
- Live master/Lichess win-rate explorer stats
- Activity badges / richer arena formats
- True Glicko-2 volatility / long inactivity RD schedules (current is Glicko-1 style per game)

---

## Suggested new-chat opener

> Read `AGENTS.md` first, then help with: \<task\>.

That alone should load architecture + file map without pasting chat history.

# stumpchess

Lightweight chess platform: random matchmaking, live spectating, DMs, board themes, openings explorer (local ECO book), classic forum, roles (VIP / STA / LTA / Manager / Owner), and **VIP-only** full analysis powered by Stockfish in the browser.

## Stack

- Next.js (Better Auth)
- Express + Socket.IO (matchmaking, WebRTC signaling, relay fallback)
- Prisma + **PostgreSQL**
- Client-side Stockfish (analysis + bots)

## Quick start

```bash
cp .env.example .env
# also copy DATABASE_URL / auth secrets into apps/web/.env.local, apps/server/.env, packages/db/.env

# Postgres (pick one):
pnpm db:up   # Docker Compose → postgresql://stumpchess:stumpchess@localhost:5432/stumpchess
# or: brew services start postgresql@18 && createdb stumpchess
#     then set DATABASE_URL=postgresql://localhost:5432/stumpchess

pnpm install
pnpm db:push
pnpm db:seed
pnpm dev
```

Then in another terminal (with web running):

```bash
./scripts/bootstrap-owner.sh
```

- Web: http://localhost:3000  
- API: http://localhost:4000  

### Owner

- Username: `jOjo`
- Email: `jojo@local.dev`
- Password: `OwnerChangeMe123!`
- Tree-stump avatar; public stats hidden

### Screenshots

See [`docs/screenshots/`](docs/screenshots/):

| File | Page |
|------|------|
| `01-home.png` | Home |
| `02-login.png` | Login |
| `03-play.png` | Play |
| `04-analysis-vip.png` | Game Review |
| `05-forum.png` | Forum |
| `06-owner-profile.png` | Owner profile (`/u/jOjo`) |
| `07-admin.png` | Admin (open vs VIP-only features) |
| `08-practice.png` | Practice |

### Owner login

1. Start Postgres + apps (`pnpm db:up` or local Postgres, then `pnpm db:push && pnpm db:seed && pnpm dev`).
2. Open http://localhost:3000/login
3. Email: `jojo@local.dev` · Password: `OwnerChangeMe123!` · Username: `jOjo`

`pnpm db:seed` creates the Owner **in the database** (User + credential password hash). No web signup required.

```bash
pnpm db:ensure-owner                 # create / promote Owner
OWNER_RESET_PASSWORD=1 pnpm db:seed  # or: pnpm db:reset-owner-password
```

Promote an existing account to Owner with SQL only (role; does not set password):

```bash
psql "$DATABASE_URL" -f scripts/promote-owner.sql
```

Optional web bootstrap (signup API + seed) if you prefer:

```bash
./scripts/bootstrap-owner.sh
```

## Google link (optional)

Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env` / `apps/web/.env.local`.

## Roles

| Role | Notes |
|------|--------|
| Member | Play, forum, search, bots, openings explorer (book + live SF) |
| Tournament Host | Create/run Swiss tournaments |
| VIP 30 / VIP Permanent | Full game analysis, Practice, mistake drills, host tournaments (also open to all members when LTA+ leaves site features open; default) |
| STA (red, 28d) | Limited forum mod |
| LTA (blue) | Assign VIP/STA |
| Manager | High staff |
| Owner (`jOjo`) | All; public stats hidden |

## Watch / Tournaments / Messages / Settings

- **`/watch`**: live human games; spectate with no engine during play.
- **`/tournaments`**: Swiss events. Hosts: VIP+ or Tournament Host (LTA+ assigns).
- **`/messages`**: direct messages (also Message on profiles).
- **`/settings`**: site light/dark + Chess.com-style board themes (local device).

## Openings

- **`/openings`**: offline explorer from vendored [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings) (CC0). Rebuild with `pnpm --filter @chess/web build-openings`.
- Book browsing and live Stockfish on the explorer board are free; deep review stays on VIP `/analysis`.

## VIP Practice

- **`/practice`**: both sides, vs bot, or coach (`?mode=coach`) with live eval and move labels.
- **`/practice/mistakes`**: drill mistakes from a saved review (`analysisJson`).

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

See [`docs/screenshots/`](docs/screenshots/) for home, login, play, VIP analysis, forum, Owner profile.

## Google link (optional)

Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env` / `apps/web/.env.local`.

## Roles

| Role | Notes |
|------|--------|
| Member | Play, forum, search, bots, openings explorer (book + live SF) |
| Tournament Host | Create/run Swiss tournaments |
| VIP 30 / VIP Permanent | Full game analysis, Practice, mistake drills, host tournaments |
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

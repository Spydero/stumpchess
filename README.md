# stumpchess

Lightweight chess platform: random matchmaking, classic forum, roles (VIP / STA / LTA / Manager / Owner), and **VIP-only** full analysis powered by Stockfish in the browser.

## Stack

- Next.js (Better Auth)
- Express + Socket.IO (matchmaking, WebRTC signaling, relay fallback)
- Prisma + SQLite (local). Swap `DATABASE_URL` to Postgres for deploy.
- Client-side Stockfish (analysis + bots)

## Quick start

```bash
cp .env.example .env
# also copy DATABASE_URL / auth secrets into apps/web/.env.local and apps/server/.env
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
| Member | Play, forum, search, bots |
| VIP 30 / VIP Permanent | Full analysis, Practice (coach / both sides), mistake drills |
| STA (red, 28d) | Limited forum mod |
| LTA (blue) | Assign VIP/STA |
| Manager | High staff |
| Owner (`jOjo`) | All; public stats hidden |

## VIP Practice

- **`/practice`**: both sides, vs bot, or coach (`?mode=coach`) with live eval and move labels.
- **`/practice/mistakes`**: drill mistakes from a saved review (`analysisJson`).

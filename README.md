# stumpchess

Lightweight chess platform: random matchmaking, classic forum, roles (VIP / STA / LTA / Manager / Owner), and **VIP-only** full analysis powered by Stockfish in the browser.

## Stack

- Next.js (Better Auth)
- Express + Socket.IO (matchmaking, WebRTC signaling, relay fallback)
- Prisma + SQLite (local) — swap `DATABASE_URL` to Postgres for deploy
- Client-side Stockfish (analysis + bots)

## Quick start

```bash
pnpm install
pnpm db:push
pnpm db:seed
pnpm dev
```

- Web: http://localhost:3000  
- API: http://localhost:4000  

### Owner (seeded)

- Username: `jOjo`
- Email: `jojo@local.dev`
- Password: `OwnerChangeMe123!`

## Google link (optional)

Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env` / `apps/web/.env.local`.

## Roles

| Role | Notes |
|------|--------|
| Member | Play, forum, search, bots |
| VIP 30 / VIP Permanent | Full analysis |
| STA (red, 28d) | Limited forum mod |
| LTA (blue) | Assign VIP/STA |
| Manager | High staff |
| Owner (`jOjo`) | All; public stats hidden |

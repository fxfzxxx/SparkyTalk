# SparkyTalk

AI-first job management for New Zealand electricians. Product direction and design
decisions live in [CLAUDE.md](CLAUDE.md).

## Layout

| Path | What | Deploys to |
|---|---|---|
| `apps/api` | Hono + Drizzle + Postgres API | Railway |
| `apps/admin` | Next.js owner dashboard | Netlify |
| `apps/mobile` | Expo app for workers/owners | EAS Build → App Store / Play |
| `packages/shared` | zod schemas, types, API client, NZ date helpers | — |
| `packages/ai` | Claude prompts and calls (command parsing, blueprint extraction) | — |

## Local setup

Requires Node 22+, pnpm 10 and a Postgres database.

```bash
pnpm install
cp .env.example apps/api/.env          # fill in DATABASE_URL and ANTHROPIC_API_KEY
pnpm db:migrate
pnpm --filter @sparkytalk/api db:seed  # demo users: admin (owner), worker1, worker2
pnpm dev                               # api :8787, admin :3000, Expo
```

Until real auth is chosen, the API runs with `AUTH_MODE=dev`: clients send a username
(`admin`, `worker1`, `worker2`) or employee id in the `x-dev-user-id` header. Type the username
into the admin top bar or the mobile 「我」 tab.
The API refuses to start with `AUTH_MODE=dev` when `NODE_ENV=production`.

Checks: `pnpm typecheck` and `pnpm test`.

## Deploying

- **Railway (api):** create a service from this repo with the root directory left at the repo
  root and the config file path set to `apps/api/railway.json`. Add a Postgres plugin and set
  `DATABASE_URL`, `ANTHROPIC_API_KEY`, `CORS_ORIGINS` (the Netlify URL). Migrations run as the
  pre-deploy step.
- **Netlify (admin):** set the base directory to `apps/admin`; `netlify.toml` holds the build
  command. Set `NEXT_PUBLIC_API_URL` to the Railway URL.
- **Mobile:** set `EXPO_PUBLIC_API_URL` and build with EAS.

## Database changes

Edit `apps/api/src/db/schema.ts`, then `pnpm db:generate` to write a migration into
`apps/api/drizzle/` and commit it.

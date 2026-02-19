# marginalia

Built with [mikstack](https://github.com/mikaelsiidorow/mikstack).

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) (for local Postgres)
- Node.js 22+

## Getting Started

```bash
bun run db:start
bun run db:push
bun run db:seed
bun run dev
```

## Scripts

- `bun run dev` — Start dev server
- `bun run build` — Build for production
- `bun run preview` — Preview production build
- `bun run check` — Run svelte-check
- `bun run lint` — Lint with ESLint
- `bun run format` — Format with Prettier
- `bun run db:start` — Start Postgres (Docker)
- `bun run db:generate` — Generate Drizzle migrations
- `bun run db:migrate` — Run Drizzle migrations
- `bun run db:push` — Push schema to database
- `bun run db:studio` — Open Drizzle Studio
- `bun run db:seed` — Seed the database

# Commands

## Local (this repo)

```bash
cp .env.example .env
docker compose up --build
curl http://localhost:8080/health
make test
```

Backend on host:

```bash
cd backend && uv sync --frozen --extra dev
uv run pytest
uv run ruff check .
uv run ruff format --check .
```

Island: `cd chudiki && pnpm dev` (Vite `:5178`). CRM: `cd crm && pnpm dev` (`:5175`).

Chudiki Vite proxy has defaulted to `:8010` in places while docs say `:8000` — read `chudiki/vite.config.ts` before assuming.

## Commercial site (`zoofun-web`)

```bash
cd /Volumes/Siska/DEVELOP/zoofun-web
pnpm install --frozen-lockfile
pnpm dev
pnpm typecheck && pnpm lint && pnpm test
```

Needs API on 8000 and island on 5178 for auth → play.

## Serena

`serena memories check` from `/Volumes/Siska/DEVELOP/zoofun`.

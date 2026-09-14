# Tech stack

## This repo

- Backend: Python 3.13, FastAPI, SQLAlchemy async + Alembic, Postgres, Redis, Celery. `uv` + `backend/pyproject.toml`. App: `backend/app/`.
- Island: Vite 5, React 18, TypeScript, Three.js. `chudiki/`. Dev `:5178`. Prod nginx static `/island/` (`VITE_BASE=/island/`).
- CRM: Vue 3, PrimeVue, Pinia, Vite. `crm/`. Dev `:5175`. Prod static `/opt/zoofun-crm/dist`.
- Unity 6.3 LTS + URP in `client/VirtualZoo` — not the commercial path. Serena does not index `client/`.
- Infra: Caddy (not nginx at the public edge). Compose: `compose.yaml` (local), `compose.pilot.yaml` (API/worker/island/backup).

## Commercial site (`zoofun-web`)

- Next.js 16, React 19, pnpm. This is `zooo.fun`. `next start` on `:3000` (not standalone output). Rewrites `/api/zoo/*` → `ZOO_API_ORIGIN`.

## Providers (backend-only)

OpenRouter (Flux.2 Pro stills, Gemini profile/moderation). Tripo 3.0 → Tripo 2.5 → Meshy 7. T-Bank acquiring. Mail.ru SMTP `info@zooo.fun`. Yandex ID. Timeweb S3 optional (`STORAGE_BACKEND`).

Clients never hold provider, T-Bank, SMTP, or operator secrets.

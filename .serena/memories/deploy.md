# Deploy

No GitHub Actions. No versioned systemd units. Deploy is host-side, from the machine that has the current tree.

Two VPS roles (IPs stay out of memories):
1. RF edge — TLS, Caddy `infra/Caddyfile.rf-edge`, Postgres on localhost.
2. App host — API `:8000`, Celery worker+beat, island `:8081`, Next `:3000`, CRM static. Caddy `infra/Caddyfile.zooo.fun`. App reaches RF Postgres via SSH tunnel (`DATABASE_URL`).

`zooo.fun` is the commercial site (`zoofun-web` on `:3000`). `/staff` `/v1` `/health` `/api/zoo` → API; `/island*` → island; `/landing/*.mp4` `/mail*` → `/opt/zoofun-web/public`; else Next. `www` → apex. `crm.zooo.fun` → CRM dist + `/v1` API.

`compose.pilot.yaml` is API/worker/island/backup. It is **not** the Next process. `Caddyfile.pilot` expects a `web` service that does not exist in that compose — ignore it as live truth.

Alembic applies on API startup. Nightly `pg_dump` in the backup service.

Remote git has lagged the live tree. Production on the servers is the product truth until a single `main` is reconciled. Do not revert local/prod to origin.

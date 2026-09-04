# ZOOFUN CRM

Read-only metrics UI at `crm.zooo.fun`. Visual shell follows the kid/MIO CRM. Writes stay in `/staff`.

```bash
cd crm
pnpm install
pnpm dev
```

Login uses `OPERATOR_LOGIN` / `OPERATOR_PASSWORD` from the repo `.env`.
Local defaults: `admin` / `garden-secret`. Dev API proxy: `http://127.0.0.1:8080` (Caddy → API).

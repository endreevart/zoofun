# Task completion

Match the area you touched. Do not claim done on compile/lint alone.

## Backend

```bash
cd backend && uv run pytest && uv run ruff check .
```

If models/migrations changed: Alembic revision present; API `init_schema` still applies head.

## Island

```bash
cd chudiki && pnpm typecheck
```

Run nearby `*.test.ts` if the module has one. Phone/Safari paths: `chudiki/src/game/render/quality.ts` — do not ship a desktop-only composer setting.

## CRM

```bash
cd crm && pnpm typecheck && pnpm build
```

## Commercial site (`zoofun-web`)

```bash
pnpm typecheck && pnpm lint && pnpm test
```

E2E only when auth/pricing/landing flow changed: `pnpm test:e2e`.

## Docs

If the contract or a decision changed, update `docs/DECISIONS.md` / ADR and `docs/WORKING_STATE.md`. Secrets stay out of git and memories.

# ADR-0007: PostgreSQL ledger, Alembic, SQLAdmin

- Status: accepted
- Date: 2026-09-03
- Relates to: ADR-0002, ADR-0006

## Context

Parent accounts and the purchase ledger started in JSON because the first web slice needed a working login faster than a migration. That does not survive tens of thousands of families: no transactions, no indexes, no schema history, and no admin that can edit rows safely.

50 000 parents is still one modular monolith. It is not a reason for Kubernetes, a second write path, or a CRM that also mutates credits.

## Decision

1. PostgreSQL is the source of truth for parents, children, creatures, packs, payments, and sessions.
2. Schema changes go through Alembic. The API applies `upgrade head` on startup. `create_all` is not a production path.
3. Credit reserve, refund, operator grants, and T-Bank settlement take a row lock and commit in one transaction. A repeated CONFIRMED webhook must not add credits twice.
4. The API process uses a bounded connection pool with `pool_pre_ping`.
5. List endpoints for operators are capped. Full CRUD is SQLAdmin at `/staff`.
6. A later CRM may read the same tables for charts. It does not become a second ledger.
7. Redis stays the Celery broker. Sessions stay in PostgreSQL until a measured need says otherwise.

## Consequences

- One-time JSON import runs only when the parents table is empty.
- Adding a column requires a new Alembic revision.
- `/health` fails if the database does not answer.
- Horizontal scale is more API/worker replicas against the same Postgres, not a new service per feature.

## Rejected alternatives

- Keep JSON and add a file lock: rejected; no indexes, no admin, no concurrent credits.
- Django + Django admin: rejected; the runtime is FastAPI, SQLAdmin covers the same job.
- Directus / Forest / Retool: rejected; extra vendor on the child-data path.
- Microservices or a separate payments service: rejected; the ledger is a few tables in one database.

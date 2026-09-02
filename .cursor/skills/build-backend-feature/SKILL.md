---
name: build-backend-feature
description: Implements one backend vertical slice for Virtual Zoo (jobs, health, persistence). Use when adding FastAPI/Celery/Postgres work without payments or live provider calls unless the iteration explicitly requires them.
disable-model-invocation: true
---

# Build backend vertical slice

## Instructions

1. Read `docs/ARCHITECTURE.md`, `docs/SECURITY_AND_PRIVACY.md`, and `backend/README.md`.
2. Implement only the requested slice. Keep the modular monolith; do not split microservices.
3. Introduce Alembic with the first persisted schema and commit every migration.
4. Jobs must be asynchronous, idempotent, retryable, and observable. Persist state transitions.
5. Do not call OpenRouter or ElevenLabs unless the iteration explicitly includes a pinned adapter plus tests.
6. Do not add payments, subscriptions, StoreKit, acquiring, creation credits, receipts, or a purchase ledger during the current pilot.

## Verification

```bash
uv run pytest
uv run ruff check .
uv run ruff format --check .
```

Run Docker health checks when Docker Desktop is available. If it is not, record `DOCKER_RUNTIME_NOT_RUN` and do not invent results.

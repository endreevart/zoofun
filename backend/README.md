# Virtual Zoo backend

This is a deliberately small bootable foundation, not the finished API.

It establishes:

- FastAPI application and health endpoint;
- typed settings loaded from environment;
- Celery worker wired to Redis;
- test and lint configuration;
- Docker image shared by API and worker.

For local Python work, install dependencies from the committed lock first:

```bash
uv sync --frozen --extra dev
uv run pytest
```

A fresh checkout or archive will not run tests until `uv sync --frozen --extra dev` has created the environment.

`uv.lock` is committed. The Docker image installs from that lock; build production images with `--build-arg INSTALL_DEV=false`.

Local drawing stylize (chudiki → this API → OpenRouter):

```bash
# in backend/, with OPENROUTER_API_KEY in an untracked .env
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

`POST /v1/generation/stylize` accepts a PNG/JPEG. The key never goes to the browser. If the key is missing the route returns 503 and the zoo keeps the child's original drawing.

Parent email login for the public website:

```text
POST /v1/auth/register
POST /v1/auth/login
GET  /v1/auth/me
POST /v1/auth/logout
```

Accounts persist in untracked `backend/.data/accounts.json`. Passwords are hashed. A child record holds only a nickname derived from the email local-part, never a legal name.

Add further product modules according to `docs/ARCHITECTURE.md`. Introduce Alembic with the first persisted schema and commit every migration.

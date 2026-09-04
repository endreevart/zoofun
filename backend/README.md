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

If the API host cannot reach OpenRouter (typical for a server in RU), set `OPENROUTER_HTTP_PROXY` to an EU/US HTTP proxy. The adapter sends provider traffic through that proxy; the Unity and website clients never see it.

Parent email login for the public website:

```text
POST /v1/auth/register
POST /v1/auth/login
GET  /v1/auth/me
POST /v1/auth/logout
```

Accounts persist in PostgreSQL (local default is `backend/.data/zoo.sqlite`). Schema changes go through Alembic (`uv run alembic upgrade head`). Passwords are hashed. A child record holds only a nickname derived from the email local-part, never a legal name. Operator CRUD is SQLAdmin at `/staff`.

Family zoo (the child's own drawings) for a signed-in child:

```text
GET    /v1/zoo
PUT    /v1/zoo
PUT    /v1/zoo/creatures/{id}
DELETE /v1/zoo/creatures/{id}
```

Voice recordings are not accepted. Without a session the island keeps using on-device IndexedDB only.

Add further product modules according to `docs/ARCHITECTURE.md`. Commit an Alembic revision with every schema change.

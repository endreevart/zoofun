# Iteration 00 — bootstrap report (rework)

## Status

`READY_FOR_REVIEW`

External reviewer previously returned `REWORK`. This report covers the rework of those findings only. Unity and iteration 01 were not started.

## Absolute project path

`/Volumes/Siska/DEVELOP/zoofun`

## Rework fixes

1. **Docker tests.** `Makefile` `test` now runs `docker compose run --rm api python -m pytest` instead of the `pytest` executable. `docs/SETUP.md` matches. No `PYTHONPATH` workaround was added.
2. **Host tests.** Verified in a fresh temp copy of `backend/` with no pre-existing `.venv`, starting from `uv sync --frozen --extra dev`. A lone `uv run pytest` is not claimed to work on a fresh archive without that sync.
3. **Scope.** Active requirements now describe a non-commercial pilot for ≤10 children: no subscriptions, payments, StoreKit, acquiring, creation credits, receipts, or purchase ledger. Historical D-005 is `Deferred / post-pilot`. New D-013 and `docs/adr/0004-non-commercial-pilot.md` record the current decision. Remaining commerce terms are exclusions or explicit deferred notes.
4. **Unity skill.** First Unity slice is one authored 3D zoo, limited camera, 20+ active fixtures, `walk`/`hop`/`fly`/`float`, tests + Game View + Console + five-minute soak. No backend/AI/payments. Unity project was not created.
5. **SHA-256.** `.cursor/skills/package-review-zip/SKILL.md` no longer requires a `.sha256` sidecar. This rework does not create one.

## Changed files in this rework

- `Makefile`
- `README.md`
- `AGENTS.md`
- `backend/README.md`
- `client/README.md`
- `docs/PRODUCT.md`
- `docs/MVP.md`
- `docs/ARCHITECTURE.md`
- `docs/SETUP.md`
- `docs/DECISIONS.md`
- `docs/SECURITY_AND_PRIVACY.md`
- `docs/ENGINEERING_PRINCIPLES.md`
- `docs/TECHNICAL_SPIKE.md`
- `docs/CREATURE_PIPELINE.md`
- `docs/CURSOR_WORKFLOW.md`
- `docs/SOURCES.md`
- `docs/adr/0001-unity-urp-client.md`
- `docs/adr/0002-modular-backend.md`
- `docs/adr/0004-non-commercial-pilot.md` (new)
- `.cursor/rules/00-project-core.mdc`
- `.cursor/rules/02-pilot-quality-gates.mdc`
- `.cursor/skills/build-unity-slice/SKILL.md`
- `.cursor/skills/package-review-zip/SKILL.md`
- `.cursor/skills/plan-vertical-slice/SKILL.md`
- `.cursor/skills/build-backend-feature/SKILL.md`
- `.cursor/skills/review-child-safety/SKILL.md`
- `handoff/BOOTSTRAP_REPORT.md`

## Command results

### Host checks in a clean temp tree (no prior `.venv`)

```text
host_tmp=/var/folders/1h/glqnqt5531z56gnk290bqbrw0000gn/T/tmp.4qwi4tnNUn
clean_no_venv=yes

$ uv sync --frozen --extra dev
uv_sync_exit:0
Installed 59 packages (CPython 3.13.13, new .venv)

$ uv run pytest
.                                                                        [100%]
1 passed in 0.71s
host_pytest_exit:0

$ uv run ruff check .
All checks passed!
host_ruff_check_exit:0

$ uv run ruff format --check .
6 files already formatted
host_ruff_format_exit:0
```

### Docker tests

```text
$ make test
docker compose run --rm api python -m pytest
.                                                                        [100%]
1 passed in 0.38s
make_test_exit:0

$ make check
docker compose run --rm api ruff check app tests
All checks passed!
docker compose run --rm api python -m pytest
.                                                                        [100%]
1 passed in 0.37s
./scripts/check-bootstrap.sh
Bootstrap structure looks valid.
make_check_exit:0

$ docker compose run --rm api python -m pytest
.                                                                        [100%]
1 passed in 0.37s
docker_pytest_module_exit:0
```

### Bootstrap / compose / health

```text
$ ./scripts/check-bootstrap.sh
Bootstrap structure looks valid.
check_bootstrap_exit:0

$ docker compose --env-file .env.example config
compose_config_exit:0

$ curl --fail http://localhost:8080/health
{"status":"ok","environment":"development"}
health_exit:0
```

### Commerce-term scan after edits

`rg -n "StoreKit|purchase|purchases|payment|payments|credit|credits|acquiring|5/10/15" README.md AGENTS.md docs .cursor`

Every remaining hit is an exclusion, a “do not implement” rule, or a record marked `deferred/post-pilot`. No active requirement tells an agent to build StoreKit, payments, credits, receipts, or a purchase ledger in this pilot.

## Secrets

No provider secrets, PATs, or production credentials were added. `.env` was not created. OpenRouter values in `.env.example` remain empty.

## What was not verified

- Unity project, Game View, device soak (Unity still not created, as required).
- Live OpenRouter or ElevenLabs calls.
- GitHub MCP OAuth.
- Production deploy.
- An initial Git commit.

## Iteration stop

Review archive: `outputs/virtual-zoo-iteration-00-bootstrap-rework.zip`. No `.sha256` file is produced. Do not start Unity or the next iteration until an external `PASS`.

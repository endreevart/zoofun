# System architecture

## Overview

```text
┌─────────────────────────────── Apple app ───────────────────────────────┐
│ Unity 6.3 LTS / URP                                                  │
│ zoo scene · input · care · cache · creature presentation             │
│                         │                                             │
│ thin native Apple bridge │ camera · parent authentication            │
└─────────────────────────┼─────────────────────────────────────────────┘
                          │ HTTPS JSON + signed asset URLs
                          ▼
┌──────────────────────────── Backend ───────────────────────────────────┐
│ Caddy → FastAPI → PostgreSQL                                          │
│                   │                                                   │
│                   └→ Redis → Celery workers                           │
│                                ├→ image preprocessing                  │
│                                ├→ OpenRouter                           │
│                                ├→ validation                           │
│                                ├→ card generation                      │
│                                └→ ElevenLabs                           │
│                                     │                                 │
│                              object storage                           │
└───────────────────────────────────────────────────────────────────────┘
```

Creation credits and a T-Bank purchase ledger are in scope (D-016 / ADR-0006). StoreKit stays out. Extra worlds are not sold yet.

## Client boundaries

### Unity owns

- 3D world, camera, input, visual effects, audio playback, and care presentation.
- Creature state machines and movement controllers.
- Local cache and graceful offline presentation.
- Drawing canvas for the pilot.
- Displaying parent UI, while native APIs perform protected operations.

### Native Apple bridge owns

- Camera/photo picker and permission surfaces.
- LocalAuthentication for parent-only operations where available.
- Platform lifecycle callbacks not exposed reliably by the Unity layer.

The bridge exposes a narrow C-compatible boundary to C#. Domain rules do not live in Swift.

### Public website (`zoofun-web`) owns

- Parent landing, email registration, and sign-in.
- Opening the Chudiki island after a backend parent session (`/play`).
- The Kenney fixture garden (`/zoo/demo`) as the iteration-00 local demo.
- `/admin` redirects to SQLAdmin at `/staff`. Visual metrics live at `crm.zooo.fun` (D-018).

The website never calls OpenRouter. Child legal names, voice, and other child PII are not collected. The Chudiki island stores the family zoo on the API for the signed-in child; voice recordings stay on the device. Parents, children, creatures, packs, and payments live in PostgreSQL. SQLAdmin at `/staff` is the write console. CRM at `crm.zooo.fun` reads the same database. When the API host cannot reach OpenRouter directly, the backend uses `OPENROUTER_HTTP_PROXY`.

Cookie consent on the marketing site enables first-party `source=site` events. Child paths `/play` and `/zoo` do not load the site tracker.

## Backend boundaries

Start as a modular monolith with one API image and one worker image from the same Python codebase.

Suggested modules for the pilot:

```text
backend/app/
  api/              HTTP routes and schemas
  accounts/         parent account and child profiles
  creatures/        creature records and care state
  generation/       job orchestration and artifact validation
  providers/        OpenRouter, ElevenLabs, and storage adapters
  persistence/      SQLAlchemy models and repositories
```

Do not split these into networked microservices during the pilot.

In scope for the web API: generation-credit ledger and T-Bank payments. StoreKit stays out.

## Core records

- `parents`: authentication and generation credits.
- `children`: nickname only; no legal names.
- `creatures`: one row per child drawing, payload is the island record.
- `parent_sessions` / `operator_sessions`: bearer tokens with expiry.
- `generation_jobs`: asynchronous state, attempts, provider metadata, and errors.
- `artifacts`: original, normalized input, final texture, manifest, and narration references.

Commerce records in PostgreSQL: `quota_total`, `generation_used`, pack catalog, `payments`. Alembic owns the schema. Credit reserve and T-Bank settlement are single locked transactions. A one-time import reads the old JSON files if the parents table is empty.

## Generation state machine

```text
created
  → uploaded
  → preprocessing
  → generating_image
  → validating_image
  → generating_profile
  → generating_audio
  → packaging
  → ready

Any processing state → retry_wait → same/next safe state
Any terminal validation failure → failed
```

Transitions are persisted. Worker retries must be idempotent. Duplicate client submission must not create a second job. A signed-in parent reserves one generation credit when a job is accepted.

## Runtime creature structure

```text
CreatureRoot
  NavMeshAgent or flight controller
  CreatureStateMachine
  InteractionAnchor
  VisualRoot
    generated textured mesh/billboard
    procedural deformation controller
    contact shadow
    spawn/care particles
  AudioSource
```

The generated texture never controls locomotion. It is presentation attached to a predictable runtime controller.

The zoo must remain stable with **20+ simultaneously active** creatures.

## Movement

- `walk`: NavMeshAgent with walk/waddle deformation.
- `hop`: NavMeshAgent with procedural vertical arc and landing squash.
- `fly`: curated aerial waypoints/splines plus local avoidance; not surface NavMesh.
- `float`: surface path or curated route with hovering deformation.
- Jumping between authored areas uses navigation links.
- Sleep moves the creature to a valid rest anchor and changes its state; absence never causes harm.

## Content delivery

- Developer-authored environments and large content updates may use Unity Addressables.
- Generated creature PNG/JSON/audio are normal HTTPS objects, not runtime-built Addressables bundles.
- The client downloads a signed manifest into a temporary cache, verifies every artifact, prewarms the texture/material/audio, and atomically publishes it to the live cache.

## Deployment for the pilot

- One Linux host may run Caddy, API, worker, PostgreSQL, and Redis through Docker Compose.
- The API applies Alembic on startup and checks the database from `/health`.
- Production assets and backups must live off-host.
- AI workloads remain external; the pilot server does not require a GPU.
- Migrate PostgreSQL and object storage to managed services before scale if operational ownership is not staffed.

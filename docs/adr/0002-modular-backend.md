# ADR-0002: Dockerized modular monolith

- Status: accepted
- Date: 2026-08-25

## Context

The pilot has approximately ten children and requires durable asynchronous AI jobs, cloud save, and replaceable external providers. Purchase verification is deferred/post-pilot.

## Decision

Use one FastAPI codebase deployed as API and Celery worker containers, with PostgreSQL as source of truth, Redis as broker, and S3-compatible artifact storage.

## Consequences

- Local development and pilot deployment stay understandable.
- API and worker share contracts without early network boundaries.
- Job idempotency and database transactions remain required; Celery delivery alone is not authority.
- Scale can be increased by adding workers before splitting services.

## Rejected alternatives

- Supabase: not selected by product owner.
- Kubernetes/microservices: unnecessary operational surface for MVP.
- Client-direct AI calls: exposes secrets and removes control over privacy, retries, and validation.

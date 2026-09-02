# Creature generation and asset contract

## Goal

Produce a safe, recognizable, technically valid 2.5D creature from an arbitrary child drawing. The pipeline is not asked to construct an animation-ready 3D model.

## Input contract

- JPEG, PNG, or HEIC accepted by the upload edge and normalized server-side.
- A single drawing is preferred, but preprocessing must detect and reject unreadable/empty input gracefully.
- Client strips metadata before upload where possible; server strips remaining metadata.
- Original input is private and never exposed to other users.

## Pipeline

1. Validate content type, decoded dimensions, file size, and image integrity.
2. Normalize orientation and color space.
3. Correct paper perspective and crop with a child/parent confirmation fallback.
4. Remove paper background while preserving interior white details.
5. Generate a polished reference-preserving character through a pinned OpenRouter endpoint.
6. Validate output dimensions, alpha coverage, silhouette bounds, and file integrity.
7. Generate a JSON profile constrained by schema and safe vocabulary.
8. Classify one locomotion enum: `walk`, `hop`, `fly`, or `float`.
9. Generate narration from the validated card text only.
10. Package artifacts and mark the database record ready in one committed transition.

## Required artifact package

```text
creatures/{creature_id}/{revision}/
  creature.png
  manifest.json
  narration.mp3
```

Development and audit storage may also hold private input artifacts under separate access controls and retention.

## Manifest v1

```json
{
  "schemaVersion": 1,
  "creatureId": "uuid",
  "revision": 1,
  "displayName": "Лунолап",
  "locomotion": "hop",
  "scaleClass": "medium",
  "groundAnchor": { "x": 0.5, "y": 0.06 },
  "profile": {
    "kind": "лунный прыгун",
    "home": "сад светящихся облаков",
    "favoriteFood": "яблочные звёздочки",
    "specialAbility": "находит дорогу по добрым мыслям"
  },
  "assets": {
    "texture": { "path": "creature.png", "sha256": "..." },
    "narration": { "path": "narration.mp3", "sha256": "..." }
  }
}
```

Production schemas must constrain string lengths, enums, required fields, and additional properties. Never trust provider JSON without local schema validation.

## Image requirements

- Transparent PNG with a single primary creature.
- Working target: no more than 1024×1024 for the mobile runtime unless profiling proves otherwise.
- No background scenery, border, written name, watermark, or duplicated creature.
- Alpha silhouette must not touch the image edge.
- Ground anchor must place feet/body consistently relative to the runtime root.

## Provider policy

- Provider calls happen only in backend workers.
- Pin model and provider after evaluation; disable unreviewed fallbacks.
- Record model, provider, request ID, latency, cost, and artifact revision without storing child PII in logs.
- Use an application-owned provider interface so a model can be replaced without changing the Unity contract.
- A provider change is an experiment and requires the evaluation skill plus a recorded result.

## Failure behavior

- Retriable: timeout, rate limit, transient provider error, object-storage failure.
- Regenerable: structurally valid result that fails silhouette/output rules.
- Terminal: invalid upload after correction attempts, policy rejection, repeated invalid output.
- Never create two jobs for a retry of the same idempotent request.
- Never expose raw provider errors to a child. Present a calm in-world retry state and a useful parent-facing diagnostic.

## Seamless spawn protocol

1. Client creates an in-world placeholder tied to `jobId`.
2. Client polls a lightweight job endpoint with backoff; WebSockets are not required for MVP.
3. When ready, client downloads the manifest and artifacts into a temporary revision directory.
4. Client validates hashes and decodes the PNG/audio.
5. Client instantiates and prewarms the creature while hidden.
6. Client atomically switches the active revision and plays the reveal effect.
7. Failed validation leaves the previous state intact and requests a signed URL refresh or retry.

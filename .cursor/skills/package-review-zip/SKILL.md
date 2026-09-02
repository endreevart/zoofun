---
name: package-review-zip
description: Packages a Virtual Zoo iteration ZIP for external review. Use when an iteration is complete and a review handoff archive is required.
disable-model-invocation: true
---

# Package review ZIP

## Instructions

1. Write the iteration report under `handoff/` with absolute path, changes, actual command output, unverified items, secrets check, and status. Do not include SHA-256.
2. Create `outputs/virtual-zoo-iteration-<id>-<name>.zip`. Do not create a `.sha256` sidecar.
3. Include the reproducible project: `.cursor`, `.env.example`, `.gitignore`, docs, backend, client, infra, scripts, and the report.
4. Exclude `.git`, `.env`, secrets, `.venv`, Python caches, Unity `Library`/`Temp`/`Logs`, and previous ZIPs.
5. Do not invent command results. After the ZIP is written, stop. Do not start the next iteration.

## Status values

`READY_FOR_REVIEW`, `BLOCKED_WRONG_FOLDER`, `BLOCKED_MISSING_SOURCE_FILES`, `BLOCKED_TOOLING`.

---
name: build-unity-slice
description: Creates the first Unity fixture-only zoo slice for Virtual Zoo. Use when building the authored 3D zoo, camera, and 20+ active local creatures — not backend, live AI, or payments.
disable-model-invocation: true
---

# Build Unity vertical slice

## Goal

The first Unity iteration must deliver:

- one beautiful authored 3D zoo;
- a smooth, limited camera;
- at least 20 simultaneously created and active fixture creatures;
- locomotion classes `walk`, `hop`, `fly`, and `float`;
- no backend, OpenRouter, ElevenLabs, care/away-from-home systems, or payments on this stage;
- Unity tests, Game View, Console, a five-minute runtime soak, and visual evidence;
- stop after the ZIP until an external `PASS`.

## Instructions

1. Read `docs/ARCHITECTURE.md`, `docs/TECHNICAL_SPIKE.md`, `docs/SETUP.md`, and `docs/adr/0001-unity-urp-client.md`.
2. Plan first. Wait for approval before creating or editing Unity scenes.
3. Use Unity 6.3 LTS + URP. Let the installed editor resolve packages; commit the generated lock file.
4. Load creatures from local PNG/manifest/audio fixtures. Prewarm while hidden and spawn atomically.
5. Do not create the Unity project during iteration `00` bootstrap.

## Verification

- Compilation is not done. Required: Unity tests, Game View, Console, five-minute runtime soak, and visual evidence of 20+ active animals.
- Invalid or partial artifacts must stay invisible.

## Stop

Package the slice ZIP and wait for external `PASS` before the next iteration.

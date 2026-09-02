---
name: evaluate-creature-pipeline
description: Evaluates the Virtual Zoo creature generation pipeline against fixtures. Use when checking OpenRouter image/profile quality, recognition, or before changing a pinned provider.
disable-model-invocation: true
---

# Evaluate creature pipeline

## Instructions

1. Read `docs/CREATURE_PIPELINE.md`, `docs/TECHNICAL_SPIKE.md`, and `docs/templates/AI_EXPERIMENT_TEMPLATE.md`.
2. Use the approved fixture set. Do not use public child drawings without confirmed usage rights.
3. Do not change a pinned production provider from one sample. Record an experiment first.
4. Provider calls happen only in backend workers. Do not call OpenRouter from Unity or MCP.
5. Validate artifacts locally: dimensions, alpha, silhouette, hashes, locomotion enum, schema.

## Report

Fill `docs/templates/AI_EXPERIMENT_TEMPLATE.md`. Decide promote, reject, or rerun. Do not start the next iteration without external `PASS`.

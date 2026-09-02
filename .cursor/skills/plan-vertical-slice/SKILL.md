---
name: plan-vertical-slice
description: Plans a single Virtual Zoo iteration with acceptance criteria and stop conditions. Use when starting an iteration, planning a vertical slice, or when the user asks for a plan before implementation.
disable-model-invocation: true
---

# Plan one iteration

## Instructions

1. Read `AGENTS.md` and the docs named in the request (`docs/PRODUCT.md`, `docs/MVP.md`, `docs/ARCHITECTURE.md`, `docs/TECHNICAL_SPIKE.md` as relevant).
2. Inspect the current repository. Do not invent files or test results.
3. Plan exactly one iteration. State assumptions, in-scope files, out-of-scope work, and acceptance criteria.
4. Wait for approval before editing scenes, adding providers, or expanding product modules.
5. Stop after the iteration is packaged for review. Do not start the next iteration until an external `PASS`.

## Constraints

- Preserve drawing identity over beautification.
- Never put OpenRouter, ElevenLabs, or storage secrets in the client.
- Current pilot has no payments, subscriptions, StoreKit, acquiring, creation credits, receipts, or purchase ledger.
- Compilation without visual and runtime checks is not done.

## Output

```markdown
## Iteration
## Goal
## In scope
## Out of scope
## Acceptance criteria
## Verification commands
## Stop condition
```

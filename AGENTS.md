# Agent operating guide

This repository contains a child-facing Unity game and a Python backend. Work from the written product constraints; do not infer new scope from a convenient technical implementation.

The public web zoo is in commercial launch (D-016). Unity iteration 01 still follows `docs/PILOT.md` and does not replace the website.

## Sources of truth

Read the relevant documents before changing code:

- `docs/PRODUCT.md`: product promise and user experience.
- `docs/PILOT.md`: current staged delivery for the non-commercial test group (what this iteration may implement).
- `docs/MVP.md`: full included and excluded product scope. Not every listed feature is in the current iteration.
- `docs/ARCHITECTURE.md`: system boundaries and data flow.
- `docs/CREATURE_PIPELINE.md`: generated asset contract and lifecycle.
- `docs/SECURITY_AND_PRIVACY.md`: child-data requirements.
- `docs/DECISIONS.md` and `docs/adr/`: accepted architectural decisions.

If code and documentation disagree, stop and surface the mismatch. Do not silently redefine the product.

## Working protocol

1. Inspect the existing implementation and relevant documentation.
2. State assumptions and define acceptance criteria.
3. Prefer one end-to-end vertical slice over several disconnected layers.
4. Make the smallest coherent change.
5. Add or update automated tests.
6. Run the checks relevant to the changed area.
7. Review logs, generated assets, and user-visible behavior—not only compilation.
8. Update an ADR when changing a durable architectural decision.

## Non-negotiable constraints

- Preserve the child drawing's identity over visual beautification.
- Never place OpenRouter, ElevenLabs, or storage credentials in the client.
- Never send names, voice samples, precise location, contacts, or other child PII to AI providers.
- Existing animals must remain usable offline after their assets have been cached.
- Generation jobs are asynchronous, idempotent, retryable, and observable.
- A partially downloaded or invalid creature must never appear in the zoo.
- Web commerce is T-Bank packs and a parent credit ledger (D-016). No StoreKit, subscriptions, or extra worlds.
- MCP is development tooling, not an application runtime dependency.
- Do not add friends, chat, public content, leagues, or automatic full-3D generation to this pilot.
- Compilation without visual and runtime verification is not done.

## Destructive and external actions

Do not publish builds, deploy, merge, buy external services, change production data, or enable write-capable MCP tools without explicit approval. Default GitHub MCP access is read-only.

## Definition of done

A task is complete only when its acceptance criteria pass, relevant tests run, error paths are handled, secrets remain absent, and documentation reflects any changed contract or decision.

# Accepted product and architecture decisions

This file is the concise decision register. Detailed engineering decisions live in `docs/adr/`.

| ID | Decision | Status |
|---|---|---|
| D-001 | Audience is children aged 3–8 with a parent gate | Accepted |
| D-002 | Unity 6.3 LTS + URP is the primary client stack | Accepted |
| D-003 | The zoo is authored 3D; generated creatures are constrained 2.5D assets | Accepted |
| D-004 | Pilot care contains only feeding, water, and washing | Accepted |
| D-005 | First creation is free; further credits are StoreKit packs of 5/10/15 | Deferred / post-pilot |
| D-006 | Russian external acquiring is excluded | Accepted |
| D-007 | Friends, social content, leagues, and public ranking are post-pilot | Accepted |
| D-008 | Backend uses Docker, FastAPI, PostgreSQL, Redis, Celery, and object storage | Accepted |
| D-009 | OpenRouter and ElevenLabs are backend-only replaceable providers | Accepted |
| D-010 | Existing cached zoo content works offline | Accepted |
| D-011 | iPhone/iPad vertical slice precedes macOS stabilization | Accepted |
| D-012 | Official MCP servers are preferred; GitHub MCP is read-only by default | Accepted |
| D-013 | Current work is a non-commercial pilot for ≤10 children; no payments, StoreKit, credits, receipts, or purchase ledger; zoo must hold 20+ active animals | Accepted |
| D-014 | The public website signs a parent in with email, then opens the Chudiki island; Kenney `/zoo/demo` stays the iteration-00 fixture garden | Accepted |

## Pending decisions

- Minimum supported Apple devices and OS versions after profiling the technical spike.
- Final OpenRouter image model/provider after a controlled drawing evaluation.
- Exact Zoo Stars formula after observing the pilot.
- Production cloud vendor and data region after privacy/legal review.
- App name, visual identity, and final narrator voice.
- Any commercial model after the pilot (see D-005).

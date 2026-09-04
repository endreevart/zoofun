# Accepted product and architecture decisions

This file is the concise decision register. Detailed engineering decisions live in `docs/adr/`.

| ID | Decision | Status |
|---|---|---|
| D-001 | Audience is children aged 3–8 with a parent gate | Accepted |
| D-002 | Unity 6.3 LTS + URP is the primary client stack | Accepted |
| D-003 | The zoo is authored 3D; generated creatures are constrained 2.5D assets | Accepted |
| D-004 | Pilot care contains only feeding, water, and washing | Accepted |
| D-005 | First creation is free; further credits are T-Bank packs of 5/10/15/20, RUB only | Accepted (revised 2026-09-03) |
| D-006 | Russian external acquiring is excluded | Superseded by D-016 |
| D-007 | Friends, social content, leagues, and public ranking are post-pilot | Accepted |
| D-008 | Backend uses Docker, FastAPI, PostgreSQL, Redis, Celery, and object storage | Accepted |
| D-009 | OpenRouter and ElevenLabs are backend-only replaceable providers | Accepted |
| D-010 | Existing cached zoo content works offline | Accepted |
| D-011 | iPhone/iPad vertical slice precedes macOS stabilization | Accepted |
| D-012 | Official MCP servers are preferred; GitHub MCP is read-only by default | Accepted |
| D-013 | Current work is a non-commercial pilot for ≤10 children; no payments, StoreKit, credits, receipts, or purchase ledger; zoo must hold 20+ active animals | Superseded by D-016 |
| D-016 | Exit the non-commercial pilot: T-Bank web acquiring, generation credits, packs 5/10/15/20, first creature free, delete does not restore a credit; extra worlds later; no StoreKit or subscriptions | Accepted |
| D-014 | The public website signs a parent in with email, then opens the Chudiki island; Kenney `/zoo/demo` stays the iteration-00 fixture garden | Accepted |
| D-015 | Web island may attach a Meshy image-to-3D GLB after stylize; Unity pilot and ADR-0003 stay 2.5D; missing mesh falls back to the standee | Experimental |
| D-017 | PostgreSQL + Alembic is the account and payment ledger; SQLAdmin at `/staff` is the operator console; CRM may read later but must not write a second ledger | Accepted |
| D-018 | Visual CRM at crm.zooo.fun reads the same Postgres; cookie banner + first-party site visits; no second ledger | Accepted |

D-015 is an owner experiment on the Chudiki island only. It does not replace ADR-0003 or change the Unity iteration gate. Meshy stays backend-only; the key never ships in the client. If the mesh fails, the zoo still shows the 2.5D drawing.

## Pending decisions

- Minimum supported Apple devices and OS versions after profiling the technical spike.
- Final OpenRouter image model/provider after a controlled drawing evaluation.
- Exact Zoo Stars formula after observing the pilot.
- Production cloud vendor and data region after privacy/legal review.
- App name, visual identity, and final narrator voice.
- Foreign acquiring and non-RUB prices (D-016 is RUB / T-Bank only).
- Extra worlds for sale (legal hook exists; shop is not built).
- Extra CRM modules from kid that have no Zooofun counterpart (partners, blog CMS, push).

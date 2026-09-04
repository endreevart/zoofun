# Engineering principles

1. **Build the riskiest vertical slice first.** Prove drawing → generation → validated asset → seamless spawn → movement of **20+ active animals** on a real device before expanding the zoo.
2. **Prefer constrained systems over impressive demos.** Four locomotion classes are better than an unreliable universal rig.
3. **Keep providers replaceable.** OpenRouter and ElevenLabs are adapters behind application-owned interfaces and artifact contracts.
4. **Server owns generation state.** Job transitions, ready assets, and the parent credit balance are authoritative on the backend.
5. **Client owns presentation.** Unity never waits synchronously for AI; it presents a durable in-world placeholder and continues playing.
6. **Offline is a normal state.** Cached animals and care interactions remain available; synchronization reconciles later.
7. **No partial creatures.** Download, decode, validate, and prewarm before atomically making a creature visible.
8. **Measure on minimum hardware.** Editor performance and a modern Mac do not prove iPhone/iPad performance.
9. **Avoid unnecessary infrastructure.** One deployable backend, one worker pool, PostgreSQL, Redis, and object storage are enough for the pilot.
10. **Decisions are written.** Durable deviations require an ADR with context, alternatives, consequences, and rollback.

## Quality gates

- No committed secrets.
- No provider call from the client.
- Automated backend tests pass (`python -m pytest` in Docker; `uv sync --frozen --extra dev` then `uv run pytest` on the host).
- Unity project compiles without errors.
- Relevant Unity EditMode/PlayMode tests pass.
- A changed scene is visually checked in Game view, Console, and a five-minute runtime soak when applicable.
- Generation fixtures cover malformed images, retries, duplicate submissions, and provider timeouts.
- Credit reservation, refund-on-technical-failure, and T-Bank notification tests cover the ledger.

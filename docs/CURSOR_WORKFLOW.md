# Working with Cursor

## Context strategy

- Project rules live in `.cursor/rules`; `.cursorrules` is intentionally absent.
- Reusable workflows live in `.cursor/skills` and can be invoked with `/`.
- `AGENTS.md` gives Cursor CLI and other compatible agents the repository-wide operating guide.
- `docs/PILOT.md` is the current staged delivery for the non-commercial test group. `docs/MVP.md` remains the full product scope.
- MCP connects external tools only; it does not replace repository documentation.

## Recommended session pattern

1. Start from a narrow outcome and reference the relevant document.
2. Ask for a plan and acceptance criteria before a multi-file feature.
3. Use the matching project skill.
4. Review the proposed file list before implementation when the change affects architecture, privacy, or generated assets.
5. After implementation, ask Cursor to run tests and inspect actual Unity console/scene output.
6. Commit a coherent vertical slice, not a partially connected layer.

## Starter prompts

### Repository audit

```text
Read AGENTS.md and docs/SETUP.md. Audit this repository for missing prerequisites only. Do not implement product features. Return a short checklist of blockers and exact verification commands.
```

### Unity bootstrap

```text
Use /build-unity-slice. Read docs/ARCHITECTURE.md and docs/TECHNICAL_SPIKE.md. Prepare the first Unity vertical slice: one authored 3D zoo, smooth limited camera, 20+ active fixture creatures with walk/hop/fly/float, Unity tests, Game View, Console, and a five-minute soak. No backend or payments. Plan first and wait for approval before editing scenes.
```

### Backend feature

```text
Use /build-backend-feature. Implement only generation-job creation and polling using the state machine in docs/ARCHITECTURE.md. Include idempotency, migration, API schemas, and tests. Do not call an AI provider yet.
```

### Provider experiment

```text
Use /evaluate-creature-pipeline. Design a reproducible evaluation for the pinned image endpoint using the approved fixture set. Do not change the production provider until the report is reviewed.
```

### Review

```text
Review this change against AGENTS.md, docs/MVP.md, and docs/SECURITY_AND_PRIVACY.md. Lead with concrete defects and missing tests. Do not propose post-MVP features.
```

## Anti-patterns

- “Build the whole app” prompts.
- Letting the agent add packages without explaining why and updating lock files.
- Trusting a successful compile as visual verification.
- Letting MCP save broad scene changes without reviewing the hierarchy, console, and diff.
- Pasting production secrets into chat or MCP JSON.
- Changing AI models to fix one sample without running the full evaluation set.

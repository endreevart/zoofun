# Memory Maintenance

## Discovery

- Graph root: `mem:core`. Agents get memory names only; they read on demand.
- References use `mem:` inside backticks, e.g. `mem:backend/core`. Surrounding text must say what the memory covers.
- Memories do not say when to read them; the referring memory does.

## Style

Dense agent notes. Invariants and terse bullets. No rationale, examples, or task-local notes unless they prevent a likely mistake.

## Add/update threshold

Only stable, non-obvious conventions that would be costly to rediscover.
Do not add: generic framework knowledge; one-off tasks; volatile git/prod counts; secrets; line-level details likely to change this week.

## Actions

- Rename via Serena rename tool so `mem:` refs update.
- After deletions: `serena memories check` from the zoofun root.

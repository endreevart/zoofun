# Security and child privacy

This document is an engineering baseline, not a substitute for jurisdiction-specific legal review before public release.

## Data minimization

- Prefer parent accounts and child nicknames; do not require a child's legal name, birth date, school, contacts, precise location, or voice.
- Do not collect advertising identifiers.
- Do not add third-party behavioral analytics SDKs to the child experience by default.
- Original drawings are private processing inputs, not social content.
- Send AI providers only the image or validated generated text required for the current job.

## Secrets

- Provider and storage keys exist only in secret storage or local `.env` files excluded from Git.
- Mobile builds contain public API base URLs only.
- Rotate any credential that appears in source, logs, screenshots, issue text, or MCP configuration.
- Development and production credentials must be separate and least-privileged.
- This pilot has no App Store server keys, StoreKit secrets, or payment credentials.

## Authentication and authorization

- Parent authentication protects account, deletion, export, and permissions.
- Child actions operate through a limited child profile, not unrestricted parent credentials.
- Every object lookup is authorized by parent account and child profile ownership.
- Signed asset URLs are short-lived and scoped to individual objects.

## Purchases and credits

**Status: deferred / post-pilot.** Do not implement StoreKit verification, receipts, creation credits, or a purchase ledger in this pilot.

Job creation still uses an idempotency key so a duplicate submission does not create a second job.

## Upload and artifact safety

- Decode images; do not trust extension or MIME header alone.
- Enforce limits on bytes, pixels, dimensions, and processing time.
- Strip EXIF and other metadata.
- Reject archives and active content.
- Store originals separately from public-delivery artifacts.
- Scan dependencies and containers in CI.

## Logs and observability

- Log opaque IDs, state transitions, provider timing, retry count, and error category.
- Do not log uploaded images, generated narration text containing personal input, signed URLs, tokens, or provider request bodies.
- Give parent-facing support a job ID that can be investigated without identifying the child.

## Retention and deletion

- Define retention before the pilot; do not retain raw originals indefinitely by accident.
- Parent account deletion must cover database rows, object artifacts, cached server derivatives, and queued jobs.
- Backups need documented expiry and restore testing.
- Provider retention settings and subprocessors must be reviewed before real child data is used.

## MCP safety

- MCP tools operate only in development.
- GitHub starts read-only.
- Unity scene-changing tools require review of the scene, console, and diff before save/commit.
- Never place production database or provider credentials in MCP configuration.
- Do not install anonymous community MCP servers without source review and explicit approval.

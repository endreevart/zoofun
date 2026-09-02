---
name: review-child-safety
description: Reviews Virtual Zoo changes for child safety, privacy, quality gates, and MVP exclusions. Use when reviewing a slice, preparing external review, or checking whether work is actually done.
disable-model-invocation: true
---

# Review quality and child safety

## Instructions

1. Read `AGENTS.md`, `docs/MVP.md`, and `docs/SECURITY_AND_PRIVACY.md`.
2. Lead with concrete defects. Do not propose post-MVP features.
3. Check: no child PII to providers; no secrets in client or MCP; no partial creatures; offline cached animals still work.
4. Confirm the current pilot still has no payments, subscriptions, StoreKit, acquiring, creation credits, receipts, or purchase ledger.
5. Reject “done” that is only a successful compile. Require visual and runtime evidence where the change is user-visible.

## Output

- Critical defects
- Missing tests
- Privacy/secret findings
- Verification that was actually run
- Verdict: ready for review or blocked

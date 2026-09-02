# ADR-0004: Non-commercial pilot, commerce deferred

- Status: accepted
- Date: 2026-08-25

## Context

The near-term goal is a fast test with up to 10 children. Implementing StoreKit, creation credits, receipts, or a purchase ledger would delay the drawing → creature → zoo loop.

## Decision

Ship a non-commercial pilot: no subscriptions, payments, StoreKit, acquiring, creation credits, receipts, or purchase ledger. The pilot outcome is import/photograph → recognizable 2.5D creature → seamless spawn → stable activity of 20+ animals in one authored zoo. A commercial model is deferred/post-pilot (historical D-005).

## Consequences

- Parent settings remain; parent-only purchases do not.
- Backend has no credit reservation or StoreKit verification in this phase.
- Native Apple bridge is camera and parental authentication only.
- The next stage starts only after an external `PASS`.

## Alternatives

- Keep StoreKit in the current scope: rejected; it is not needed for a 10-child test.
- Add a fake client-side credit counter: rejected; it would invent commerce without a product decision.

## Rollback or supersession

Restore commerce only by accepting a new decision that supersedes D-013 and reactivates D-005.

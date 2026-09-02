# ADR-0003: Constrained 2.5D generated creatures

- Status: accepted
- Date: 2026-08-25

## Context

Arbitrary child drawings may contain nonstandard anatomy and cannot be relied upon to produce a consistent 3D mesh and skeleton automatically.

## Decision

Generate one transparent reference-preserving image plus a validated manifest. Animate the image as a stylized standee/mesh attached to one of four authored movement controllers.

## Consequences

- Every valid silhouette can move without a bespoke rig.
- The camera and art direction must support the 2.5D illusion.
- Procedural deformation is intentionally modest.
- Full 3D reconstruction can be researched separately without blocking MVP.

# ADR-0025: Silly silhouette path for a real pet photo

- Status: accepted
- Date: 2026-09-14
- Relates: D-015, D-025, ADR-0003

## Context

The production still prompt tells Flux the upload is a child's drawing and forbids a photograph of a real animal. That path paints a clay-and-felt figurine. A family photographing a dog or cat therefore loses the real silhouette and gets the same toy look as a doodle.

The product still starts from a drawing. A second input — a camera photo of a real domestic animal — should stay that animal, with only small cartoon foolishness.

## Decision

1. The child camera stays one photo control. No mode picker.
2. The existing OpenRouter safety gate also labels `source` as `drawing` or `pet`. `pet` only when the image is clearly a photograph of a real living companion animal. A drawing of a dog, a photo of paper, a toy, or an uncertain frame is `drawing`.
3. `pet` jobs use a different still prompt: keep that animal's silhouette, markings, and colors; add mismatched cartoon eyes and a lopsided grin; do not use the clay-felt contour prompt; do not add hats, clothes, or extra limbs. Mesh (Tripo 3.0 → 2.5 → Meshy 7) and the garden postcard stay the same job, with a postcard prompt that does not assume felt.
4. The same generation credit, egg, and spawn rules apply. The original photo is deleted after the still, like a drawing.
5. If the gate is down, the job is a drawing. Unity iteration 01 is unchanged.

## Consequences

- A false `pet` on a child's drawing would skip contour. Classification is conservative on purpose.
- Landing copy may stay drawing-first. The island photo control accepts both.
- Legal consent texts must name a pet photograph as an allowed upload, not only a paper drawing.

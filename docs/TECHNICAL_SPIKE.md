# Technical spike: first vertical slice

## Purpose

Resolve the actual unknowns before expanding product scope: visual coherence, drawing preservation, runtime character presentation, mobile performance, and asynchronous spawn reliability.

This spike supports a non-commercial pilot for up to 10 children. Commerce is deferred.

## Deliverable

One beautiful authored 3D zoo running on a physical iPad/iPhone with **at least 20 simultaneously created and active fixture creatures**, covering `walk`, `hop`, `fly`, and `float`.

A later slice in the same spike adds upload of a drawing/photo and at least one live generated creature with seamless spawn. The first Unity slice has no backend, OpenRouter, ElevenLabs, care, or payments.

The full spike includes:

- smooth limited camera pan/zoom;
- one walkable NavMesh area plus aerial/float routes as needed;
- fixture locomotion for walk, hop, fly, and float;
- feeding, water, and washing after the fixture zoo is stable (not in the first Unity slice);
- card and cached narration playback after fixtures;
- upload of a drawing/photo;
- server job with retry and idempotency;
- pinned OpenRouter image generation;
- structured profile generation;
- ElevenLabs narration;
- temporary download, validation, prewarm, and reveal effect;
- offline restart with existing cached creatures.

## Test set

Collect 50–100 consented test drawings across:

- very young scribbles;
- white-on-white interior details;
- five or more limbs;
- flying creatures;
- mixed animals;
- portrait and landscape photos;
- shadows, folded paper, and perspective distortion;
- multiple figures on one page;
- faint pencil and saturated marker.

Do not use public child drawings without confirmed usage rights.

## Acceptance gates

### Recognition

- At least 80% of evaluated outputs are recognized by the submitting adult/child without seeing a label.
- Critical features—unusual limbs, primary colors, face placement—remain present.
- No output contains an added second creature, watermark, or written name.

The 80% value is a pilot gate, not a guaranteed production target; revise it only from recorded evidence.

### Reliability

- Duplicate client submission does not create a second job.
- Provider timeout retries without losing the placeholder.
- Invalid final artifact never becomes visible.
- Existing animals load after app restart without network.

### Performance

- Define and record minimum device, scene complexity, frame-time target, peak memory, and thermal behavior.
- Test with **at least 20 simultaneously active** creatures.
- Profile device builds; Editor numbers do not count.
- First Unity slice also requires Unity tests, Game View, Console, a five-minute runtime soak, and visual evidence.

### Experience

- Creation delay is represented in-world and does not block zoo exploration.
- A pre-reader can reach and complete each care action without reading an instruction.
- Failure language is calm and gives the parent a useful retry/support path.

## Stop conditions

Do not implement payments, StoreKit, credits, or broaden the world if recognition or atomic spawn fails. Fix the creature contract first. Do not respond to poor recognition by switching to automatic full 3D generation without a new decision and experiment. After packaging a review ZIP, stop until an external `PASS`.

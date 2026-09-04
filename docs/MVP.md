# Pilot scope

The active **product** target is the public web zoo. Unity iteration gates in `docs/PILOT.md` stay separate from website commerce (D-016).

**Current staged delivery** (what may be implemented in the open iteration) is documented in `docs/PILOT.md`. This file stays the approved included/excluded product list; it is not a checklist that every iteration must implement at once.

## Included

1. In-app drawing with simple brush, eraser, undo, clear, and confirm.
2. Paper-drawing import through camera or photo picker.
3. Basic crop, perspective correction, and background cleanup.
4. Generated 2.5D creatures with transparent background.
5. One hand-authored beautiful stylized 3D zoo.
6. Smooth limited camera pan and zoom; limited rotation if validated on target devices.
7. Creature locomotion classes: walk, hop, fly, and float.
8. Idle and sleep states.
9. Feeding, water, and washing.
10. Fantastical structured card and narrated audio.
11. Private local Zoo Stars as a gentle progress indicator, not a ranking.
12. Parent gate and parent-only settings and purchases.
13. Parent-account cloud save and local offline cache.
14. Stable activity of **20+ simultaneously active** animals in that one zoo.
15. iPhone and iPad first; macOS follows from the same Unity project after the mobile vertical slice is stable.

## Explicitly excluded from this pilot

- Subscriptions, StoreKit, App Store IAP, advertising, and extra worlds for sale (worlds later).
- Foreign acquiring and non-RUB prices (T-Bank / RUB only for now).
- Friends, visits, gifting, leagues, public rankings, search, chat, comments, and public galleries.
- Server-side social moderation workflows required only by user-to-user publishing.
- Advertising, loot boxes, random paid rewards, and paid stat advantages.
- Petting, general mini-games, quests, stories, and multi-character narratives.
- Multiple biomes and user-built terrain.
- Full automatic 3D reconstruction, arbitrary skeletal auto-rigging, and generative video sprites.
- Android, Windows, web, visionOS, and multiplayer infrastructure.

## Deferred / post-pilot

StoreKit remains out. Web credits and T-Bank acquiring are in scope (D-016). Extra worlds and foreign acquiring stay deferred.

## Zoo Stars in the pilot

Zoo Stars are private and local to the child's zoo. They reward completed care and gentle variety but do not compare children. If implementation threatens the core vertical slice, the visual indicator may ship after creature creation and care but before public release.

## Scope-change rule

A feature moves into the pilot only through an explicit product decision recorded in `docs/DECISIONS.md`. Technical convenience is not a reason to expand scope. The next stage starts only after an external `PASS`.

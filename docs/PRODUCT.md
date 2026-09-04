# Product definition

## Audience

Children aged 3–8, with a parent controlling account settings and external permissions.

The current release is a public web zoo for children aged 3–8. A parent holds the account and any purchases.

The interface must work for pre-readers: large targets, visual feedback, narration, minimal text, and no action that depends on understanding a long instruction.

## Core fantasy

A child makes an imaginary animal and sees that same idea become alive inside a beautiful zoo. The emotional payoff is recognition, ownership, and gentle care—not collection pressure or competitive status.

## Primary journey

1. The child draws a little in the app or photographs a paper drawing.
2. The app confirms the drawing and opens a magical creation sequence.
3. A portal, egg, or workshop remains visible while generation happens in the background.
4. The finished creature appears in the zoo without a loading-screen break.
5. It moves autonomously and reacts to food, water, washing, and sleep.
6. Tapping it opens a fantastical card and optional narrated playback.
7. The child returns to care for existing creatures and create more animals.

## Experience principles

### Recognition before polish

The generated result must preserve the child's silhouette, colors, unusual features, and emotional idea. Do not “correct” five legs, asymmetry, mixed species, or strange proportions unless generation would otherwise fail.

### The world is authored; the residents are generated

Artists build and optimize the zoo. AI produces constrained creature assets and text. Generating the entire world or full 3D creatures is outside this pilot.

### Short, calm sessions

The product supports gentle return sessions rather than dark patterns. No streak loss, countdown pressure, loot boxes, advertising, or punishment for absence.

### Care is simple

Pilot care contains only feeding, water, and washing. Each action must have immediate visual and audio feedback and must never imply that an animal suffers because the child was away.

### Private by default

No public gallery, chat, discovery, free text shared with other users, or exposure of original drawings.

## Commercial model

**Status: accepted (D-016 / ADR-0006).**

The first creature on a parent account is free. Further creations use generation credits sold as one-time packs of 5, 10, 15, or 20 animals. Prices are in rubles and shown in the UI at checkout. Payment is internet acquiring through АО «ТБанк». Deleting a creature does not restore a credit. There are no subscriptions, StoreKit, App Store IAP, or extra worlds for sale yet. Foreign acquiring and other currencies come later.

Purchase is parent-session only. Card data stays on the bank page. The zoo may show remaining creations and open a short pack sheet.

## Success signals for the pilot

- Import or photograph a drawing, generate a recognizable 2.5D creature, and spawn it seamlessly.
- A child or parent recognizes the generated creature as the submitted drawing.
- Generation completes or fails gracefully without losing the upload.
- One beautiful zoo stays stable with **20+ simultaneously active** animals.
- Existing zoo content remains playable offline.
- Children can navigate the zoo and complete care without adult instruction.
- The next stage starts only after an external review returns `PASS`.

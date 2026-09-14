# Product definition

## Audience

Children aged 3–8, with a parent controlling account settings and external permissions.

The current release is a public web zoo for children aged 3–8. A parent holds the account and any purchases.

The interface must work for pre-readers: large targets, visual feedback, narration, minimal text, and no action that depends on understanding a long instruction.

## Core fantasy

A child makes an imaginary animal — or photographs a real pet — and sees that same idea become alive inside a beautiful zoo. The emotional payoff is recognition, ownership, and gentle care—not collection pressure or competitive status.

## Primary journey

1. The child draws a little in the app, photographs a paper drawing, or photographs a real pet (D-025).
2. The app paints a still of the toy and shows it. After submit there is no cancel — only forward into the garden.
3. An egg stays in the garden while the 3D mesh finishes in the background. While waiting, the child can assemble a jigsaw puzzle of the painted still (4 pieces, then 9).
4. The finished creature appears in the zoo without a loading-screen break.
5. It moves autonomously and reacts to food, water, washing, and sleep.
6. Tapping it opens a fantastical card and optional narrated playback.
7. The child returns to care for existing creatures and create more animals.

## Experience principles

### Recognition before polish

The generated result must preserve the child's silhouette, colors, unusual features, and emotional idea. Do not “correct” five legs, asymmetry, mixed species, or strange proportions unless generation would otherwise fail. A photograph of a real pet follows the same rule for that animal: keep its silhouette, markings, and colors, and add only small cartoon foolishness (D-025).

### The world is authored; the residents are generated

Artists build and optimize the free zoo. AI produces constrained creature assets and text. Generating the entire world or full 3D creatures is outside this product. The web island also ships a few bundled park animals, so every garden is already inhabited before the first drawing. They do not spend a credit and cannot be deleted.

Paid empty twins of an island (D-020 / D-021) let the child stamp plants, houses, and objects onto that shell. Each island kind has its own construction SKU and stamp catalog. The family may buy as many copies of a kind as they want; each copy gets an automatic name. It is not terrain sculpting. Grass stamps stay out of the child catalog unless a later kind adds them. Free authored lawns are «Волшебный остров», «Висячий луг», and «Куболесье». Child-made creatures live on one world at a time and move only when the family chooses. On a bought garden the child can walk, wash, and feed the same way as on the free island; stamping is a build mode behind a hammer.

### Short, calm sessions

The product supports gentle return sessions rather than dark patterns. No streak loss, countdown pressure, loot boxes, advertising, or punishment for absence.

### Care is simple

Pilot care contains only feeding, water, and washing. Each action must have immediate visual and audio feedback and must never imply that an animal suffers because the child was away. On the web island, washing and feeding for drawn creatures are playful 2D scenes (scrub the mud off; catch falling snacks with the bowl) with no fail state and no timers. Child-made creatures keep those games after the 3D mesh arrives: the garden loads the same still CRM shows, not a snapshot of the lawn.

### Private by default

Original drawings and original pet photos stay inside the parent account. No chat, friends, discovery, or browsing someone else’s zoo. Anonymized garden postcards (the OpenRouter “toy in the garden” still, with no name and never the original drawing or pet photo) may appear on the public site as they are generated (D-022).

## Commercial model

**Status: accepted (D-016 / ADR-0006).**

The first creature on a parent account is free. Further creations use generation credits sold as one-time packs of 1, 5, 10, 15, or 20 animals. After that free hatch the island first offers one more Zufik or a pack of five; larger packs stay one tap away. Prices are in rubles and shown in the UI at checkout. Payment is internet acquiring through АО «ТБанк». Deleting a creature does not restore a credit. There are no subscriptions, StoreKit, or App Store IAP. «Волшебный остров», «Висячий луг», and «Куболесье» are free ready worlds. Construction copies («Собери сам», «Собери луг», «Собери куболесье») may be bought more than once (D-020 / D-021). A later island kind is a new row with its own assets. Foreign acquiring and other currencies come later.

Purchase is parent-session only. Card data stays on the bank page. The zoo may show remaining creations and open a short pack sheet.

## Success signals for the pilot

- Import or photograph a drawing, generate a recognizable 2.5D creature, and spawn it seamlessly.
- A camera photo of a real pet may take the silly-silhouette path instead of the drawing clay-felt path (D-025).
- A child or parent recognizes the generated creature as the submitted drawing or as that pet.
- Generation completes or fails gracefully without losing the upload.
- One beautiful zoo stays stable with **20+ simultaneously active** animals.
- Existing zoo content remains playable offline.
- Children can navigate the zoo and complete care without adult instruction.
- The next stage starts only after an external review returns `PASS`.

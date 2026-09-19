# ADR-0033: Home-screen web app for the island

- Status: accepted
- Date: 2026-09-19
- Relates: D-010, D-014, ADR-0005

## Context

Parents want a ZOOFUN icon on the phone next to other apps. The commercial zoo is already a website (`zooo.fun` → `/play` → `/island`). Browsers do not allow a site to place that icon silently.

## Decision

1. The **installable app is the Chudiki island**, not the marketing landing. Manifest `id` is `/island`. The icon opens `/island/` (or the Vite root in local play). It is not a StoreKit app and not a second product.
2. Chrome / Android / desktop Chromium: capture `beforeinstallprompt` and show a picture-first «Установить приложение» on the island. One tap runs the browser install sheet. We cannot skip that sheet.
3. iOS Safari: there is still no install API (WebKit declined `BeforeInstallPromptEvent`). The same button opens a two-picture guide (Share → Home). Add to Home Screen must happen while the island is open, not on the landing page.
4. A service worker on `/island` exists only so older Chromium treats the island as installable. It is network-passthrough: it must not cache drawings, API calls, or parent tokens. Existing creature offline play stays D-010 (IndexedDB / asset cache), not this worker.
5. Dismiss is local (`zoofun-pwa-hide`). No extra personal data.

## Consequences

- Unity iteration 01 is unchanged.
- Marketing `manifest` `start_url` follows `NEXT_PUBLIC_PLAY_URL` so a Chromium install from `zooo.fun` still opens the island in production.
- iOS still needs Share → Home Screen after the same install button. That is a platform limit, not a missing feature.

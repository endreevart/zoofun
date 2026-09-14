# ADR 0005: Public website opens the Chudiki island after parent sign-in

## Status

Accepted

## Context

The parent landing lives in `zoofun-web`. The playable island lives in `chudiki`. A Kenney fixture garden already exists at `/zoo/demo` for iteration 00.

## Decision

- Parent registration and login go to the FastAPI accounts module.
- Sign-in is a one-time code from `info@zooo.fun` to the parent mailbox, or Yandex ID. Sber, VK, Google, and Apple are not used.
- Email aliases that reach the same Gmail inbox (`+tag`, dots, `googlemail.com`) share one parent row so a second free creature cannot be minted that way.
- Password registration is closed in production. A first-time visitor ticks consents 1–4 before the parent row is created. A returning parent (email code or Yandex ID) skips that step.
- After a session is created, the site checks the parent session on `/play` and sends the browser to `/island`.
- `/zoo/demo` and `/join/demo` stay as the local Kenney demo.
- Child legal names, voice, and other child PII are not collected and are not sent to Yandex.
- SMTP credentials for Mail.ru mailbox `info@zooo.fun` (`smtp.mail.ru`) and Yandex client id/secret stay in untracked `.env` on the API host. The website never talks to SMTP; it posts `/v1/auth/email/start` and `/v1/auth/email/verify`, and links to `/v1/auth/oauth/yandex/start`.
- OpenRouter stays backend-only.

## Consequences

The website and Unity iteration 01 stay separate. The Unity review gate does not move because the public site can sign a parent in. Production email sign-in needs Mail.ru SMTP for `info@zooo.fun`; without it `/v1/auth/email/start` returns 503.

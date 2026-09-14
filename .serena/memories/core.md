# Zooofun — core

Public name Zooofun. Domain `https://zooo.fun`. Seller / operator: ИП Эндреев Константин Андреевич (not ООО «Тык Мык Студио»). Legal answers: `docs/legal/ДАННЫЕ_ДЛЯ_ДОКУМЕНТОВ.md`.

Commercial product is the website **`https://zooo.fun`**. That site is the **`zoofun-web`** repo — `mem:web/core`. This repo is the API, Chudiki island, CRM, Unity, and infra that the site opens.

Unity iteration 01 is a separate slice (`docs/PILOT.md`) and does not replace `zoofun-web`.

Product truth: `docs/PRODUCT.md`, `docs/DECISIONS.md`, `docs/adr/`. Operational snapshot: `docs/WORKING_STATE.md`. If code and `docs/` disagree, stop.

Audience 3–8, parent holds account and pays. UI for pre-readers. Recognition of the child's drawing or real pet beats polish (D-025). No friends, chat, discovery, leagues, StoreKit, subscriptions, foreign acquiring.

Hard constraints: `mem:conventions`. Stack: `mem:tech_stack`. Commands: `mem:suggested_commands`. Done checks: `mem:task_completion`.

Modules:
- backend (FastAPI, Celery, Postgres) — `mem:backend/core`
- Chudiki island (Vite + Three) — `mem:chudiki/core`
- CRM Vue on `crm.zooo.fun` — `mem:crm/core`
- commercial site `zoofun-web` (`zooo.fun`) — `mem:web/core`
- deploy / Caddy / two VPS — `mem:deploy`

Do not invent a new island kind. Garden / meadow / grove only (D-021). Cove in the island client is a local mock, not a shop SKU.

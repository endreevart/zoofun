# Backend

Entry: `backend/app/main.py`. Settings: `backend/app/settings.py`. Env names: repo `.env.example`.

Prefixes (also via `/api/zoo` from the site):
- `/v1/auth/*` email OTP + Yandex — `api/auth.py`, `accounts/otp.py`, `providers/yandex.py`. Dev-only `POST /v1/auth/dev-session` mints `dev@zoofun.local` / `zoofun-dev`.
- `/v1/generation/stylize/*` jobs — `api/stylize.py`, `generation/jobs.py`
- `/v1/zoo/*` family zoo + DIY layout — `api/zoo.py`, `accounts/creatures.py`, `accounts/worlds.py`
- `/v1/plaza/*` shared lawn — `api/plaza.py`, `api/plaza_toys.py`
- `/v1/commerce/*` catalog, quote, T-Bank — `api/commerce.py`, `commerce/promo.py`, `commerce/settlement.py`
- `/v1/crm/*` operator CRM — `api/crm.py`
- `/v1/public/*` garden postcards, mail images, unsubscribe — `api/public.py`
- `/v1/t` analytics — `api/track.py`
- `/staff` SQLAdmin — `admin.py`

World catalog: `backend/app/worlds.py` (garden / meadow / grove only). Caps: 20 creatures / world, 258 DIY props. `GET /v1/auth/me` grants the first `world_diy_garden` if missing (D-027). Extra copies stay paid.

Credits: `accounts/store.py` — new parent `quota_total=1`. Plaza toys: `plaza_toy_quota` / `plaza_toy_used`, SKU `plaza_toy_1` 59 ₽ (D-032). Settlement trusts T-Bank `GetState`, not the webhook alone. Local development grants `plaza_toy_1` without T-Bank (`granted=true`).

Stylize: moderation labels `drawing`|`pet` (`providers/moderation.py`). Pet uses silly-silhouette prompt (D-025 / ADR-0025). Mesh: Tripo 3.0 → 2.5 → Meshy 7. Plaza-toy jobs paint a free preview without mesh; `POST /v1/plaza/toys/commit` starts Tripo without spending `quota_total`. RU host: `OPENROUTER_HTTP_PROXY` (Tripo may override `TRIPO_HTTP_PROXY`). Postcard still stored as `postcard.png`.

Worker + beat: `backend/app/worker.py` (payments ~3m, stale stylize ~1m, mail rules ~15m). Prod `USE_CELERY=true`.

DB seed `featured=True` on `pack_10` disagrees with D-024 island UI (`pack_5` «Выгоднее») — `mem:chudiki/core`.

# Conventions

- Audience 3–8, parent gate. No action that requires reading a long instruction.
- Recognition before polish. Do not "fix" five legs, mixed species, or a real pet's markings.
- Child UI does not collect cards, emails, or choose drawing-vs-pet mode.
- OpenRouter / T-Bank / SMTP / operator credentials: untracked `.env` only. Never Unity, island, website bundle, or MCP.
- Do not send names, voice, precise location, or other child PII to AI providers.
- Partial or invalid creature must never appear. Egg stays until `model_url` exists. No 2.5D standee as the finished web creature (D-015).
- Delete does not restore a credit.
- Original drawings and pet photos stay private. Public strip may show garden postcards only (D-022).
- If `docs/` and code disagree, stop. Do not silently redefine the product.
- Do not publish, deploy, merge, or change production data without an explicit ask.
- Compilation / green lint is not done. Review logs, assets, and device behavior.
- Do not add friends, chat, leagues, StoreKit, subscriptions, or a later biome without a decision + assets.

Python: Ruff. Tests in `backend/tests/`. Alembic under `backend/alembic/versions/`. API routers in `backend/app/api/`.

Island: keep game rules in `chudiki/src/game/`, HUD in `chudiki/src/ui/`. Prefer a test next to the module (`*.test.ts`).

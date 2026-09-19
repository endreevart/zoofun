# Commercial site — zoofun-web

This is the main commercial product. Repo: `/Volumes/Siska/DEVELOP/zoofun-web`. Domain `https://zooo.fun`. Parents land, sign in, pay, and open play here. The island and API live in the zoofun repo; they are not a second product.

Owns: landing, `/auth` (email OTP + Yandex), `/pricing` (promo + T-Bank), `/play` → `/island`, legal HTML under `public/legal/`, cookie banner + first-party analytics. Drawing consent covers a lawn figurine as well as a creature (D-032).

`/play`, `/zoo`, `/island` hide the cookie banner. `/island` loads Metrika webvisor unless necessary-only. `/play` still posts first-party `play.open`.

`/zoo/demo` is the Kenney iteration-00 fixture, not the family zoo.

PWA (D-033): `src/app/manifest.ts` `id` `/island`, `start_url` follows `NEXT_PUBLIC_PLAY_URL` (`/island/` in prod). Icons in `public/icon-192.png` / `icon-512.png`. The install UI and service worker live on the Chudiki island, not the landing.

Env: `NEXT_PUBLIC_API_BASE=/api/zoo`, `NEXT_PUBLIC_PLAY_URL=/island` in prod (local island `:5178`), `ZOO_API_ORIGIN` for server rewrites.

Landing bands: How (draw → photo → live Zufik), Worlds, Zufiki (public garden postcards via `GET /v1/public/garden`).

Serena MCP is started from the zoofun root (Python / island / CRM index). `zoofun-web` is a registered project with its own `.serena/`; activate it when the work is only the site.

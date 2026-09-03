# Virtual Zoo

Virtual Zoo is a child-first game for ages 3–8. A child draws an imaginary animal or photographs a paper drawing; the backend carefully turns it into a recognizable 2.5D creature that appears inside a hand-authored 3D zoo.

The current goal is a fast non-commercial pilot for a test group of up to 10 children. The repository is prepared for development in Cursor.

## Product promise

The child should feel: **“This is my drawing, and it came alive.”**

The generated creature must remain recognizable. Visual polish, animation, or technical convenience must never erase the original idea.

## Current pilot

- Draw in the app or photograph a paper drawing.
- Generate a recognizable transparent 2.5D creature.
- Place it in one beautiful stylized free-roaming 3D zoo.
- Keep at least 20 animals simultaneously active with `walk`, `hop`, `fly`, and `float`.
- Walk, hop, fly, idle, and sleep using that small set of robust movement classes.
- Feed, give water, and wash the creature.
- Open a fantastical creature card and listen to its narration.
- Keep a private, non-competitive local Zoo Stars progress indicator.
- Parent-only settings (no purchases).
- Cloud save and local cache for offline play with already-created animals.

Not in this pilot: payments, subscriptions, StoreKit, acquiring, creation credits, receipts, purchase ledgers, friends, chat, public content, leagues, public rankings, multiple biomes, full automatic 3D character generation, or open-ended stories.

A commercial model is deferred to a post-pilot decision. Do not implement it now.

## Chosen stack

- Client: Unity 6.3 LTS, C#, URP, Shader Graph, Input System, AI Navigation.
- Apple bridge: small Swift/Objective-C layer for camera/photo picker and parental authentication. StoreKit is deferred/post-pilot.
- Backend: FastAPI, PostgreSQL, Redis, Celery, Docker Compose.
- Assets: S3-compatible object storage in deployed environments; local storage in development.
- AI gateway: OpenRouter, called only by the backend with a pinned model/provider.
- Narration: ElevenLabs Multilingual v2, generated once and cached.
- Design: Blender and Figma.

## Repository map

```text
chudiki/            Web playground (draw → creature → island zoo)
client/             Unity project and Apple native bridge
backend/            API, jobs, AI integrations, persistence
infra/              Reverse proxy and deployment material
docs/               Product and engineering source of truth
.cursor/rules/       Persistent Cursor project rules
.cursor/skills/      Reusable project workflows for Cursor Agent
.cursor/mcp.json     Minimal safe MCP configuration
```

The playable web zoo is local: parent site in `zoofun-web` (`/auth` → `/play`), island in `chudiki/` on port 5178. GitHub Pages is not used.

OpenRouter stylize runs only through the local backend. Without the API a drawing still becomes a chudik from the original picture.

## Start here

1. Read [docs/PRODUCT.md](docs/PRODUCT.md), [docs/MVP.md](docs/MVP.md), and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
2. Follow [docs/SETUP.md](docs/SETUP.md).
3. Connect development tools using [docs/MCP_SETUP.md](docs/MCP_SETUP.md).
4. Execute [docs/TECHNICAL_SPIKE.md](docs/TECHNICAL_SPIKE.md) before expanding beyond the pilot.

## Local backend

```bash
cp .env.example .env
docker compose up --build
curl http://localhost:8080/health
```

The starter intentionally contains no production secrets, no generated Unity project, and no provider keys.

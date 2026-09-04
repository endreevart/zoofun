# Development setup

## Required tools

- Git.
- Cursor, current stable release.
- Docker Desktop with Docker Compose.
- Unity Hub.
- Unity 6.3 LTS with iOS and macOS build support.
- Xcode compatible with the selected Unity patch and current App Store submission requirements.
- A physical iPhone/iPad for performance and touch testing.
- Optional: Blender and Figma Desktop.

Do not choose the minimum supported OS/device until the technical spike has been profiled.

## Repository bootstrap

```bash
cp .env.example .env
docker compose up --build
curl http://localhost:8080/health
```

Run backend tests:

```bash
make test
```

That target runs `docker compose run --rm api python -m pytest`.

Host checks, from a clean environment:

```bash
cd backend
uv sync --frozen --extra dev
uv run pytest
uv run ruff check .
uv run ruff format --check .
```

Do not expect `uv run pytest` to work in a fresh tree before `uv sync --frozen --extra dev`.

## Create the Unity project

1. In Unity Hub, install the latest patched Unity 6.3 LTS editor.
2. Add iOS Build Support and macOS Build Support.
3. Create a Universal 3D project at `client/VirtualZoo`.
4. Commit `ProjectSettings/`, `Packages/`, and `Assets/`; do not commit generated Unity folders listed in `.gitignore`.
5. Add released packages compatible with the selected editor patch:
   - Universal RP;
   - Input System;
   - AI Navigation;
   - Test Framework;
   - Addressables only when developer-authored remote content is introduced.
6. Record exact package versions in the Unity-generated `Packages/packages-lock.json`.
7. Create assembly definitions before adding substantial runtime code.
8. Establish a mobile quality profile and measure it on a physical target device.

Do not hand-edit Unity package versions from an online example. Let the selected editor resolve compatible released packages, then commit the lock file.

Do not create the Unity project during iteration `00` bootstrap.

## Suggested Unity folders

```text
Assets/VirtualZoo/
  Art/
  Audio/
  Editor/
  Native/
  Prefabs/
  Scenes/
  Scripts/
    Application/
    Domain/
    Infrastructure/
    Presentation/
  Shaders/
  Tests/
    EditMode/
    PlayMode/
```

## Local secrets

Add provider keys only to `.env`. Leave them empty for health checks and non-provider tests. Never copy them into `.cursor/mcp.json`, Unity assets, ScriptableObjects, or Xcode project files. There are no StoreKit keys.

Web commerce (D-016): `OPERATOR_LOGIN` / `OPERATOR_PASSWORD` unlock SQLAdmin at `/staff`. `TBANK_TERMINAL_KEY` and `TBANK_PASSWORD` unlock checkout. Pack prices start at 0 ₽ until the operator sets them. Do not put T-Bank or operator secrets in the client.

## First implementation order

1. Backend health check and job contract.
2. One beautiful authored Unity zoo, smooth limited camera, and **20+ active fixture creatures** with `walk`, `hop`, `fly`, and `float`.
3. Unity tests, Game View, Console, and a five-minute runtime soak.
4. Upload and asynchronous job polling.
5. One pinned OpenRouter image pipeline.
6. Structured card and ElevenLabs narration.
7. Atomic cache/spawn and offline restart.

Do not add StoreKit, subscriptions, or extra worlds. Web T-Bank credits are D-016 on the API and site, not in the Unity project.

Full expansion beyond the pilot begins only after an external `PASS` and the technical-spike gates.

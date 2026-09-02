# Unity client

Create the Unity project at `client/VirtualZoo` through Unity Hub using the selected patched Unity 6.3 LTS editor and the Universal 3D template.

The repository does not contain a fabricated `Packages/manifest.json`: Unity package availability and compatibility must be resolved by the installed editor, then locked in the generated `Packages/packages-lock.json`.

Before creating gameplay code, read:

- `docs/SETUP.md`
- `docs/ARCHITECTURE.md`
- `docs/CREATURE_PIPELINE.md`
- `docs/TECHNICAL_SPIKE.md`
- `docs/adr/0001-unity-urp-client.md`
- `docs/adr/0003-generated-2-5d-creatures.md`

First build an authored zoo with 20+ active fixture creatures (`walk`, `hop`, `fly`, `float`). Do not begin with live AI generation, backend calls, or payments.

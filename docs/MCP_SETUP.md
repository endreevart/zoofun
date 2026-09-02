# MCP setup for Cursor

MCP servers are development tools. They do not run in the game or backend and must never receive production credentials by default.

## Selected set

### 1. GitHub official MCP — enabled in repository

Purpose: repository context, issues, pull requests, and Actions visibility.

Bootstrap ships `.cursor/mcp.json` with an empty `mcpServers` object so Cursor has no runtime MCP dependency. After a GitHub remote exists, enable the official read-only server below: it uses browser OAuth, selected toolsets, and `GITHUB_READ_ONLY=1`.

Setup:

1. Start Docker Desktop.
2. Open the repository in Cursor and restart Cursor after it discovers the MCP config.
3. Open Cursor Settings → Tools & MCP.
4. Start `github-readonly` and complete the browser OAuth flow.
5. Test with “Read the current repository issues.”

Do not remove `GITHUB_READ_ONLY=1` casually. Enable write operations only for a deliberate issue/PR workflow and review the granted GitHub permissions.

### 2. Unity official MCP — recommended after project creation

Purpose: inspect the live hierarchy, console, components, build settings, assets, and perform reviewed editor actions.

Current status: Unity's official MCP is part of the pre-release/open-beta AI Assistant package and requires Unity 6+, Unity Cloud connection, and an eligible Unity AI trial/subscription. Treat it as useful development tooling, not a required runtime or stable build dependency.

Setup after `client/VirtualZoo` exists:

1. Install the official Unity AI Assistant package version compatible with the selected Unity editor.
2. Connect the project to Unity Cloud and activate the required trial/subscription.
3. Open Edit → Project Settings → AI → Unity MCP.
4. Confirm the bridge is running.
5. Use the Integrations section to configure Cursor; approve the direct client connection in Unity.
6. Test with “Read the Unity console and summarize warnings/errors.”

Safety:

- Inspect hierarchy before any scene mutation.
- Keep destructive/editor-wide tools disabled unless needed.
- Review hierarchy, console, and Git diff after changes.
- Do not adopt a community Unity MCP by default while an official option exists. If the official beta blocks work, evaluate a community alternative as a separately approved dependency with source and license review.

### 3. Figma official MCP — recommended when designs begin

Purpose: read structured frames, variables, components, and design context; optionally write to Figma with an eligible paid seat.

Preferred setup:

1. In Cursor chat run `/add-plugin figma`.
2. Install the official Figma plugin.
3. Open Cursor Settings → Tools & MCP and select Connect.
4. Complete Figma OAuth.

Use read access as the normal mode. Treat Figma as design source-of-truth only after screens and variables are approved.

## Deferred MCPs

- Playwright MCP: add only when a web-based parent/admin tool exists. It does not test the Unity game.
- Sentry/observability MCP: add after the monitoring vendor is selected.
- PostgreSQL MCP: not needed; use migrations, tests, and `psql` through Docker. Never give an agent broad production DB access.
- Filesystem/shell MCP: redundant because Cursor already has repository and terminal tools.
- OpenRouter/ElevenLabs MCP: not used. Those are application integrations implemented and tested through backend adapters.
- Generic “memory” and autonomous browsing MCPs: unnecessary context and permissions for the initial project.

## Security checklist

- Prefer official servers and OAuth.
- Use minimal toolsets and read-only access first.
- Never commit PATs, provider keys, or production DB URLs.
- Review an MCP server's source, publisher, permissions, and update behavior before addition.
- Record accepted MCP additions in `docs/DECISIONS.md`.

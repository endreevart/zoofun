# ADR 0005: Public website opens the Chudiki island after parent email login

## Status

Accepted

## Context

The parent landing lives in `zoofun-web`. The playable island lives in `chudiki`. A Kenney fixture garden already exists at `/zoo/demo` for iteration 00.

## Decision

- Parent email registration and login go to the FastAPI accounts module.
- After a session is created, the site opens `/play`, which loads Chudiki.
- `/zoo/demo` and `/join/demo` stay as the local Kenney demo.
- Child legal names, voice, and other child PII are not collected.
- OpenRouter stays backend-only.

## Consequences

The website and Unity iteration 01 stay separate. The Unity review gate does not move because the public site can sign a parent in.

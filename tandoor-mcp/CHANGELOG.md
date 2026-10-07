# Changelog

## [Unreleased]

## [0.4.0] - 2026-10-07

- Generate a persistent MCP access token automatically on first start.
- Reveal the token on demand through the protected Ingress web UI.
- Keep manually configured MCP tokens as optional overrides.

## [0.3.0] - 2026-10-07

### Änderungen
- Versionsupdate und Wartung.

## [0.3.0] - 2026-10-07

- Add one-time Tandoor login through a protected Home Assistant Ingress UI.
- Store only the returned token with owner-only permissions, bound to its origin.
- Keep manual API token configuration and activate MCP without a restart after login.

## [0.2.0] - 2026-10-07

- Discover installed Tandoor add-ons through Supervisor with the default role.
- Use the internal hostname and container port; keep manual URL support.
- Allow selecting a specific add-on and wait for Tandoor during startup.

## [0.1.0] - 2026-10-07

- Add authenticated Streamable HTTP access to Tandoor for amd64 and aarch64.
- Add read-only, recipe import and optional recipe editing modes.
- Isolate requests and limit bodies, origins and concurrent work.

# Tandoor MCP

Connect an MCP client to Tandoor through an authenticated Streamable HTTP
endpoint. Supports recipe search, details, meal plans and shopping lists, plus
optional recipe creation, URL import and editing. Runs on amd64 and aarch64.
Automatically discovers an installed Tandoor add-on through Supervisor;
manual URLs remain available for external Tandoor installations. Sign in once
through the Home Assistant web UI to save only an API token, or configure an
existing token directly.

See the [configuration and client setup guide](./documentation).
In Home Assistant, the same guide is available in the add-on’s **Documentation** tab. Uses
[@cliftonz/tandoor-recipes-mcp](https://github.com/Cliftonz/tandoor-recipe-mcp)
2.0.1 with a stateless HTTP adapter and MCP SDK 1.31.0. The SDK override fixes
the OAuth client advisory affecting the upstream pinned SDK; this add-on uses
static bearer authentication rather than OAuth.

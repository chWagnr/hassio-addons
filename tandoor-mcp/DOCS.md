# Configuration

1. Install Tandoor MCP from this repository in the Home Assistant app/add-on store.
2. Create a dedicated API token in Tandoor and enter its base address and token.
3. Generate a separate MCP bearer token, for example with `openssl rand -hex 32`.
4. Save the options, start the add-on and enable its watchdog if desired.
5. Connect your MCP client to `http://<HA-host>:3737/mcp` on a trusted network,
   or use your HTTPS reverse proxy endpoint. The host port can be changed in
   the add-on's Network settings.

| Option | Purpose |
| --- | --- |
| `tandoor_url` | Reachable Tandoor HTTP(S) origin, for example `http://tandoor-host:8080`. No `/api` suffix, subpath or embedded credentials. Tandoor 2.x required. |
| `tandoor_token` | Dedicated Tandoor API token. |
| `mcp_token` | Separate random bearer token, 32–256 letters, digits, `_` or `-`. Required; open access is not supported. |
| `access_mode` | `read_only`, `import` (default), or `edit`. Restart after changes. |
| `allowed_origins` | Exact HTTP(S) browser origins, without trailing slash. Empty by default: requests with an Origin header are rejected. Native MCP clients usually omit Origin. |

## Available actions

All modes expose these 15 read tools: `get_version`, `list_recipes`,
`list_recipes_flat`, `search_recipes`, `get_recipe`, `related_recipes`,
`list_meal_plans`, `get_meal_plan`, `list_meal_types`, `list_foods`, `list_units`,
`list_shopping_entries`, `get_shopping_entry`, `list_shopping_list_recipes`,
`get_shopping_list_recipe`. Read resources also expose the week's meal plan,
on-hand foods, active shopping list and meal types.

`import` adds `create_recipe` and `import_recipe_from_url`. The client can
transcribe text or photos into structured recipe steps and ingredients; this
does not require a Tandoor AI provider. URL import uses Tandoor's scraper with
an upstream JSON-LD fallback. Check for duplicates before importing. Recipe
creation can create missing foods, units and keywords as dependencies.

`edit` also enables `update_recipe`, including changes to steps and ingredients.
There are no deletion, administration, token, filesystem-upload, bulk-update,
dynamic tool-enabling or other write tools. The allowlist restricts MCP tools;
it does not change the underlying Tandoor token's permissions. A failed import
may leave partially created dependencies; inspect Tandoor before retrying.

## Client connection

Use Streamable HTTP with an `Authorization: Bearer <mcp_token>` header.
For Codex, a configuration example is:

```toml
[mcp_servers.tandoor]
url = "https://mcp.example.com/mcp"
bearer_token_env_var = "TANDOOR_MCP_BEARER_TOKEN"
```

Set that environment variable in the process running your MCP client. It holds
the MCP token, not the Tandoor API token. Replace an existing stdio connection
with this connection. Reload the client connection after changing it.

The endpoint is stateless: POST JSON-RPC requests to `/mcp`, accepting both
`application/json` and `text/event-stream`. It uses JSON responses and requires
no persistent session. GET and DELETE on `/mcp` return 405; legacy SSE at
`/sse` is not supported. Bodies are limited to 1 MiB and concurrent requests
to 32. `/healthz` is an unauthenticated liveness check, not a Tandoor readiness
or authentication check. Use `get_version` and `list_recipes` to verify access.

## Network and recovery

Port 3737 serves HTTP. For access across untrusted networks, terminate TLS at
your reverse proxy or use a VPN. Forward `/mcp`, preserve the Authorization,
Accept and MCP protocol headers, and allow at least 120 seconds for requests.
Never put either token in a URL. HTTPS to Tandoor uses normal certificate
verification; private CAs and disabling TLS verification are not supported.

No Home Assistant API, Docker access, host networking or directory mounts are
required. Tokens live in Home Assistant add-on options and process memory;
backups containing the options must be treated as sensitive. Recipe data stays
in Tandoor and is not duplicated in this add-on. Requested recipe data reaches
your MCP client's context. Payload/debug logging is disabled.

Use Home Assistant backups for recovery. Rotate the API token in Tandoor and
the bearer token in add-on options/client settings, then restart the add-on.
Stopping the add-on allows up to ten seconds for requests to drain; do not
blindly retry interrupted write requests without checking the resulting recipe.

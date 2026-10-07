# Configuration

1. Install Tandoor MCP from this repository in the Home Assistant app/add-on store.
2. Leave `tandoor_token` empty for one-time login. Leave `tandoor_url` at
   `auto` to discover an installed Tandoor add-on, or enter a manual address.
   Alternatively enter an existing Tandoor API token in `tandoor_token`.
3. Generate a separate MCP bearer token, for example with `openssl rand -hex 32`.
4. Save the options, start the add-on and enable its watchdog if desired.
5. Open the add-on web UI and sign in with your Tandoor username and password
   once (not needed when `tandoor_token` is set).
6. Connect your MCP client to `http://<HA-host>:3737/mcp` on a trusted network,
   or use your HTTPS reverse proxy endpoint. The host port can be changed in
   the add-on's Network settings.

| Option | Purpose |
| --- | --- |
| `tandoor_url` | `auto` (default) discovers an installed Tandoor add-on. Alternatively a reachable HTTP(S) origin, for example `http://tandoor-host:8080`. No `/api` suffix, subpath or embedded credentials. Tandoor 2.x required. An empty value also means automatic discovery. |
| `tandoor_addon` | Optional full installed add-on slug to select a specific Tandoor installation. Used only with automatic discovery. |
| `tandoor_token` | Optional existing Tandoor API token. When empty, use one-time login in the web UI. A configured token takes precedence over a saved login token. |
| `mcp_token` | Separate random bearer token, 32–256 letters, digits, `_` or `-`. Required; open access is not supported. |
| `access_mode` | `read_only`, `import` (default), or `edit`. Restart after changes. |
| `allowed_origins` | Exact HTTP(S) browser origins, without trailing slash. Empty by default: requests with an Origin header are rejected. Native MCP clients usually omit Origin. |

## Automatic Tandoor connection

At startup, the add-on reads Supervisor's store inventory, selects the installed
Tandoor app, then reads its internal hostname and container ports. It connects
directly over the add-on network, independent of published host ports, your
external reverse proxy or ingress. Port 80 is preferred, then 8080, then HTTPS
443; an otherwise unambiguous single TCP port is also supported. Unknown port
layouts and host-network installations require a manual `tandoor_url`.

If multiple Tandoor apps are installed, choose one with `tandoor_addon` rather
than guessing. This also supports a detached/local app not listed in the store.
Discovery waits up to 60 seconds for the selected app to enter the started
state; it never starts or modifies Tandoor itself. Restart MCP after installing
or replacing a Tandoor add-on. The startup API probe is best effort; Tandoor
may take longer to become ready, and subsequent tool requests can retry later.

If Tandoor restricts `ALLOWED_HOSTS`, include its internal hostname in that
list, for example `12345678-tandoor-recipes`. Find the actual name in Supervisor
app details; it normally corresponds to the full slug with underscores replaced
by hyphens. Keep the existing allowed hosts. A rejected hostname can cause HTTP
400 even when the API token is correct. Alternatively use the manual address
that already works for your installation.

Only the address is discovered: authenticate through the web UI or provide a
Tandoor API token. The MCP token is separate. The add-on uses the Supervisor **default** role
and only GET `/store/info` and `/addons/<slug>/info`, with other add-on options
redacted. It needs no manager/admin permissions and reads no Tandoor passwords,
database files or other add-on secrets. See the
[Supervisor access checks](https://github.com/home-assistant/supervisor/blob/main/supervisor/api/middleware/security.py)
and [app info API](https://developers.home-assistant.io/docs/api/supervisor/endpoints/).

## One-time login

The web UI is available only through Home Assistant Ingress. Its separate port
8099 is not published; requests are accepted only from the Supervisor ingress
proxy. Login is not an MCP tool and is not exposed on port 3737. The form uses
CSRF protection, clears the password field after submission and returns no
credentials. Username and password are sent to the configured Tandoor instance
via POST `/api-token-auth/`; neither is written to options, files or logs.
Use HTTPS for manual connections over untrusted networks; automatic discovery
uses HTTP on the internal add-on network. Redirects are rejected.

[Tandoor 2.6.15](https://github.com/TandoorRecipes/recipes/blob/2.6.15/cookbook/views/api.py#L2297)
may return an existing valid read/write token or create one. This does not
guarantee a dedicated MCP token or narrower permissions. The endpoint limits
login attempts to 10 per day; the add-on never automatically retries login.
Once saved, the token is used immediately and after restarts without a password.
Before login, the add-on stays healthy but MCP requests return 503.

The saved token is bound to the resolved Tandoor origin. After changing that
origin, sign in again. For an expired or revoked token, reopen the web UI and
sign in again to replace it. A manually configured token overrides login;
clear `tandoor_token` and restart to switch to the web UI. Replacement is
atomic; failed login or storage leaves the previous working token in place.
Revocation happens in Tandoor and can affect other clients sharing that token.

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

Supervisor API access with the default role is enabled for discovery. No Home
Assistant Core API, Docker access, host networking or directory mounts are
required. The MCP token and any manually configured Tandoor token live in add-on options.
A login token lives in `/data/tandoor-token.json` with owner-only permissions
(`0600`) and in process memory. These are not encrypted at rest; Home Assistant
backups containing options or add-on data must be treated as sensitive. Recipe data stays
in Tandoor and is not duplicated in this add-on. Requested recipe data reaches
your MCP client's context. Payload/debug logging is disabled.

Use Home Assistant backups for recovery. Rotate the API token in Tandoor and
the bearer token in add-on options/client settings, then restart the add-on.
Stopping the add-on allows up to ten seconds for requests to drain; do not
blindly retry interrupted write requests without checking the resulting recipe.

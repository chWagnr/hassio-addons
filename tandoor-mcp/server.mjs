import { logInfo, logError } from './log.mjs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { loadToken, saveToken, login, validToken, resolveMcpToken } from './auth.mjs';
import { createSetupServer } from './setup.mjs';
import { resolveTandoorUrl } from './discovery.mjs';

const MAX_BODY = 1024 * 1024;
const READ_TOOLS = [
  'get_version', 'list_recipes', 'list_recipes_flat', 'search_recipes',
  'get_recipe', 'related_recipes', 'list_meal_plans', 'get_meal_plan',
  'list_meal_types', 'list_foods', 'list_units', 'list_shopping_entries',
  'get_shopping_entry', 'list_shopping_list_recipes', 'get_shopping_list_recipe',
];

export function validateOptions(options) {
  options = { tandoor_addon: '', tandoor_token: '', mcp_token: '', ...options };
  let url;
  const auto = options.tandoor_url === '' || options.tandoor_url === 'auto';
  if (!auto) {
    try { url = new URL(options.tandoor_url); } catch { throw new Error('Set tandoor_url to auto or a valid HTTP(S) origin.'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.search || url.hash || url.pathname !== '/') {
      throw new Error('tandoor_url must be an HTTP(S) origin without credentials, path, query or fragment.');
    }
  }
  if (typeof options.tandoor_addon !== 'string' || (options.tandoor_addon &&
      !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(options.tandoor_addon))) throw new Error('Invalid tandoor_addon slug.');
  if (typeof options.tandoor_token !== 'string' || (options.tandoor_token && !validToken(options.tandoor_token))) throw new Error('Invalid tandoor_token.');
  if (typeof options.mcp_token !== 'string' || (options.mcp_token && !/^[A-Za-z0-9_-]{32,256}$/.test(options.mcp_token))) {
    throw new Error('mcp_token must be empty or contain 32–256 letters, digits, underscores or hyphens.');
  }
  if (!['read_only', 'import', 'edit'].includes(options.access_mode)) throw new Error('Invalid access_mode.');
  if (!Array.isArray(options.allowed_origins) || options.allowed_origins.some(origin => {
    try {
      const parsed = new URL(origin);
      return !['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin;
    } catch { return true; }
  })) throw new Error('allowed_origins must contain exact HTTP(S) origins, without trailing slashes.');
  return { ...options, tandoor_url: auto ? 'auto' : url.origin };
}

function rpcError(res, status, message, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32000, message } }));
}

// Each POST gets its own stateless server/transport. Clients and concurrent
// requests cannot share protocol state or change another client's tool list.
export async function createAddonServer(rawOptions, { tokenPath = '/data/tandoor-token.json', mcpTokenPath = '/data/mcp-token.json', isIngress } = {}) {
  const options = validateOptions(rawOptions);
  options.tandoor_url = await resolveTandoorUrl(options);
  const tools = [...READ_TOOLS];
  if (options.access_mode !== 'read_only') tools.push('create_recipe', 'import_recipe_from_url');
  if (options.access_mode === 'edit') tools.push('update_recipe');
  process.env.TANDOOR_MCP_TRANSPORT = 'http';
  process.env.TANDOOR_MCP_STASH_ENABLED = '0';
  process.env.TANDOOR_MCP_INCLUDE_ONLY = tools.join(',');
  delete process.env.TANDOOR_MCP_EXCLUDE;
  delete process.env.TANDOOR_MCP_LOG;

  // The pinned package's tool filters are evaluated when imported.
  const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js');
  const { StreamableHTTPServerTransport } = await import('@modelcontextprotocol/sdk/server/streamableHttp.js');
  const { TandoorClient } = await import('@cliftonz/tandoor-recipes-mcp/build/clients/index.js');
  const { registerRecipeTools } = await import('@cliftonz/tandoor-recipes-mcp/build/tools/recipe.js');
  const { registerMealPlanTools } = await import('@cliftonz/tandoor-recipes-mcp/build/tools/mealplan.js');
  const { registerShoppingTools } = await import('@cliftonz/tandoor-recipes-mcp/build/tools/shopping.js');
  const { registerFoodUnitTools } = await import('@cliftonz/tandoor-recipes-mcp/build/tools/foodunit.js');
  const { registerMealTypeTools } = await import('@cliftonz/tandoor-recipes-mcp/build/tools/mealtype.js');
  const { registerVersionTools } = await import('@cliftonz/tandoor-recipes-mcp/build/tools/version.js');
  const { registerResources } = await import('@cliftonz/tandoor-recipes-mcp/build/resources/index.js');
  const { checkTandoorVersion } = await import('@cliftonz/tandoor-recipes-mcp/build/lib/version-check.js');
  let token = options.tandoor_token || await loadToken(tokenPath, options.tandoor_url);
  let client = token ? new TandoorClient({ url: options.tandoor_url, token }) : null;
  let versionCheck = client ? await checkTandoorVersion(client) : { status: 'unknown' };
  if (client && versionCheck.status !== 'ok') logError('Tandoor compatibility probe inconclusive or unsupported; check the URL, API token and Tandoor ALLOWED_HOSTS (include the internal hostname when using automatic discovery).');
  const mcpToken = await resolveMcpToken(options.mcp_token, mcpTokenPath);
  const expectedAuth = Buffer.from(`Bearer ${mcpToken}`);
  let active = 0;
  let draining = false;

  const setup = createSetupServer({
    isIngress,
    getMcpToken: () => mcpToken,
    status: () => ({ manual: Boolean(options.tandoor_token), message: options.tandoor_token ? 'Using the API token from add-on options.' : token ? 'Connected using a saved token. Sign in again to replace it.' : 'Sign in to connect Tandoor.' }),
    authenticate: async (username, password) => {
      if (draining) throw new Error('Shutting down.');
      if (options.tandoor_token) throw new Error('Clear tandoor_token in add-on options and restart before signing in.');
      const nextToken = await login(options.tandoor_url, username, password);
      const nextClient = new TandoorClient({ url: options.tandoor_url, token: nextToken });
      const nextVersion = await checkTandoorVersion(nextClient);
      await saveToken(tokenPath, options.tandoor_url, nextToken);
      token = nextToken;
      client = nextClient;
      versionCheck = nextVersion;
      logInfo('Tandoor login successful; API token saved and active. Password not retained.');
    },
  });

  const http = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (draining) return rpcError(res, 503, 'Shutting down');
    if (req.url === '/healthz' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end('{"status":"ok"}');
    }
    const auth = Buffer.from(req.headers.authorization || '');
    if (auth.length !== expectedAuth.length || !timingSafeEqual(auth, expectedAuth)) {
      return rpcError(res, 401, 'Unauthorized', { 'WWW-Authenticate': 'Bearer realm="tandoor-mcp"' });
    }
    if (req.headers.origin && !options.allowed_origins.includes(req.headers.origin)) return rpcError(res, 403, 'Origin not allowed');
    if (req.url !== '/mcp') return rpcError(res, 404, 'Not found');
    if (req.method !== 'POST') return rpcError(res, 405, 'Method not allowed', { Allow: 'POST' });
    if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') return rpcError(res, 415, 'Use application/json');
    if (!client) return rpcError(res, 503, 'Sign in through the add-on web UI or configure tandoor_token.');
    if (active >= 32) return rpcError(res, 503, 'Too many requests', { 'Retry-After': '1' });
    if (Number(req.headers['content-length']) > MAX_BODY) return rpcError(res, 413, 'Payload too large');
    const requestClient = client;
    const requestVersion = versionCheck;
    active++;
    let mcp;
    const cleanup = () => { active--; void mcp?.close().catch(() => {}); };
    res.once('close', cleanup);
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_BODY) {
          rpcError(res, 413, 'Payload too large', { Connection: 'close' });
          return;
        }
        chunks.push(chunk);
      }
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { return rpcError(res, 400, 'Invalid JSON'); }
      if (res.destroyed) return;
      mcp = new McpServer({ name: 'tandoor-mcp-addon', version: '0.4.1' }, {
        instructions: `Tandoor recipe access (${options.access_mode}). Check for duplicates before creating recipes. Text and photos can be transcribed into create_recipe; URLs use import_recipe_from_url.`,
      });
      registerRecipeTools(mcp, requestClient);
      registerMealPlanTools(mcp, requestClient);
      registerShoppingTools(mcp, requestClient);
      registerFoodUnitTools(mcp, requestClient);
      registerMealTypeTools(mcp, requestClient);
      registerVersionTools(mcp, requestClient, { name: '@cliftonz/tandoor-recipes-mcp', version: '2.0.1' }, requestVersion);
      registerResources(mcp, requestClient);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      await mcp.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch {
      // No request bodies, API responses, URLs or credentials in error logs.
      logError('MCP request failed.');
      if (!res.headersSent) rpcError(res, 500, 'Internal server error');
      else res.destroy();
    }
  });
  http.maxConnections = 128;
  http.headersTimeout = 10_000;
  http.requestTimeout = 30_000;
  http.setTimeout(120_000, socket => socket.destroy());
  return {
    http, setup,
    stop() {
      draining = true;
      const closeSetup = new Promise(resolve => { setup.closeAllConnections(); setup.close(resolve); });
      return Promise.all([closeSetup, new Promise(resolve => {
        const deadline = setTimeout(() => http.closeAllConnections(), 10_000);
        deadline.unref();
        http.close(() => { clearTimeout(deadline); resolve(); });
      })]);
    },
  };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  try {
    const options = JSON.parse(await readFile('/data/options.json', 'utf8'));
    const addon = await createAddonServer(options);
    addon.setup.on('error', () => { logError('Cannot listen on setup port.'); process.exit(1); });
    addon.setup.listen(8099, '0.0.0.0');
    addon.http.on('error', () => { logError('Cannot listen on MCP port.'); process.exit(1); });
    addon.http.listen(3737, '0.0.0.0', () => logInfo(`Tandoor MCP listening on port 3737 (${options.access_mode}).`));
    let stopping = false;
    for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, async () => {
      if (stopping) return;
      stopping = true;
      await addon.stop();
      process.exit(0);
    });
  } catch (error) {
    // Validation errors contain only fixed text; parse/file errors might echo secrets.
    logError(error instanceof SyntaxError || error.code ? 'Cannot read valid /data/options.json.' : error.message);
    process.exit(1);
  }
}

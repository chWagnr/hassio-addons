import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { login, loadToken, resolveMcpToken } from '../auth.mjs';
import { createAddonServer } from '../server.mjs';
import { createSetupServer } from '../setup.mjs';
async function listen(server, t) {
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  return `http://127.0.0.1:${server.address().port}`;
}
test('login saves only token with restricted permissions, activates MCP and survives restart', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'tandoor-auth-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const tokenPath = join(directory, 'token.json'); let logins = 0;
  const fake = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api-token-auth/') {
      logins++; assert.equal(req.headers.authorization, undefined);
      let body = ''; for await (const chunk of req) body += chunk;
      assert.deepEqual(JSON.parse(body), { username: 'test-user', password: 'private-password' });
      return res.end('{"token":"saved-api-token"}');
    }
    assert.equal(req.headers.authorization, 'Bearer saved-api-token');
    if (req.url === '/api/server-settings/current/') return res.end('{"version":"2.6.15"}');
    res.end('{"count":0,"results":[]}');
  });
  const url = await listen(fake, t);
  const options = { tandoor_url: url, tandoor_token: '', mcp_token: 'x'.repeat(64), access_mode: 'read_only', allowed_origins: [] };
  const addon = await createAddonServer(options, { tokenPath, isIngress: () => true }); t.after(() => addon.stop());
  const base = await listen(addon.http, t), setup = await listen(addon.setup, t);
  const headers = { Authorization: `Bearer ${options.mcp_token}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
  const rpc = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_recipes', arguments: {} } };
  assert.equal((await fetch(`${base}/mcp`, { method: 'POST', headers, body: JSON.stringify(rpc) })).status, 503);
  const state = await (await fetch(`${setup}/status`)).json();
  const credentials = JSON.stringify({ username: 'test-user', password: 'private-password' });
  assert.equal((await fetch(`${setup}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: credentials })).status, 403);
  assert.equal(logins, 0);
  const result = await fetch(`${setup}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Setup-CSRF': state.csrf }, body: credentials });
  assert.equal(result.status, 200); assert(!(await result.text()).includes('saved-api-token'));
  assert.deepEqual(JSON.parse(await readFile(tokenPath)), { url, token: 'saved-api-token' });
  assert.equal((await stat(tokenPath)).mode & 0o777, 0o600);
  assert.equal(await loadToken(tokenPath, 'https://other.example.com'), '');
  const response = await fetch(`${base}/mcp`, { method: 'POST', headers, body: JSON.stringify(rpc) });
  assert.equal(response.status, 200); assert(!((await response.json()).result.isError));
  const restarted = await createAddonServer(options, { tokenPath }); t.after(() => restarted.stop());
  assert.equal(logins, 1);
  const direct = await listen(restarted.setup, t);
  assert.equal((await fetch(`${direct}/status`, { headers: { 'X-Forwarded-For': '172.30.32.2' } })).status, 403);
});
test('login errors hide upstream responses; redirects never forward credentials', async t => {
  let destinationCalls = 0;
  const destination = await listen(createServer((req, res) => { destinationCalls++; res.end('{}'); }), t);
  for (const status of [400, 429, 302, 200]) {
    const url = await listen(createServer((req, res) => {
      res.writeHead(status, { 'Content-Type': 'application/json', Location: destination });
      res.end(status === 200 ? '{"token":"bad token"}' : '{"error":"private-password"}');
    }), t);
    await assert.rejects(login(url, 'user', 'private-password'), error => !error.message.includes('private-password'));
  }
  assert.equal(destinationCalls, 0);
});
test('setup rejects invalid bodies and oversized requests', async t => {
  let calls = 0;
  const base = await listen(createSetupServer({ isIngress: () => true, status: () => ({}), authenticate: async () => { calls++; } }), t);
  const state = await (await fetch(`${base}/status`)).json();
  const headers = { 'Content-Type': 'application/json', 'X-Setup-CSRF': state.csrf };
  for (const [body, expected] of [['null', 400], ['{', 400], ['x'.repeat(17000), 413]]) {
    assert.equal((await fetch(`${base}/login`, { method: 'POST', headers, body })).status, expected);
  }
  assert.equal(calls, 0);
});

test('automatic MCP token persists, allows overrides and rejects corrupt storage', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'mcp-secret-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'mcp-token.json');
  const token = await resolveMcpToken('', path);
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.equal((await stat(path)).mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(await readFile(path)), { token });
  assert.equal(await resolveMcpToken('', path), token);
  assert.equal(await resolveMcpToken('z'.repeat(64), path), 'z'.repeat(64));
  assert.equal(await resolveMcpToken('', path), token);
  const badPath = join(directory, 'bad.json');
  await (await import('node:fs/promises')).writeFile(badPath, '{}');
  await assert.rejects(resolveMcpToken('', badPath), /Cannot read stored MCP token/);
});

test('generated MCP token is revealed only through protected ingress and authenticates requests', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'mcp-auto-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const fake = await listen(createServer((req, res) => { res.setHeader('Content-Type', 'application/json'); res.end('{"version":"2.6.15"}'); }), t);
  const options = { tandoor_url: fake, tandoor_token: 'api-token', mcp_token: '', access_mode: 'read_only', allowed_origins: [] };
  const paths = { mcpTokenPath: join(directory, 'mcp.json'), isIngress: () => true };
  const addon = await createAddonServer(options, paths); t.after(() => addon.stop());
  const setup = await listen(addon.setup, t), base = await listen(addon.http, t);
  const state = await (await fetch(`${setup}/status`)).json();
  assert.equal(state.token, undefined);
  assert.equal((await fetch(`${setup}/mcp-token`)).status, 405);
  assert.equal((await fetch(`${setup}/mcp-token`, { method: 'POST' })).status, 403);
  const response = await fetch(`${setup}/mcp-token`, { method: 'POST', headers: { 'X-Setup-CSRF': state.csrf } });
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const { token } = await response.json(); assert.match(token, /^[a-f0-9]{64}$/);
  assert.equal((await fetch(`${base}/mcp`)).status, 401);
  assert.equal((await fetch(`${base}/mcp`, { headers: { Authorization: `Bearer ${token}` } })).status, 405);
  const restarted = await createAddonServer(options, { ...paths, isIngress: undefined }); t.after(() => restarted.stop());
  const next = await listen(restarted.http, t), direct = await listen(restarted.setup, t);
  assert.equal((await fetch(`${next}/mcp`, { headers: { Authorization: `Bearer ${token}` } })).status, 405);
  assert.equal((await fetch(`${direct}/mcp-token`, { method: 'POST', headers: { 'X-Setup-CSRF': state.csrf, 'X-Forwarded-For': '172.30.32.2' } })).status, 403);
  assert.equal((await fetch(`${base}/mcp-token`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })).status, 404);
});

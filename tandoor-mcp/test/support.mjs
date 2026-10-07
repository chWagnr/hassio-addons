import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createAddonServer, validateOptions } from '../server.mjs';

export function exercise(mode) {
  test(`${mode}: HTTP authentication, isolation and actual tool calls`, async t => {
    const writes = [];
    const fake = createServer(async (req, res) => {
      assert.equal(req.headers.authorization, 'Bearer test-api-token');
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/api/server-settings/current/') return res.end('{"version":"2.6.15"}');
      if (req.method === 'GET' && req.url.startsWith('/api/food/?')) return res.end('{"results":[{"id":10,"name":"Flour"}]}');
      if (req.method === 'GET' && req.url.startsWith('/api/unit/?')) return res.end('{"results":[{"id":20,"name":"g"}]}');
      if (req.method === 'POST' && req.url === '/api/recipe/') {
        let body = '';
        for await (const chunk of req) body += chunk;
        const recipe = JSON.parse(body);
        writes.push(recipe);
        return res.end(JSON.stringify({ id: 42, ...recipe }));
      }
      if (req.method === 'PATCH' && req.url === '/api/recipe/42/') {
        let body = '';
        for await (const chunk of req) body += chunk;
        writes.push(JSON.parse(body));
        return res.end(JSON.stringify({ id: 42, ...JSON.parse(body) }));
      }
      return res.end('{"count":0,"next":null,"previous":null,"results":[]}');
    });
    fake.listen(0, '127.0.0.1');
    await once(fake, 'listening');
    t.after(() => { fake.closeAllConnections(); fake.close(); });
    const options = {
      tandoor_url: `http://127.0.0.1:${fake.address().port}`,
      tandoor_token: 'test-api-token', mcp_token: 'x'.repeat(64),
      access_mode: mode, allowed_origins: ['https://client.example.com'],
    };
    assert.throws(() => validateOptions({ ...options, mcp_token: '' }));
    assert.throws(() => validateOptions({ ...options, tandoor_url: `${options.tandoor_url}/api` }));
    const addon = await createAddonServer(options);
    addon.http.listen(0, '127.0.0.1');
    await once(addon.http, 'listening');
    t.after(() => addon.stop());
    const base = `http://127.0.0.1:${addon.http.address().port}`;
    const auth = { Authorization: `Bearer ${options.mcp_token}` };
    assert.equal((await fetch(`${base}/healthz`)).status, 200);
    for (const token of ['', 'wrong', 'é'.repeat(64)]) {
      assert.equal((await fetch(`${base}/mcp`, { headers: { Authorization: `Bearer ${token}` } })).status, 401);
    }
    assert.equal((await fetch(`${base}/mcp`, { headers: { ...auth, Origin: 'https://bad.example.com' } })).status, 403);
    assert.equal((await fetch(`${base}/mcp`, { headers: auth })).status, 405);
    assert.equal((await fetch(`${base}/sse`, { headers: auth })).status, 404);
    const headers = { ...auth, 'Content-Type': 'application/json' };
    assert.equal((await fetch(`${base}/mcp`, { method: 'POST', headers, body: '{' })).status, 400);
    assert.equal((await fetch(`${base}/mcp`, { method: 'POST', headers, body: 'x'.repeat(1024 * 1024 + 1) })).status, 413);
    // Stream an oversized request without Content-Length, exercising the body reader.
    const body = new ReadableStream({ start(controller) {
      controller.enqueue(new Uint8Array(1024 * 1024));
      controller.enqueue(new Uint8Array(1));
      controller.close();
    } });
    assert.equal((await fetch(`${base}/mcp`, { method: 'POST', headers, body, duplex: 'half' })).status, 413);
    const clients = await Promise.all([0, 1].map(async i => {
      const client = new Client({ name: `test-${i}`, version: '1.0.0' });
      await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { ...auth, Origin: 'https://client.example.com' } } }));
      t.after(() => client.close());
      return client;
    }));
    const lists = await Promise.all(clients.map(client => client.listTools()));
    for (const list of lists) {
      const names = list.tools.map(tool => tool.name);
      assert.equal(names.length, mode === 'read_only' ? 15 : mode === 'import' ? 17 : 18);
      assert.equal(names.includes('create_recipe'), mode !== 'read_only');
      assert.equal(names.includes('import_recipe_from_url'), mode !== 'read_only');
      assert.equal(names.includes('update_recipe'), mode === 'edit');
      assert(!names.some(name => /delete|token|enable_tool|upload|batch/.test(name)));
    }
    const results = await Promise.all(clients.map(client => client.callTool({ name: 'list_recipes', arguments: {} })));
    assert(results.every(result => !result.isError));
    assert.equal((await clients[0].listResources()).resources.length, 4);
    const create = await clients[0].callTool({ name: 'create_recipe', arguments: { name: 'Test recipe', servings: 2, steps: [{ instruction: 'Cook.', ingredients: [{ food: 'Flour', amount: 250, unit: 'g' }] }] } });
    assert.equal(Boolean(create.isError), mode === 'read_only');
    if (mode !== 'read_only') {
      assert.equal(writes[0].name, 'Test recipe');
      assert.equal(writes[0].steps[0].instruction, 'Cook.');
      assert.equal(writes[0].steps[0].ingredients[0].food.id, 10);
      assert.equal(writes[0].steps[0].ingredients[0].unit.id, 20);
      assert.equal(writes[0].steps[0].ingredients[0].amount, 250);
    }
    const update = await clients[0].callTool({ name: 'update_recipe', arguments: { id: 42, name: 'Edited recipe' } });
    assert.equal(Boolean(update.isError), mode !== 'edit');
    assert.equal(writes.length, mode === 'read_only' ? 0 : mode === 'import' ? 1 : 2);
    const denied = await clients[0].callTool({ name: 'delete_recipe', arguments: { id: 42 } });
    assert.equal(denied.isError, true);
  });
}

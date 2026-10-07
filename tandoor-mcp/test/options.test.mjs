import test from 'node:test';
import assert from 'node:assert/strict';
import { persistOptions } from '../options.mjs';
import { resolveMcpToken } from '../auth.mjs';

test('self-options preserve user values and secret references and verify persistence', async () => {
  let options = { mcp_token: '', tandoor_token: '!secret tandoor', access_mode: 'edit' };
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push([url, init.method]);
    assert.equal(init.headers.Authorization, 'Bearer test');
    assert.equal(init.redirect, 'error');
    if (init.method === 'POST') options = JSON.parse(init.body).options;
    return { ok: true, json: async () => ({ result: 'ok', data: { options } }) };
  };
  await persistOptions({ mcp_token: 'x'.repeat(64) }, { token: 'test', fetchImpl });
  assert.equal(options.tandoor_token, '!secret tandoor');
  assert.equal(options.access_mode, 'edit');
  assert.deepEqual(calls.map(call => call[1]), ['GET', 'POST', 'GET']);
  assert(calls.every(call => call[0].startsWith('http://supervisor/addons/self/')));
  await assert.rejects(persistOptions({ mcp_token: 'y'.repeat(64) }, { token: 'test', fetchImpl }), /changed during startup/);
});

test('failed or unconfirmed option writes fail without exposing upstream details', async () => {
  for (const failure of ['denied', 'network', 'unconfirmed']) {
    await assert.rejects(persistOptions({ mcp_token: 'x'.repeat(64) }, {
      token: 'private', fetchImpl: async (url, init) => {
        if (init.method === 'POST' && failure === 'network') throw new Error('reflected-secret');
        return { ok: init.method !== 'POST' || failure !== 'denied', json: async () => ({ result: 'ok', data: { options: { mcp_token: '' } } }) };
      },
    }), error => !error.message.includes('reflected-secret'));
  }
});

test('MCP tokens are persisted only in options; generation fails if persistence fails', async () => {
  let saved;
  const token = await resolveMcpToken('', { persist: async patch => { saved = patch.mcp_token; } });
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.equal(saved, token);
  assert.equal(await resolveMcpToken(token, { persist: async () => { throw new Error('unnecessary write'); } }), token);
  await assert.rejects(resolveMcpToken(''), /persistent add-on options/);
  await assert.rejects(resolveMcpToken('', { persist: async () => { throw new Error('write failed'); } }), /write failed/);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { selectTandoor, internalTandoorUrl, resolveTandoorUrl } from '../discovery.mjs';
import { validateOptions } from '../server.mjs';

const slug = '12345678_tandoor_recipes';
const installed = { slug, name: 'Tandoor recipes', installed: true };
const info = { hostname: '12345678-tandoor-recipes', host_network: false, network: { '80/tcp': 9191 }, state: 'started' };

test('only installed Tandoor apps are selected; ambiguity requires an explicit choice', () => {
  assert.equal(selectTandoor([installed, { slug: 'other_tandoor_mcp', name: 'Tandoor MCP', installed: true }, { ...installed, slug: 'other_tandoor_recipes', installed: false }]), slug);
  assert.throws(() => selectTandoor([{ ...installed, installed: false }]));
  assert.throws(() => selectTandoor([installed, { ...installed, slug: 'other_tandoor_recipes' }]));
  assert.equal(selectTandoor([installed, { ...installed, slug: 'other_tandoor_recipes' }], slug), slug);
});

test('internal ports do not depend on published host ports or ingress', () => {
  assert.equal(internalTandoorUrl(info), 'http://12345678-tandoor-recipes');
  assert.equal(internalTandoorUrl({ ...info, network: { '80/tcp': null } }), 'http://12345678-tandoor-recipes');
  assert.equal(internalTandoorUrl({ ...info, network: { '8080/tcp': 9191 } }), 'http://12345678-tandoor-recipes:8080');
  assert.equal(internalTandoorUrl({ ...info, network: { '443/tcp': 9443 } }), 'https://12345678-tandoor-recipes');
  assert.throws(() => internalTandoorUrl({ ...info, network: { '22/tcp': 22, '5432/tcp': 5432 } }));
  assert.throws(() => internalTandoorUrl({ ...info, host_network: true }));
  assert.throws(() => internalTandoorUrl({ ...info, hostname: 'evil.test/path' }));
});

test('discovery uses only default-role GET endpoints and retries boot ordering', async () => {
  const requests = [];
  let time = 0;
  let details = 0;
  const fetchImpl = async (url, init) => {
    requests.push(url);
    assert.equal(init.headers.Authorization, 'Bearer test-supervisor-token');
    assert.equal(init.redirect, 'error');
    assert.equal(init.method, undefined); // fetch default is GET
    const data = url.endsWith('/store/info') ? { addons: [installed] } : { ...info, state: ++details === 1 ? 'stopped' : 'started' };
    return { ok: true, json: async () => ({ result: 'ok', data }) };
  };
  assert.equal(await resolveTandoorUrl({ tandoor_url: 'auto' }, {
    token: 'test-supervisor-token', fetchImpl, now: () => time, wait: async ms => { time += ms; },
  }), 'http://12345678-tandoor-recipes');
  assert.deepEqual(requests, ['http://supervisor/store/info', `http://supervisor/addons/${slug}/info`, `http://supervisor/addons/${slug}/info`]);
});

test('manual URL bypasses Supervisor; explicit slug supports detached apps', async () => {
  const never = async () => { throw new Error('Supervisor should not be queried'); };
  assert.equal(await resolveTandoorUrl({ tandoor_url: 'https://tandoor.example.com' }, { fetchImpl: never }), 'https://tandoor.example.com');
  let calls = 0;
  assert.equal(await resolveTandoorUrl({ tandoor_url: 'auto', tandoor_addon: slug }, {
    token: 'test-supervisor-token', fetchImpl: async url => {
      calls++;
      assert.equal(url, `http://supervisor/addons/${slug}/info`);
      return { ok: true, json: async () => ({ result: 'ok', data: info }) };
    },
  }), 'http://12345678-tandoor-recipes');
  assert.equal(calls, 1);
});

test('missing access, denied access and stopped Tandoor fail without secret output', async () => {
  await assert.rejects(resolveTandoorUrl({ tandoor_url: 'auto' }, { token: '' }), /Supervisor access/);
  await assert.rejects(resolveTandoorUrl({ tandoor_url: 'auto' }, {
    token: 'secret', fetchImpl: async () => ({ ok: false }),
  }), /Cannot read Supervisor/);
  let time = 0;
  await assert.rejects(resolveTandoorUrl({ tandoor_url: 'auto', tandoor_addon: slug }, {
    token: 'secret', now: () => time, wait: async ms => { time += ms; },
    fetchImpl: async () => ({ ok: true, json: async () => ({ result: 'ok', data: { ...info, state: 'stopped' } }) }),
  }), /did not start within 60 seconds/);
  await assert.rejects(resolveTandoorUrl({ tandoor_url: 'auto' }, {
    token: 'secret', fetchImpl: async () => { throw new Error('reflected-secret'); },
  }), error => !error.message.includes('reflected-secret'));
});

test('auto and legacy empty URLs validate; malformed manual URLs and slugs fail', () => {
  const options = { tandoor_url: 'auto', tandoor_token: 'api-test', mcp_token: 'x'.repeat(64), access_mode: 'import', allowed_origins: [] };
  assert.equal(validateOptions(options).tandoor_url, 'auto');
  assert.equal(validateOptions({ ...options, tandoor_url: '' }).tandoor_url, 'auto');
  assert.throws(() => validateOptions({ ...options, tandoor_url: 'https://user:password@example.com' }));
  assert.throws(() => validateOptions({ ...options, tandoor_addon: '../other' }));
});

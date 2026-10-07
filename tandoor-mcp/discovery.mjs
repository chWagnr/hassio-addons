import { logInfo } from './log.mjs';
import { setTimeout as delay } from 'node:timers/promises';

const SLUG = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

export function selectTandoor(addons, preferred = '') {
  if (!Array.isArray(addons)) throw new Error('Supervisor returned no app inventory.');
  const candidates = addons.filter(addon => addon.installed === true &&
    SLUG.test(addon.slug || '') && (preferred ? addon.slug === preferred :
      /(?:^|_)tandoor(?:_recipes)?$/.test(addon.slug) || /^tandoor(?: recipes)?$/i.test(addon.name || '')));
  if (candidates.length === 0) throw new Error('No installed Tandoor add-on found. Install Tandoor or set tandoor_url manually.');
  if (candidates.length > 1) throw new Error('Multiple Tandoor add-ons found. Set tandoor_addon to the desired slug or set tandoor_url manually.');
  return candidates[0].slug;
}

export function internalTandoorUrl(info) {
  if (info.host_network) throw new Error('Host-network Tandoor add-ons require a manual tandoor_url.');
  if (typeof info.hostname !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(info.hostname)) {
    throw new Error('Tandoor add-on has no valid internal hostname. Set tandoor_url manually.');
  }
  const ports = Object.keys(info.network || {}).filter(key => /^\d+\/tcp$/.test(key))
    .map(key => Number(key.split('/')[0])).filter(port => port >= 1 && port <= 65535);
  // Use container ports, even if their published host mapping is disabled.
  // Known Tandoor frontends: alexbelgium's nginx on 80, upstream on 8080.
  let port = [80, 8080, 443].find(value => ports.includes(value));
  if (!port && ports.length === 1) port = ports[0];
  if (!port) throw new Error('Cannot determine the Tandoor HTTP port. Set tandoor_url manually.');
  return new URL(`${port === 443 ? 'https' : 'http'}://${info.hostname}:${port}`).origin;
}

export async function resolveTandoorUrl(options, {
  token = process.env.SUPERVISOR_TOKEN,
  fetchImpl = fetch,
  wait = delay,
  now = Date.now,
} = {}) {
  if (options.tandoor_url && options.tandoor_url !== 'auto') return options.tandoor_url;
  if (!token) throw new Error('Automatic discovery requires Supervisor access. Set tandoor_url manually outside Home Assistant.');
  async function get(path) {
    let response;
    let payload;
    try {
      response = await fetchImpl(`http://supervisor${path}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5000), redirect: 'error',
      });
      if (!response.ok) throw new Error();
      payload = await response.json();
    } catch { throw new Error('Cannot read Supervisor discovery information. Check Supervisor access or set tandoor_url manually.'); }
    if (payload.result !== 'ok' || !payload.data) throw new Error('Supervisor discovery request failed.');
    return payload.data;
  }
  // /store/info and /addons/<slug>/info are readable with the default role.
  // /addons would require manager rights, including access to other app secrets.
  let slug = options.tandoor_addon || '';
  if (!slug) slug = selectTandoor((await get('/store/info')).addons);
  if (!SLUG.test(slug)) throw new Error('Invalid tandoor_addon slug.');
  const deadline = now() + 60_000;
  let info;
  while (true) {
    info = await get(`/addons/${slug}/info`);
    if (info.state === 'started') break;
    if (now() >= deadline) throw new Error('Tandoor add-on did not start within 60 seconds. Start Tandoor and restart Tandoor MCP.');
    await wait(2000);
  }
  const url = internalTandoorUrl(info);
  logInfo(`Discovered Tandoor add-on ${slug}; using its internal service.`);
  return url;
}

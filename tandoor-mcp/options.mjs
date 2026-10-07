// Only access our own Supervisor options; keep unrelated values and !secret references.
export async function persistOptions(patch, { token = process.env.SUPERVISOR_TOKEN, fetchImpl = fetch } = {}) {
  if (!token) throw new Error('Cannot populate add-on options without Supervisor access.');
  async function request(path, body) {
    try {
      const response = await fetchImpl(`http://supervisor/addons/self/${path}`, {
        method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(5000),
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (!response.ok) throw new Error();
      const payload = await response.json();
      if (payload.result !== 'ok') throw new Error();
      return payload.data;
    } catch { throw new Error('Cannot persist add-on options through Supervisor. Retry startup after checking Supervisor access.'); }
  }
  const current = (await request('info'))?.options;
  if (!current || typeof current !== 'object' || Array.isArray(current)) throw new Error('Supervisor returned no add-on options.');
  // A user may have filled the field after options.json was loaded. Do not overwrite it.
  for (const key of Object.keys(patch)) {
    if (current[key] && current[key] !== patch[key]) throw new Error('Add-on options changed during startup. Restart to use the latest configuration.');
  }
  await request('options', { options: { ...current, ...patch } });
  const verified = (await request('info'))?.options;
  if (Object.entries(patch).some(([key, value]) => verified?.[key] !== value)) {
    throw new Error('Cannot confirm persisted add-on options. Restart to read the current configuration.');
  }
}

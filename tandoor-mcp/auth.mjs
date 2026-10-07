import { readFile, open, rename, unlink } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';

export const validToken = token => typeof token === 'string' && token.length > 0 && token.length <= 4096 && !/\s/.test(token);

export async function loadToken(path, url) {
  try {
    const saved = JSON.parse(await readFile(path, 'utf8'));
    return saved.url === url && validToken(saved.token) ? saved.token : '';
  } catch (error) {
    if (error.code === 'ENOENT') return '';
    throw new Error('Cannot read stored Tandoor token.');
  }
}

export async function saveToken(path, url, token) {
  const temporary = join(dirname(path), `.token-${randomBytes(16).toString('hex')}`);
  let file;
  try {
    file = await open(temporary, 'wx', 0o600);
    await file.writeFile(JSON.stringify({ url, token }));
    await file.sync();
    await file.close();
    file = undefined;
    await rename(temporary, path);
  } catch {
    throw new Error('Cannot save Tandoor token.');
  } finally {
    await file?.close().catch(() => {});
    await unlink(temporary).catch(() => {});
  }
}

export async function login(url, username, password) {
  if (typeof username !== 'string' || !username.trim() || username.length > 1024 ||
      typeof password !== 'string' || !password || password.length > 4096) {
    throw new Error('Enter a Tandoor username and password.');
  }
  let response;
  try {
    response = await fetch(`${url}/api-token-auth/`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15_000),
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ username, password }),
    });
  } catch { throw new Error('Cannot reach Tandoor login. Check its address and allowed hosts.'); }
  if (response.status === 429) throw new Error('Tandoor login limit reached. Try again later.');
  if (!response.ok) throw new Error('Tandoor login failed. Check your credentials and Tandoor configuration.');
  try {
    const data = await response.json();
    if (!validToken(data.token)) throw new Error();
    return data.token;
  } catch { throw new Error('Tandoor returned an invalid token response.'); }
}

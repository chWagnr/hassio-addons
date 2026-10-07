import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';

const page = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tandoor MCP setup</title>
<style>body{font:16px system-ui;max-width:36rem;margin:3rem auto;padding:1rem;background:#fafafa;color:#202020}label,input,button{display:block}input,button{font:inherit;padding:.6rem;margin:.4rem 0 1rem;box-sizing:border-box;width:100%}button{cursor:pointer}#status{white-space:pre-wrap}</style>
<h1>Tandoor MCP</h1><p id="status" role="status">Loading connection status…</p>
<p>Sign in once to Tandoor. Only the API token is saved; your password is not retained. Tandoor may reuse an existing token.</p>
<form><label>Username<input name="username" autocomplete="username" required maxlength="1024"></label><label>Password<input name="password" type="password" autocomplete="current-password" required maxlength="4096"></label><button>Sign in</button></form>
<h2>MCP client access</h2><p>Copy this separate access token into your MCP client settings.</p><button id="reveal" type="button">Show MCP token</button><input id="mcp-token" type="password" readonly aria-label="MCP access token" autocomplete="off" hidden>
<script src="setup.js"></script></html>`;
const script = `const form=document.querySelector('form'),status=document.querySelector('#status');let csrf;
fetch('status').then(r=>r.json()).then(data=>{csrf=data.csrf;status.textContent=data.message;form.hidden=data.manual;}).catch(()=>{status.textContent='Cannot load connection status.';});
document.querySelector('#reveal').addEventListener('click',async()=>{const input=document.querySelector('#mcp-token'),button=document.querySelector('#reveal');if(!input.hidden){input.value='';input.hidden=true;button.textContent='Show MCP token';return;}try{const response=await fetch('mcp-token',{method:'POST',headers:{'X-Setup-CSRF':csrf}});if(!response.ok)throw new Error();const data=await response.json();input.value=data.token;input.type='text';input.hidden=false;input.select();button.textContent='Hide MCP token';}catch{status.textContent='Cannot retrieve MCP token. Reload the setup page.';}});
form.addEventListener('submit',async event=>{event.preventDefault();const button=form.querySelector('button');button.disabled=true;const username=form.username.value,password=form.password.value;form.password.value='';try{const response=await fetch('login',{method:'POST',headers:{'Content-Type':'application/json','X-Setup-CSRF':csrf},body:JSON.stringify({username,password})});const data=await response.json();status.textContent=data.message;if(response.ok)form.reset();}catch{status.textContent='Connection failed. Check the connection status before retrying.';}finally{button.disabled=false;}});`;

export function createSetupServer({ status, authenticate, getMcpToken, isIngress = address => ['172.30.32.2', '::ffff:172.30.32.2'].includes(address) }) {
  const csrf = randomBytes(32).toString('hex');
  let busy = false;
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'none'; base-uri 'none'");
    const send = (code, message) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ message })); };
    if (!isIngress(req.socket.remoteAddress)) return send(403, 'Ingress access only.');
    if (req.method === 'GET' && (req.url === '/' || req.url === '/setup.js')) {
      res.writeHead(200, { 'Content-Type': req.url === '/' ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8' });
      return res.end(req.url === '/' ? page : script);
    }
    if (req.method === 'GET' && req.url === '/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ...status(), csrf }));
    }
    if (req.url === '/mcp-token') {
      if (req.method !== 'POST') return send(405, 'Use POST.');
      if (req.headers['x-setup-csrf'] !== csrf) return send(403, 'Reload the setup page.');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ token: getMcpToken() }));
    }
    if (req.url !== '/login') return send(404, 'Not found.');
    if (req.method !== 'POST') return send(405, 'Use POST.');
    if (req.headers['x-setup-csrf'] !== csrf) return send(403, 'Reload the setup page.');
    if (req.headers['content-type'] !== 'application/json') return send(415, 'Use application/json.');
    if (busy) return send(429, 'Login already in progress.');
    busy = true;
    try {
      let size = 0;
      const chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 16 * 1024) { res.setHeader('Connection', 'close'); return send(413, 'Login request too large.'); }
        chunks.push(chunk);
      }
      let data;
      try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { return send(400, 'Invalid login request.'); }
      if (!data || typeof data !== 'object') return send(400, 'Invalid login request.');
      try { await authenticate(data.username, data.password); }
      catch (error) { return send(400, error.message); }
      finally { delete data.password; }
      send(200, 'Connected. The token is saved; the password is not retained.');
    } catch {
      if (!res.destroyed) send(400, 'Cannot read login request.');
    } finally { busy = false; }
  });
  server.requestTimeout = 20_000;
  server.headersTimeout = 10_000;
  server.setTimeout(25_000, socket => socket.destroy());
  return server;
}

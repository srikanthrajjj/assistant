import assert from 'node:assert'; import fs from 'node:fs'; import { execFileSync } from 'node:child_process';
const env = { GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'sec', APP_TOKEN: 'tok-123', PUBLIC_URL: 'https://example.test', DATA_FILE: '/tmp/mvp-oauth.json' };
try { fs.unlinkSync(env.DATA_FILE) } catch {}
const run = (code) => execFileSync('node', ['--input-type=module', '-e', code], { env: { ...process.env, ...env }, cwd: process.cwd() }).toString().trim();

// 1) make a link in one process, validate it in a brand-new process (= server restart / redeploy)
const link = run(`import * as G from './google.js'; console.log(G.newConnectLink())`);
const n = new URL(link).searchParams.get('n');
assert.equal(run(`import * as G from './google.js'; console.log(G.takeNonce(${JSON.stringify(n)}))`), 'true', 'link survives restart');

// 2) full flow through the real HTTP routes
Object.assign(process.env, env);
const { app } = await import('./index.js'); const s = app.listen(0); const base = `http://127.0.0.1:${s.address().port}`;
const hit = (p) => fetch(base + p, { redirect: 'manual' });
let r = await hit('/auth/google?n=' + n); assert.equal(r.status, 302);
const loc = new URL(r.headers.get('location')); assert.equal(loc.host, 'accounts.google.com');
assert.equal(loc.searchParams.get('redirect_uri'), 'https://example.test/auth/google/callback');
assert.equal(loc.searchParams.get('scope'), 'https://www.googleapis.com/auth/gmail.readonly');
assert.equal((await hit('/auth/google?n=bad.link')).status, 401, 'bad link rejected');
globalThis.fetchReal = globalThis.fetch;
const realFetch = globalThis.fetch;
globalThis.fetch = async (u, o) => String(u).includes('oauth2.googleapis.com') ? { ok: true, status: 200, json: async () => ({ access_token: 'a', refresh_token: 'REFRESH123', expires_in: 3600 }) } : realFetch(u, o);
r = await realFetch(base + '/auth/google/callback?code=abc&state=' + encodeURIComponent(loc.searchParams.get('state')));
const body = await r.text(); assert.ok(body.includes('Gmail connected') && body.includes('REFRESH123'));
assert.equal((await realFetch(base + '/auth/google/callback?code=abc&state=forged')).status, 400, 'forged state rejected');
const { gmailConnected } = await import('./google.js'); assert.equal(gmailConnected(), true);
console.log('OAUTH FLOW OK'); process.exit(0);

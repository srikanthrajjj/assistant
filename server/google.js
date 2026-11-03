import { db, save } from './db.js';
const SCOPES = 'https://www.googleapis.com/auth/gmail.readonly';
const cfg = () => ({ id: process.env.GOOGLE_CLIENT_ID, secret: process.env.GOOGLE_CLIENT_SECRET,
  redirect: (process.env.PUBLIC_URL || 'https://assistant-mvp.onrender.com') + '/auth/google/callback' });
export const googleConfigured = () => !!(cfg().id && cfg().secret);
const refreshToken = () => db.google?.refresh || process.env.GOOGLE_REFRESH_TOKEN;
let broken = false;   // set when Google says the token is revoked/expired (tokens of apps in Testing mode expire after ~7 days)
export const gmailConnected = () => googleConfigured() && !!refreshToken() && !broken;

export const authUrl = (state) => 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
  client_id: cfg().id, redirect_uri: cfg().redirect, response_type: 'code', scope: SCOPES, access_type: 'offline', prompt: 'consent', state });

export async function exchangeCode(code) {
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: cfg().id, client_secret: cfg().secret, redirect_uri: cfg().redirect, grant_type: 'authorization_code' }) });
  const j = await r.json(); if (!r.ok) throw new Error('google: ' + JSON.stringify(j));
  broken = false; db.google = { refresh: j.refresh_token || refreshToken(), access: j.access_token, exp: Date.now() + j.expires_in * 1000 - 60000 }; save();
  return j.refresh_token;
}
async function accessToken() {
  if (db.google?.access && db.google.exp > Date.now()) return db.google.access;
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ refresh_token: refreshToken(), client_id: cfg().id, client_secret: cfg().secret, grant_type: 'refresh_token' }) });
  const j = await r.json();
  if (!r.ok) {
    if (j.error === 'invalid_grant') { broken = true; if (db.google) { db.google.refresh = null; db.google.access = null; save(); } throw new Error('Gmail access expired or was revoked. Ask the user to connect Gmail again (call connect_gmail).'); }
    throw new Error('google refresh: ' + JSON.stringify(j));
  }
  db.google = { ...(db.google || {}), refresh: refreshToken(), access: j.access_token, exp: Date.now() + j.expires_in * 1000 - 60000 }; save();
  return j.access_token;
}
const gmail = async (path) => {
  const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/' + path, { headers: { authorization: 'Bearer ' + await accessToken() } });
  if (!r.ok) throw new Error('gmail ' + r.status); return r.json();
};
const hdr = (m, n) => m.payload?.headers?.find(h => h.name.toLowerCase() === n)?.value || '';

export async function searchEmails(q, max = 10) {
  const l = await gmail(`messages?maxResults=${max}&q=${encodeURIComponent(q)}`);
  return Promise.all((l.messages || []).map(async ({ id }) => {
    const m = await gmail(`messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`);
    return { id, from: hdr(m, 'from'), subject: hdr(m, 'subject'), date: hdr(m, 'date'), snippet: m.snippet };
  }));
}
const b64 = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
function bodyText(p) {
  if (!p) return '';
  if (p.mimeType === 'text/plain' && p.body?.data) return b64(p.body.data);
  for (const c of p.parts || []) { const t = bodyText(c); if (t) return t; }
  return p.body?.data ? b64(p.body.data).replace(/<[^>]+>/g, ' ') : '';
}
export async function readEmail(id) {
  const m = await gmail(`messages/${id}?format=full`);
  return { id, from: hdr(m, 'from'), subject: hdr(m, 'subject'), date: hdr(m, 'date'), body: bodyText(m.payload).replace(/\s+/g, ' ').slice(0, 4000) };
}

// one-time links so the APP_TOKEN never appears in a URL
const nonces = new Map(), states = new Map();
const fresh = (m) => { const k = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2); m.set(k, Date.now() + 600000); return k; };
const take = (m, k) => { const e = m.get(k); m.delete(k); return !!e && e > Date.now(); };
export const newConnectLink = () => (process.env.PUBLIC_URL || 'https://assistant-mvp.onrender.com') + '/auth/google?n=' + fresh(nonces);
export const takeNonce = (k) => take(nonces, k);
export const newState = () => fresh(states);
export const takeState = (k) => take(states, k);

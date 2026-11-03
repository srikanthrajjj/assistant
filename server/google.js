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
  const j = await r.json(); if (!r.ok) { const e = new Error('google: ' + (j.error_description || j.error)); e.code = j.error; throw e; }
  lastError = null; broken = false; db.google = { refresh: j.refresh_token || refreshToken(), access: j.access_token, exp: Date.now() + j.expires_in * 1000 - 60000 }; save();
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
  if (!r.ok) {
    let reason = ''; try { const j = await r.json(); reason = j.error?.errors?.[0]?.reason || j.error?.status || ''; } catch {}
    const e = new Error(hintFor(r.status === 403 && /accessNotConfigured|SERVICE_DISABLED/i.test(reason) ? 'gmail_api_disabled' : r.status === 403 ? 'gmail_forbidden' : 'gmail_' + r.status));
    e.code = 'gmail_' + r.status; setGoogleError({ code: e.code, message: e.message }); throw e;
  }
  return r.json();
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

// Stateless signed links: survive server restarts/redeploys and work on any instance. Valid for 10 minutes.
import crypto from 'node:crypto';
const sigKey = () => (process.env.APP_TOKEN || 'dev-token') + '|' + (process.env.GOOGLE_CLIENT_SECRET || '');
const sign = (kind, exp) => crypto.createHmac('sha256', sigKey()).update(kind + exp).digest('hex').slice(0, 32);
const make = (kind) => { const exp = Date.now() + 600000; return exp + '.' + sign(kind, exp); };
const check = (kind, v) => {
  const [exp, sig] = String(v || '').split('.');
  if (!exp || !sig || !(Number(exp) > Date.now())) return false;
  const want = Buffer.from(sign(kind, exp)), got = Buffer.from(sig);
  return want.length === got.length && crypto.timingSafeEqual(want, got);
};
export const newConnectLink = () => (process.env.PUBLIC_URL || 'https://assistant-mvp.onrender.com') + '/auth/google?n=' + make('nonce');
export const takeNonce = (k) => check('nonce', k);
export const newState = () => make('state');
export const takeState = (k) => check('state', k);

// ---- diagnostics: say exactly what is wrong and how to fix it ----
let lastError = null;
export function hintFor(code) {
  const hints = {
    access_denied: 'Google blocked this account. In Google Cloud open APIs & Services, then OAuth consent screen, then Audience, and add your Gmail address under Test users. Then try again.',
    redirect_uri_mismatch: 'The redirect link in Google Cloud does not match. Add exactly this under Credentials, your OAuth client, Authorized redirect URIs: ' + cfg().redirect,
    invalid_client: 'The Client ID or Client secret in Render does not match your Google OAuth client. Copy both again with no spaces.',
    unauthorized_client: 'The Client ID or Client secret in Render does not match your Google OAuth client. Copy both again with no spaces.',
    invalid_grant: 'That sign-in code expired or was already used. Start again from the app.',
    gmail_api_disabled: 'The Gmail API is not turned on in your Google Cloud project. Open APIs & Services, then Library, search for Gmail API and click Enable.',
    gmail_forbidden: 'Google refused access to Gmail. Reconnect and make sure you allow read access to your mail when Google asks.',
    gmail_401: 'The Gmail login expired. Reconnect Gmail.',
    bad_link: 'This link is invalid or expired. Open the app and tap Connect Gmail again.',
  };
  return hints[code] || ('Something went wrong (' + code + '). Try connecting again.');
}
export function setGoogleError(e) { lastError = e ? { at: Date.now(), code: e.code, hint: e.hint || hintFor(e.code), message: e.message } : null; }
export function diagnose() {
  const c = cfg();
  return { clientId: !!c.id, clientSecret: !!c.secret, redirectUri: c.redirect, publicUrlSet: !!process.env.PUBLIC_URL,
    connected: gmailConnected(), persistent: !!process.env.DATABASE_URL || !!process.env.GOOGLE_REFRESH_TOKEN, lastError };
}

import assert from 'node:assert'; import fs from 'node:fs';
process.env.DATA_FILE = '/tmp/mvp-g2.json'; try { fs.unlinkSync(process.env.DATA_FILE) } catch {}
process.env.GOOGLE_CLIENT_ID = 'cid'; process.env.GOOGLE_CLIENT_SECRET = 'sec'; process.env.GOOGLE_REFRESH_TOKEN = 'rt';
let revoked = false, listUrl = '';
globalThis.fetch = async (url) => {
  const u = String(url); if (u.includes('/messages?')) listUrl = u; const J = (o, ok = true, status = 200) => ({ ok, status, json: async () => o });
  if (u.includes('oauth2.googleapis.com/token')) return revoked ? J({ error: 'invalid_grant' }, false, 400) : J({ access_token: 'at', expires_in: 3600 });
  if (u.includes('/messages?')) return J({ messages: [{ id: 'g1' }] });
  return J({ snippet: 'Invoice due', payload: { headers: [{ name: 'From', value: 'Bank' }, { name: 'Subject', value: 'Bill' }, { name: 'Date', value: 'Nov 1' }] } });
};
const { byName } = await import('./tools.js'); const { db } = await import('./db.js'); const G = await import('./google.js');

const dg = await byName.inbox_digest.run({});
assert.equal(dg.data[0].subject, 'Bill');
assert.ok(decodeURIComponent(listUrl).includes('is:unread'), 'digest queries unread');

await byName.save_subscriptions.run({ items: [{ name: 'Netflix', amount: 649, period: 'monthly', next_charge: '2026-11-05' }, { name: 'iCloud', amount: 1200, period: 'yearly' }] });
await byName.save_subscriptions.run({ items: [{ name: 'netflix', amount: 699, period: 'monthly' }] });   // replaces, case-insensitive
const l = await byName.list_subscriptions.run({});
assert.equal(l.subscriptions.length, 2); assert.equal(l.approx_monthly_total, 799);   // 699 + 1200/12

// token revoked => clear message + status flips to disconnected so connect_gmail offers a new link
db.google = null; revoked = true;
await assert.rejects(byName.inbox_digest.run({}), /connect Gmail again/);
assert.equal(G.gmailConnected(), false);
const c = await byName.connect_gmail.run({}); assert.match(c.link, /\/auth\/google\?n=/);
process.env.MOCK_LLM = '1';
const { runAgent } = await import('./agent.js');
const r = await runAgent('connect gmail', { remember: false });
assert.equal(r.links.length, 1); assert.match(r.links[0], /^https:\/\/.*\/auth\/google\?n=\d+\.[0-9a-f]{32}$/, 'link delivered as data, not typed by the model');
console.log('GMAIL V2 OK'); process.exit(0);

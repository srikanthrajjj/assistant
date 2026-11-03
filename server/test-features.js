import assert from 'node:assert'; import fs from 'node:fs';
process.env.DATA_FILE = '/tmp/mvp-feat.json'; try { fs.unlinkSync(process.env.DATA_FILE) } catch {}
process.env.GOOGLE_CLIENT_ID = 'cid'; process.env.GOOGLE_CLIENT_SECRET = 'sec'; process.env.GOOGLE_REFRESH_TOKEN = 'rt';
const { parseDuckDuckGo, assertPublic, htmlToText } = await import('./web.js');
const sample = `<a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fa&amp;rut=x">Example <b>A</b></a><a class="result__snippet" href="x">Snippet &amp; text</a>`;
const r = parseDuckDuckGo(sample);
assert.deepEqual(r[0], { title: 'Example A', url: 'https://example.com/a', snippet: 'Snippet & text' });
for (const bad of ['http://127.0.0.1/', 'http://169.254.169.254/latest', 'http://10.0.0.5/', 'http://[::1]/', 'file:///etc/passwd'])
  await assert.rejects(assertPublic(bad), undefined, 'must block ' + bad);
assert.equal(htmlToText('<style>x{}</style><p>Hi&nbsp;<b>there</b></p>'), 'Hi there');

// Gmail with mocked network
const b64u = (s) => Buffer.from(s).toString('base64url');
globalThis.fetch = async (url) => {
  const u = String(url), J = (o) => ({ ok: true, status: 200, json: async () => o });
  if (u.includes('oauth2.googleapis.com/token')) return J({ access_token: 'at', expires_in: 3600 });
  if (u.includes('/messages?')) return J({ messages: [{ id: 'g1' }] });
  if (u.includes('/messages/g1?format=metadata')) return J({ snippet: 'Your Netflix plan renews', payload: { headers: [{ name: 'From', value: 'Netflix' }, { name: 'Subject', value: 'Renewal' }, { name: 'Date', value: 'Oct 1' }] } });
  if (u.includes('/messages/g1?format=full')) return J({ payload: { headers: [{ name: 'Subject', value: 'Renewal' }], mimeType: 'text/plain', body: { data: b64u('Rs 649 charged on Nov 5') } } });
  throw new Error('unexpected ' + u);
};
const { byName } = await import('./tools.js');
const found = await byName.find_subscriptions.run({});
assert.equal(found.data[0].from, 'Netflix');
assert.ok((await byName.read_email.run({ id: 'g1' })).data.body.includes('Rs 649'));
const c = await byName.connect_gmail.run({});
assert.equal(c.connected, true);                       // refresh token set in this test
delete process.env.GOOGLE_REFRESH_TOKEN; const { db } = await import('./db.js'); db.google = null;
const c2 = await byName.connect_gmail.run({});
assert.match(c2.link, /\/auth\/google\?n=/);
const G = await import('./google.js'); const n = new URL(c2.link).searchParams.get('n');
assert.equal(G.takeNonce(n), true); assert.equal(G.takeNonce(n), true, 'survives a pre-open / double tap');
assert.equal(G.takeNonce(n.slice(0, -1) + (n.endsWith('a') ? 'b' : 'a')), false, 'tampered link rejected');
assert.equal(G.takeNonce(Date.now() - 1 + '.' + n.split('.')[1]), false, 'forged expiry rejected');
assert.equal(G.takeState(n), false, 'a nonce is not a valid state');
console.log('FEATURE TESTS PASSED'); process.exit(0);

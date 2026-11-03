import assert from 'node:assert'; import fs from 'node:fs';
process.env.DATA_FILE = '/tmp/mvp-hard.json'; process.env.MOCK_LLM = '1'; process.env.CHAT_LIMIT = '3'; try { fs.unlinkSync(process.env.DATA_FILE) } catch {}
const { app } = await import('./index.js'); const s = app.listen(0); const base = `http://127.0.0.1:${s.address().port}`;
const h = { 'content-type': 'application/json', authorization: 'Bearer dev-token' };
const r0 = await fetch(base + '/'); assert.equal(r0.headers.get('x-content-type-options'), 'nosniff'); assert.equal(r0.headers.get('x-powered-by'), null);
const codes = []; for (let n = 0; n < 5; n++) codes.push((await fetch(base + '/api/chat', { method: 'POST', headers: h, body: JSON.stringify({ message: 'hi' }) })).status);
assert.deepEqual(codes, [200, 200, 200, 429, 429], 'rate limit kicks in');
assert.equal((await fetch(base + '/api/chat', { method: 'POST', headers: h, body: JSON.stringify({ message: 'x'.repeat(200000) }) })).status, 413, 'oversized body rejected');
console.log('HARDENING OK'); process.exit(0);

import assert from 'node:assert'; import fs from 'node:fs';
process.env.DATA_FILE = '/tmp/mvp-home.json'; try { fs.unlinkSync(process.env.DATA_FILE) } catch {}
const { app } = await import('./index.js'); const { db } = await import('./db.js');
const s = app.listen(0); const base = `http://127.0.0.1:${s.address().port}`; const h = { 'content-type': 'application/json', authorization: 'Bearer dev-token' };
const call = (p, m = 'GET', b) => fetch(base + p, { method: m, headers: h, body: b && JSON.stringify(b) }).then(r => r.json());
const t = await call('/api/tasks', 'POST', { title: 'Buy milk' });
assert.equal((await call('/api/home')).tasks.length, 1);
await call(`/api/tasks/${t.id}/done`, 'POST'); assert.equal((await call('/api/home')).tasks.length, 0);
await call(`/api/tasks/${t.id}/reopen`, 'POST'); assert.equal((await call('/api/home')).tasks.length, 1, 'undo brings the task back'); await call(`/api/tasks/${t.id}/done`, 'POST');
assert.equal((await fetch(base + '/api/tasks', { method: 'POST', headers: h, body: '{}' })).status, 400);
db.reminders.push({ id: 'b', text: 'later', when: '2030-01-02T00:00:00Z', done: false }, { id: 'a', text: 'sooner', when: '2030-01-01T00:00:00Z', done: false });
assert.deepEqual((await call('/api/home')).reminders.map(r => r.id), ['a', 'b'], 'sorted soonest first');
db.subscriptions = [{ name: 'X', amount: 1200, period: 'yearly' }, { name: 'Y', amount: 100 }]; assert.equal((await call('/api/home')).monthly, 200);
assert.equal((await call('/api/inbox')).connected, false);
db.history.push({ role: 'user', content: 'hi', t: 1 }, { role: 'assistant', content: 'hello', t: 1 }, { role: 'user', content: 'hi', t: 2 }, { role: 'user', content: 'weather?', t: 3 });
assert.equal((await call('/api/history'))[0].content, 'hi');
assert.deepEqual((await call('/api/home')).recent.map(r => r.text), ['weather?', 'hi'], 'recent chats: newest first, de-duplicated');
await call('/api/history/clear', 'POST'); assert.equal((await call('/api/history')).length, 0, 'conversation cleared');
// customizable Home
assert.equal((await call('/api/home')).layout, null, 'default layout is decided by the client');
assert.deepEqual((await call('/api/layout', 'POST', { layout: ['tasks', 'note', 'weather'] })).layout, ['tasks', 'note', 'weather']);
assert.deepEqual((await call('/api/home')).layout, ['tasks', 'note', 'weather'], 'layout persisted');
for (const bad of [{ layout: ['nope'] }, { layout: ['tasks', 'tasks'] }, { layout: 'tasks' }, {}]) assert.equal((await fetch(base + '/api/layout', { method: 'POST', headers: h, body: JSON.stringify(bad) })).status, 400, 'rejects ' + JSON.stringify(bad));
await call('/api/note', 'POST', { text: 'buy milk' }); assert.equal((await call('/api/home')).note, 'buy milk');
assert.equal((await call('/api/countdown', 'POST', { title: 'Trip', date: '2026-12-01' })).countdown.title, 'Trip');
assert.equal((await fetch(base + '/api/countdown', { method: 'POST', headers: h, body: JSON.stringify({ title: 'x', date: 'soon' }) })).status, 400);
await call('/api/countdown', 'POST', { date: '' }); assert.equal((await call('/api/home')).countdown, null, 'countdown cleared');
console.log('HOME API OK'); process.exit(0);

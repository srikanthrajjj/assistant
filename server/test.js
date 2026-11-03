import assert from 'node:assert';
process.env.DATA_FILE = '/tmp/mvp-test.json';
import fs from 'node:fs'; try { fs.unlinkSync(process.env.DATA_FILE); } catch {}
const { app, tickReminders } = await import('./index.js');
const srv = app.listen(0); const base = `http://127.0.0.1:${srv.address().port}`;
const h = { 'content-type': 'application/json', authorization: 'Bearer dev-token' };
const post = (p, b) => fetch(base + p, { method: 'POST', headers: h, body: JSON.stringify(b) }).then(r => r.json());
const get = (p) => fetch(base + p, { headers: h }).then(r => r.json());

assert.equal((await fetch(base + '/api/state')).status, 401, 'auth required');
await post('/api/chat', { message: 'remind me to call mom' });
assert.equal((await get('/api/state')).reminders.length, 1, 'reminder created');
tickReminders(Date.now() + 5000);
assert.equal((await get('/api/notifications')).length, 1, 'reminder fired as notification');
await post('/api/chat', { message: 'add a task' });
assert.equal((await get('/api/state')).tasks.length, 1, 'task created');
const c = await post('/api/chat', { message: 'read my email' });
assert.ok(c.reply.includes('Report due Friday'), 'email read');
const b = await post('/api/chat', { message: 'book the evening flight' });
assert.equal(b.pending.length, 1, 'booking queued');
assert.match(b.pending[0].summary, /^Book the 18:10 BLR→DEL flight on 10 Nov for ₹4,300\?$/, 'approval is human readable');
assert.equal((await get('/api/state')).bookings.length, 0, 'NOT booked before confirm');
await post('/api/confirm/' + b.pending[0].id, { approve: true });
assert.equal((await get('/api/state')).bookings.length, 1, 'booked after confirm');
console.log('ALL TESTS PASSED'); srv.close(); process.exit(0);

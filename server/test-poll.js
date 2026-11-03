import assert from 'node:assert'; import fs from 'node:fs';
process.env.DATA_FILE = '/tmp/mvp-poll.json'; try { fs.unlinkSync(process.env.DATA_FILE) } catch {}
const { app, tickReminders } = await import('./index.js'); const { db } = await import('./db.js');
const s = app.listen(0); const h = { authorization: 'Bearer dev-token' }, base = `http://127.0.0.1:${s.address().port}`;
const t0 = Date.now(); const p = fetch(base + '/api/notifications?wait=10', { headers: h }).then(r => r.json());
setTimeout(() => { db.reminders.push({ id: 'r', text: 'stretch', when: new Date().toISOString(), done: false }); tickReminders(); }, 1200);
const got = await p; assert.equal(got[0].body, 'stretch'); assert.ok(Date.now() - t0 < 4000, 'long-poll returned early');
assert.deepEqual(await fetch(base + '/api/notifications', { headers: h }).then(r => r.json()), [], 'queue drained');
console.log('LONG POLL OK'); process.exit(0);

import assert from 'node:assert';
process.env.RENDER = '1'; delete process.env.APP_TOKEN; process.env.DATA_FILE = '/tmp/mvp-lock.json';
const { app } = await import('./index.js'); const s = app.listen(0);
const r = await fetch(`http://127.0.0.1:${s.address().port}/api/state`, { headers: { authorization: 'Bearer dev-token' } });
assert.equal(r.status, 503); console.log('LOCK OK'); process.exit(0);

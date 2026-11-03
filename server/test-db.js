import assert from 'node:assert'; import fs from 'node:fs';
process.env.DATA_FILE = '/tmp/mvp-db.json'; try { fs.unlinkSync(process.env.DATA_FILE) } catch {}
const { newDb } = await import('pg-mem'); const { Pool } = newDb().adapters.createPg();
const { db, save, flush, connect } = await import('./db.js');
const pool = new Pool();
await connect(pool);
db.tasks.push({ id: 'x', title: 'persist me', done: false }); db.memory = 'likes tea'; save(); await flush();
Object.keys(db).forEach(k => delete db[k]);           // simulate a server restart wiping memory
await connect(pool);                                   // new boot reads from Postgres
assert.equal(db.tasks[0].title, 'persist me'); assert.equal(db.memory, 'likes tea'); assert.ok(Array.isArray(db.reminders));
console.log('DB PERSISTENCE OK'); process.exit(0);

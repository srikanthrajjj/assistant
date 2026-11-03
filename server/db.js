import fs from 'node:fs';
const FILE = process.env.DATA_FILE || './data.json';
const empty = () => ({ history: [], reminders: [], tasks: [], notifications: [], pending: [], bookings: [], memory: '', google: null });
export const db = empty();
try { Object.assign(db, JSON.parse(fs.readFileSync(FILE, 'utf8'))); } catch {}

let pool = null, timer = null, dirty = false;
// Persist the whole state as one JSON row in Postgres (single-user MVP). Works with Neon, Supabase, Render, any Postgres.
export async function connect(p) {
  pool = p;
  try { await pool.query('create table assistant_state (id int primary key, data jsonb not null)'); }
  catch (e) { if (!/already exists/i.test(e.message)) throw e; }
  const r = await pool.query('select data from assistant_state where id = 1');
  if (r.rows[0]) { Object.keys(db).forEach(k => delete db[k]); Object.assign(db, empty(), r.rows[0].data); }
  else await flush();
}
export async function flush() {
  if (!pool) return;
  dirty = false;
  await pool.query('insert into assistant_state (id, data) values (1, $1) on conflict (id) do update set data = excluded.data', [JSON.stringify(db)]);
}
export const save = () => {
  if (pool) { dirty = true; clearTimeout(timer); timer = setTimeout(() => flush().catch(e => console.error('db flush failed', e.message)), 300); }
  else fs.writeFileSync(FILE, JSON.stringify(db, null, 1));
};
export const id = () => Math.random().toString(36).slice(2, 9);

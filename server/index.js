import express from 'express';
import { db, save, id, connect } from './db.js';
import { runAgent, resolvePending } from './agent.js';
import { authUrl, exchangeCode, googleConfigured, gmailConnected } from './google.js';

export const app = express();
app.use(express.json());
const TOKEN = process.env.APP_TOKEN || 'dev-token';
const LOCKED = !!process.env.RENDER && !process.env.APP_TOKEN;   // never run publicly with the default password
app.use(express.static('public'));
app.use('/api', (req, res, next) => LOCKED ? res.status(503).json({ error: 'Server locked: set APP_TOKEN in Render > Environment' }) : (req.get('authorization') === `Bearer ${TOKEN}` ? next() : res.status(401).json({ error: 'unauthorized' })));

app.post('/api/chat', async (req, res) => {
  try { res.json(await runAgent(String(req.body.message || ''))); }
  catch (e) { console.error(e); res.status(500).json({ error: 'agent failed: ' + e.message }); }
});
app.post('/api/confirm/:id', async (req, res) => res.json(await resolvePending(req.params.id, !!req.body.approve)));
app.get('/api/state', (_, res) => res.json({ reminders: db.reminders, tasks: db.tasks, bookings: db.bookings, pending: db.pending }));
app.post('/api/memory', (req, res) => { db.memory = String(req.body.memory || ''); save(); res.json({ ok: true }); });
app.get('/api/notifications', (_, res) => { const n = db.notifications; db.notifications = []; save(); res.json(n); });

// ---- Gmail connect (open /auth/google?token=APP_TOKEN in a browser once) ----
app.get('/auth/google', (req, res) => {
  if (LOCKED) return res.status(503).send('Set APP_TOKEN first');
  if (req.query.token !== TOKEN) return res.status(401).send('bad token');
  if (!googleConfigured()) return res.status(500).send('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET first');
  res.redirect(authUrl(TOKEN.length + ':' + Buffer.from(TOKEN).toString('base64url')));
});
app.get('/auth/google/callback', async (req, res) => {
  try {
    if (req.query.state !== TOKEN.length + ':' + Buffer.from(TOKEN).toString('base64url')) return res.status(400).send('bad state');
    const refresh = await exchangeCode(String(req.query.code));
    res.send(`<h3>Gmail connected</h3><p>To keep it after server restarts (Render free resets files), add this as env var <b>GOOGLE_REFRESH_TOKEN</b> in Render:</p><textarea rows=4 cols=60 readonly>${refresh}</textarea>`);
  } catch (e) { res.status(500).send('failed: ' + e.message); }
});
app.get('/api/status', (_, res) => res.json({ gmail: gmailConnected(), search: process.env.TAVILY_API_KEY ? 'tavily' : 'duckduckgo' }));

// ---- proactive layer ----
export function tickReminders(now = Date.now()) {
  for (const r of db.reminders) if (!r.done && new Date(r.when).getTime() <= now) {
    r.done = true; db.notifications.push({ id: id(), title: 'Reminder', body: r.text });
  }
  save();
}
export async function digest() {
  const { reply } = await runAgent('Morning check-in: review my open tasks, reminders and inbox. If there is nothing worth my attention reply exactly NONE, otherwise a 3-bullet digest.', { remember: false });
  if (reply.trim() !== 'NONE') { db.notifications.push({ id: id(), title: 'Daily digest', body: reply }); save(); }
}
app.post('/api/digest', async (_, res) => { await digest(); res.json({ ok: true }); });

if (process.argv[1].endsWith('index.js')) {
  if (process.env.DATABASE_URL) {
    const { default: pg } = await import('pg');
    await connect(new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'off' ? false : { rejectUnauthorized: false } }));
    console.log('state stored in Postgres');
  } else console.log('WARNING: no DATABASE_URL, state is stored in a local file and is lost on restart on free hosts');
  setInterval(() => tickReminders(), 20000);
  let lastDay = '';
  setInterval(() => { const d = new Date(); const key = d.toDateString();
    if (d.getHours() === Number(process.env.DIGEST_HOUR ?? 8) && key !== lastDay) { lastDay = key; digest().catch(console.error); } }, 60000);
  app.listen(process.env.PORT || 3000, () => console.log('assistant on :' + (process.env.PORT || 3000)));
}

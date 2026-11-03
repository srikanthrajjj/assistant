import express from 'express';
import { db, save, id, connect } from './db.js';
import { runAgent, resolvePending } from './agent.js';
import { authUrl, exchangeCode, googleConfigured, gmailConnected, takeNonce, newState, takeState, searchEmails } from './google.js';

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
// ---- data for the Home widgets ----
app.get('/api/home', (_, res) => {
  const subs = db.subscriptions || [];
  const monthly = subs.reduce((a, x) => a + (x.amount ? (x.period === 'yearly' ? x.amount / 12 : x.amount) : 0), 0);
  res.json({
    tasks: db.tasks.filter(t => !t.done),
    reminders: db.reminders.filter(r => !r.done).sort((a, b) => new Date(a.when) - new Date(b.when)).slice(0, 8),
    subscriptions: subs, monthly: Math.round(monthly * 100) / 100,
    gmail: gmailConnected(), pending: db.pending,
  });
});
let inboxCache = { at: 0, data: null };
app.get('/api/inbox', async (_, res) => {
  if (!gmailConnected()) return res.json({ connected: false });
  try {
    if (!inboxCache.data || Date.now() - inboxCache.at > 120000)
      inboxCache = { at: Date.now(), data: await searchEmails('is:unread newer_than:3d -category:promotions -category:social -category:forums', 6) };
    res.json({ connected: true, items: inboxCache.data.map(m => ({ id: m.id, from: m.from, subject: m.subject, snippet: m.snippet })) });
  } catch (e) { res.json({ connected: true, error: e.message }); }
});
app.post('/api/tasks', (req, res) => { const title = String(req.body.title || '').trim().slice(0, 200); if (!title) return res.status(400).json({ error: 'title required' });
  const t = { id: id(), title, due: null, done: false }; db.tasks.push(t); save(); res.json(t); });
app.post('/api/tasks/:id/done', (req, res) => { const t = db.tasks.find(x => x.id === req.params.id); if (!t) return res.status(404).json({ error: 'not found' }); t.done = true; save(); res.json(t); });
app.post('/api/reminders/:id/done', (req, res) => { const r = db.reminders.find(x => x.id === req.params.id); if (!r) return res.status(404).json({ error: 'not found' }); r.done = true; save(); res.json(r); });
app.get('/api/history', (_, res) => res.json(db.history.slice(-40)));
app.post('/api/memory', (req, res) => { db.memory = String(req.body.memory || ''); save(); res.json({ ok: true }); });
app.get('/api/notifications', async (req, res) => {   // ?wait=25 = long-poll: returns as soon as something is due
  const wait = Math.min(Number(req.query.wait) || 0, 30); let closed = false; req.on('close', () => (closed = true));
  for (let t = 0; t < wait * 2 && !db.notifications.length && !closed; t++) await new Promise(r => setTimeout(r, 500));
  const n = db.notifications; db.notifications = []; if (n.length) save(); res.json(n);
});

// ---- Gmail connect (open /auth/google?token=APP_TOKEN in a browser once) ----
app.get('/auth/google', (req, res) => {
  if (LOCKED || !takeNonce(String(req.query.n))) return res.status(401).send('This link is invalid or expired. Ask the assistant to "connect gmail" again.');
  if (!googleConfigured()) return res.status(500).send('Google credentials are not set on the server');
  res.redirect(authUrl(newState()));
});
app.get('/auth/google/callback', async (req, res) => {
  try {
    if (!takeState(String(req.query.state))) return res.status(400).send('bad or expired state');
    const refresh = await exchangeCode(String(req.query.code));
    res.send(`<h3>Gmail connected</h3><p>To keep it after server restarts, add this as env var <b>GOOGLE_REFRESH_TOKEN</b> in Render (or just set DATABASE_URL so it is stored automatically):</p><textarea rows=4 cols=60 readonly>${refresh}</textarea>`);
  } catch (e) { res.status(500).send('failed: ' + e.message); }
});
app.get('/api/status', (_, res) => res.json({ gmail: gmailConnected(), search: process.env.TAVILY_API_KEY ? 'tavily' : 'duckduckgo' }));

// ---- proactive layer ----
export function tickReminders(now = Date.now()) {
  let changed = false;
  for (const r of db.reminders) if (!r.done && new Date(r.when).getTime() <= now) {
    r.done = true; changed = true; db.notifications.push({ id: id(), title: 'Reminder', body: r.text });
  }
  if (changed) save();
}
export async function digest() {
  const { reply } = await runAgent('Morning check-in: call list_tasks, list_reminders and (if Gmail is connected) inbox_digest, plus list_subscriptions for charges due in the next 3 days. If there is nothing worth my attention reply exactly NONE, otherwise a 3-bullet digest.', { remember: false });
  if (reply.trim() !== 'NONE') { db.notifications.push({ id: id(), title: 'Daily digest', body: reply }); save(); }
}
app.post('/api/digest', async (_, res) => { await digest(); res.json({ ok: true }); });

if (process.argv[1].endsWith('index.js')) {
  if (process.env.DATABASE_URL) {
    const { default: pg } = await import('pg');
    await connect(new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'off' ? false : { rejectUnauthorized: false } }));
    console.log('state stored in Postgres');
  } else console.log('WARNING: no DATABASE_URL, state is stored in a local file and is lost on restart on free hosts');
  setInterval(() => tickReminders(), 5000);
  let lastDay = '';
  setInterval(() => { const d = new Date(); const key = d.toDateString();
    if (d.getHours() === Number(process.env.DIGEST_HOUR ?? 8) && key !== lastDay) { lastDay = key; digest().catch(console.error); } }, 60000);
  app.listen(process.env.PORT || 3000, () => console.log('assistant on :' + (process.env.PORT || 3000)));
}

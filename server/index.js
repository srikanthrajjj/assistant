import express from 'express';
import { db, save, id, connect } from './db.js';
import { runAgent, resolvePending } from './agent.js';
import { authUrl, exchangeCode, googleConfigured, gmailConnected, takeNonce, newState, takeState, searchEmails, newConnectLink, diagnose, setGoogleError, hintFor } from './google.js';

export const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => { res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY' }); next(); });
app.use(express.json({ limit: '100kb' }));
// protects your LLM bill: at most 40 chat messages per 5 minutes
const chatHits = []; const CHAT_LIMIT = Number(process.env.CHAT_LIMIT || 40);
const chatLimiter = (req, res, next) => { const now = Date.now(); while (chatHits.length && now - chatHits[0] > 300000) chatHits.shift();
  if (chatHits.length >= CHAT_LIMIT) return res.status(429).json({ error: 'Too many messages, please wait a few minutes.' }); chatHits.push(now); next(); };
const TOKEN = process.env.APP_TOKEN || 'dev-token';
const LOCKED = !!process.env.RENDER && !process.env.APP_TOKEN;   // never run publicly with the default password
app.use(express.static('public'));
app.use('/api', (req, res, next) => LOCKED ? res.status(503).json({ error: 'Server locked: set APP_TOKEN in Render > Environment' }) : (req.get('authorization') === `Bearer ${TOKEN}` ? next() : res.status(401).json({ error: 'unauthorized' })));

app.post('/api/chat', chatLimiter, async (req, res) => {
  try { res.json(await runAgent(String(req.body.message || ''), { focus: ['email', 'research', 'planner'].includes(req.body.focus) ? req.body.focus : 'general' })); }
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
    layout: db.layout, note: db.note || '', countdown: db.countdown || null,
    recent: [...new Map(db.history.filter(m => m.role === 'user').reverse().map(m => [m.content, { text: m.content, t: m.t || null }])).values()].slice(0, 6),
  });
});
let inboxCache = { at: 0, data: null };
app.get('/api/inbox', async (_, res) => {
  if (!gmailConnected()) return res.json({ connected: false });
  try {
    if (!inboxCache.data || Date.now() - inboxCache.at > 120000)
      inboxCache = { at: Date.now(), data: await searchEmails('is:unread newer_than:3d -category:promotions -category:social -category:forums', 6) };
    res.json({ connected: true, items: inboxCache.data.map(m => ({ id: m.id, from: m.from, subject: m.subject, snippet: m.snippet })) });
  } catch (e) { res.json({ connected: true, error: e.message, code: e.code || null }); }
});
app.post('/api/tasks', (req, res) => { const title = String(req.body.title || '').trim().slice(0, 200); if (!title) return res.status(400).json({ error: 'title required' });
  const t = { id: id(), title, due: null, done: false }; db.tasks.push(t); save(); res.json(t); });
app.post('/api/tasks/:id/done', (req, res) => { const t = db.tasks.find(x => x.id === req.params.id); if (!t) return res.status(404).json({ error: 'not found' }); t.done = true; save(); res.json(t); });
app.post('/api/tasks/:id/reopen', (req, res) => { const t = db.tasks.find(x => x.id === req.params.id); if (!t) return res.status(404).json({ error: 'not found' }); t.done = false; save(); res.json(t); });
app.post('/api/reminders/:id/done', (req, res) => { const r = db.reminders.find(x => x.id === req.params.id); if (!r) return res.status(404).json({ error: 'not found' }); r.done = true; save(); res.json(r); });
// ---- customizable Home ----
const WIDGET_IDS = ['tiles', 'quick', 'tasks', 'rems', 'inbox', 'subs', 'recent', 'weather', 'note', 'timer', 'countdown'];
app.post('/api/layout', (req, res) => {
  const l = req.body.layout;
  if (!Array.isArray(l) || l.length > 20 || new Set(l).size !== l.length || !l.every(x => WIDGET_IDS.includes(x))) return res.status(400).json({ error: 'invalid layout' });
  db.layout = l; save(); res.json({ layout: l });
});
app.post('/api/note', (req, res) => { db.note = String(req.body.text ?? '').slice(0, 5000); save(); res.json({ ok: true }); });
app.post('/api/countdown', (req, res) => {
  const { title, date } = req.body || {};
  if (date == null || date === '') { db.countdown = null; save(); return res.json({ countdown: null }); }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date)) || isNaN(new Date(date))) return res.status(400).json({ error: 'invalid date' });
  db.countdown = { title: String(title || 'Countdown').slice(0, 80), date }; save(); res.json({ countdown: db.countdown });
});
app.get('/api/history', (_, res) => res.json(db.history.slice(-40)));
app.post('/api/history/clear', (_, res) => { db.history = []; save(); res.json({ ok: true }); });
app.post('/api/memory', (req, res) => { db.memory = String(req.body.memory || ''); save(); res.json({ ok: true }); });
app.get('/api/notifications', async (req, res) => {   // ?wait=25 = long-poll: returns as soon as something is due
  const wait = Math.min(Number(req.query.wait) || 0, 30); let closed = false; req.on('close', () => (closed = true));
  for (let t = 0; t < wait * 2 && !db.notifications.length && !closed; t++) await new Promise(r => setTimeout(r, 500));
  const n = db.notifications; db.notifications = []; if (n.length) save(); res.json(n);
});

// ---- Gmail connect (open /auth/google?token=APP_TOKEN in a browser once) ----
app.get('/auth/google', (req, res) => {
  if (LOCKED || !takeNonce(String(req.query.n))) { setGoogleError({ code: 'bad_link' }); return res.status(401).send(authPage(false, 'Link expired', `<p>${hintFor('bad_link')}</p>`)); }
  if (!googleConfigured()) return res.status(500).send('Google credentials are not set on the server');
  res.redirect(authUrl(newState()));
});
const authPage = (ok, title, body) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>:root{color-scheme:light dark}body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px/1.5 system-ui,sans-serif;background:#dfe9fb;color:#0f1b2d;padding:24px}
@media(prefers-color-scheme:dark){body{background:#070b16;color:#e8eef9}}.c{max-width:420px;width:100%;background:rgba(255,255,255,.7);border:1px solid rgba(255,255,255,.9);border-radius:24px;padding:28px;box-shadow:0 20px 60px rgba(40,64,128,.2)}
@media(prefers-color-scheme:dark){.c{background:rgba(30,42,72,.7);border-color:rgba(255,255,255,.14)}}h1{margin:0 0 10px;font-size:22px}p{margin:0 0 12px}.ok{color:#1e8a5a}.bad{color:#b25e09}small{opacity:.7}
textarea{width:100%;font:12px ui-monospace,monospace;border-radius:12px;border:1px solid rgba(0,0,0,.15);padding:10px}</style><div class="c"><h1 class="${ok ? 'ok' : 'bad'}">${title}</h1>${body}</div>`;
app.get('/auth/google/callback', async (req, res) => {
  try {
    if (req.query.error) { const code = String(req.query.error); setGoogleError({ code }); return res.status(400).send(authPage(false, 'Google did not allow access', `<p>${hintFor(code)}</p><p><small>Google said: ${code.replace(/[<>&]/g, '')}</small></p>`)); }
    if (!takeState(String(req.query.state))) { setGoogleError({ code: 'bad_link' }); return res.status(400).send(authPage(false, 'Link expired', `<p>${hintFor('bad_link')}</p>`)); }
    const refresh = await exchangeCode(String(req.query.code));
    const keep = process.env.DATABASE_URL || process.env.GOOGLE_REFRESH_TOKEN ? '' : `<p class="bad"><b>One more step:</b> your server has no database, so this login is forgotten whenever it restarts. Add this as the <b>GOOGLE_REFRESH_TOKEN</b> environment variable in Render (or set up DATABASE_URL).</p><textarea rows="4" readonly>${refresh}</textarea>`;
    res.send(authPage(true, 'Gmail connected', `<p>You can close this tab and go back to the app.</p>${keep}`));
  } catch (e) { setGoogleError({ code: e.code || 'exchange_failed', message: e.message }); res.status(500).send(authPage(false, 'Could not finish connecting', `<p>${hintFor(e.code || 'exchange_failed')}</p><p><small>${String(e.message).replace(/[<>&]/g, '')}</small></p>`)); }
});
app.get('/api/google/status', (_, res) => res.json(diagnose()));
app.get('/api/google/link', (_, res) => googleConfigured() ? res.json({ link: newConnectLink() }) : res.json({ error: 'Google credentials are not set on the server yet' }));
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

// JSON errors only, never stack traces
app.use((err, req, res, next) => {
  if (err.status === 413) return res.status(413).json({ error: 'Message too large' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Bad request' });
  console.error(err.message); res.status(err.status || 500).json({ error: 'Server error' });
});

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

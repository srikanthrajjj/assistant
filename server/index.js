import express from 'express';
import { db, save, id } from './db.js';
import { runAgent, resolvePending } from './agent.js';

export const app = express();
app.use(express.json());
const TOKEN = process.env.APP_TOKEN || 'dev-token';
app.use(express.static('public'));
app.use('/api', (req, res, next) => (req.get('authorization') === `Bearer ${TOKEN}` ? next() : res.status(401).json({ error: 'unauthorized' })));

app.post('/api/chat', async (req, res) => {
  try { res.json(await runAgent(String(req.body.message || ''))); }
  catch (e) { console.error(e); res.status(500).json({ error: 'agent failed: ' + e.message }); }
});
app.post('/api/confirm/:id', (req, res) => res.json(resolvePending(req.params.id, !!req.body.approve)));
app.get('/api/state', (_, res) => res.json({ reminders: db.reminders, tasks: db.tasks, bookings: db.bookings, pending: db.pending }));
app.post('/api/memory', (req, res) => { db.memory = String(req.body.memory || ''); save(); res.json({ ok: true }); });
app.get('/api/notifications', (_, res) => { const n = db.notifications; db.notifications = []; save(); res.json(n); });

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
  setInterval(() => tickReminders(), 20000);
  let lastDay = '';
  setInterval(() => { const d = new Date(); const key = d.toDateString();
    if (d.getHours() === Number(process.env.DIGEST_HOUR ?? 8) && key !== lastDay) { lastDay = key; digest().catch(console.error); } }, 60000);
  app.listen(process.env.PORT || 3000, () => console.log('assistant on :' + (process.env.PORT || 3000)));
}

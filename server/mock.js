// Offline fake LLM so the whole loop can be tested without an API key.
let n = 0;
export async function mockCreate({ messages }) {
  const last = messages[messages.length - 1];
  const tu = (name, input) => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'tu' + n++, name, input }] });
  const txt = (t) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: t }] });
  if (typeof last.content !== 'string') return txt('Done: ' + last.content.map(r => r.content).join(' | ').slice(0, 300));
  const q = last.content.toLowerCase();
  if (q.includes('remind')) return tu('add_reminder', { text: 'mock reminder', when: new Date(Date.now() + 1000).toISOString() });
  if (q.includes('task')) return tu('add_task', { title: 'mock task' });
  if (q.includes('email')) return tu('search_emails', { query: '*' });
  if (q.includes('book')) return tu('book_ticket', { ticket_id: 't2' });
  return txt('mock: ' + last.content);
}

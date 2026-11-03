// Provider switch: Anthropic SDK by default; any OpenAI-compatible gateway (e.g. haimaker) if LLM_BASE_URL is set.
import Anthropic from '@anthropic-ai/sdk';
import { mockCreate } from './mock.js';

export const OPENAI_MODE = !!process.env.LLM_BASE_URL;
const anth = !process.env.MOCK_LLM && !OPENAI_MODE ? new Anthropic() : null;

function toOpenAI({ system, messages, tools }) {
  const out = [{ role: 'system', content: system }];
  for (const m of messages) {
    if (typeof m.content === 'string') { out.push({ role: m.role, content: m.content }); continue; }
    if (m.role === 'assistant') {
      const text = m.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
      const calls = m.content.filter(b => b.type === 'tool_use').map(b => ({ id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input) } }));
      out.push({ role: 'assistant', content: text || null, ...(calls.length ? { tool_calls: calls } : {}) });
    } else for (const b of m.content) if (b.type === 'tool_result') out.push({ role: 'tool', tool_call_id: b.tool_use_id, content: String(b.content) });
  }
  return { model: process.env.LLM_MODEL, messages: out, max_tokens: 1500,
    tools: tools.filter(t => t.input_schema).map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } })) };
}
function fromOpenAI(r) {
  const msg = r.choices[0].message, content = [];
  if (msg.content) content.push({ type: 'text', text: msg.content });
  for (const c of msg.tool_calls || []) content.push({ type: 'tool_use', id: c.id, name: c.function.name, input: JSON.parse(c.function.arguments || '{}') });
  return { stop_reason: msg.tool_calls?.length ? 'tool_use' : 'end_turn', content };
}

export async function create(params) {
  if (process.env.MOCK_LLM) return mockCreate(params);
  if (!OPENAI_MODE) return anth.messages.create(params);
  const res = await fetch(process.env.LLM_BASE_URL.replace(/\/$/, '') + '/chat/completions', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.LLM_API_KEY}` },
    body: JSON.stringify(toOpenAI(params)) });
  if (!res.ok) throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return fromOpenAI(await res.json());
}

// Verifies the OpenAI-compatible path against a fake gateway.
import assert from 'node:assert'; import express from 'express'; import fs from 'node:fs';
process.env.DATA_FILE='/tmp/mvp-gw.json'; try{fs.unlinkSync(process.env.DATA_FILE)}catch{}
let seen; const g = express(); g.use(express.json());
g.get('/v1/models',(_,res)=>res.json({data:[{id:'llama-x'},{id:'claude-sonnet-test'}]}));
g.post('/v1/chat/completions',(req,res)=>{ seen=req.body; const last=req.body.messages.at(-1);
  res.json({choices:[{message: last.role==='tool'
    ? {content:'Added: '+last.content}
    : {content:null,tool_calls:[{id:'c1',type:'function',function:{name:'add_task',arguments:'{"title":"gw task"}'}}]}}]}); });
const s = g.listen(0); process.env.LLM_BASE_URL=`http://127.0.0.1:${s.address().port}/v1`; process.env.LLM_API_KEY='k'; delete process.env.LLM_MODEL;
const { runAgent } = await import('./agent.js'); const { db } = await import('./db.js');
const r = await runAgent('add a task');
assert.equal(seen.model,'claude-sonnet-test');
assert.ok(r.reply.startsWith('Added:') && db.tasks[0].title==='gw task' && seen.tools.length>5);
console.log('GATEWAY PATH OK'); process.exit(0);

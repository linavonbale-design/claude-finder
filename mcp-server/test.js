import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { loadExport, Index } from './lib.js';

const idx = new Index(loadExport(fileURLToPath(new URL('./sample', import.meta.url))));
assert.equal(idx.conversations.length, 3);

const s = idx.search('indexeddb quota');
assert.equal(s[0].conversation_id, 'ccc-333');
assert.equal(s[0].link, 'https://claude.ai/chat/ccc-333');

const d = idx.findDecisions('pricing price');
assert.ok(d.length >= 2, 'finds both pricing decisions');
const first = d.find(x => x.conversation_id === 'aaa-111');
assert.match(first.rejected, /subscription/);
assert.match(first.reason, /hate subscriptions/);

const t = idx.timeline('price');
assert.equal(t[0].conversation_id, 'aaa-111');
assert.equal(t[0].status, 'possibly superseded');
assert.equal(t.at(-1).status, 'latest on this subject');

const c = idx.contradictions('price subscription');
assert.ok(c.length >= 1, 'flags $29 one-time vs $5 subscription');
assert.equal(c[0].earlier.conversation_id, 'aaa-111');

assert.ok(idx.findDecisions('lokalt server').some(x => x.conversation_id === 'ccc-333'), 'Danish decision');
assert.ok(idx.get('aaa-111').includes('Pricing brainstorm'));
console.log('all tests passed');
console.log(JSON.stringify({ timeline: t, contradictions: c }, null, 2));

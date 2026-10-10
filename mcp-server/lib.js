// Core logic for Claude Finder MCP: load a claude.ai export, search it,
// and extract decisions. No network, no API calls — everything runs locally.
import fs from 'node:fs';
import path from 'node:path';

// ---------- Loading ----------

// Accepts a claude.ai export folder (containing conversations.json),
// a conversations.json file, or a folder/file of .md/.txt notes.
export function loadExport(p) {
  const stat = fs.statSync(p);
  if (stat.isDirectory()) {
    const json = path.join(p, 'conversations.json');
    if (fs.existsSync(json)) return parseJson(fs.readFileSync(json, 'utf8'));
    return fs.readdirSync(p)
      .filter(f => /\.(md|txt|json)$/i.test(f))
      .flatMap(f => loadExport(path.join(p, f)));
  }
  const text = fs.readFileSync(p, 'utf8');
  if (/\.json$/i.test(p)) return parseJson(text);
  return [parseNote(text, path.basename(p), stat.mtime.toISOString())];
}

function parseJson(text) {
  const data = JSON.parse(text);
  const arr = Array.isArray(data) ? data : (data.conversations || data.chats || data.items || []);
  return arr.map((c, i) => {
    const id = c.uuid || c.id || String(i + 1);
    const msgs = (c.chat_messages || c.messages || []).map(m => ({
      sender: m.sender || m.role || 'unknown',
      date: m.created_at || m.createdAt || c.created_at || '',
      text: messageText(m),
    })).filter(m => m.text.trim());
    return {
      id,
      title: c.name || c.title || `Conversation ${i + 1}`,
      date: c.created_at || c.createdAt || c.updated_at || '',
      url: c.url || (c.uuid ? `https://claude.ai/chat/${c.uuid}` : ''),
      messages: msgs,
    };
  });
}

function messageText(m) {
  if (Array.isArray(m.content)) {
    const parts = m.content.filter(b => b && b.type === 'text' && b.text).map(b => b.text);
    if (parts.length) return parts.join('\n');
  }
  if (typeof m.content === 'string') return m.content;
  return m.text || '';
}

function parseNote(text, name, date) {
  return { id: name, title: name, date, url: '', messages: [{ sender: 'note', date, text }] };
}

// ---------- Text helpers ----------

const STOP = new Set(('the a an and or but of to in on for with is are was were be been it this that we i you ' +
  'they he she our your my me us at by from as not no so if then than there here what which who how when ' +
  'do does did have has had will would should could can just also about into out up down over more most ' +
  'og i at er det en et til på for med som af den de vi jeg du har var ikke men så om der kan skal vil ' +
  'går gå ir kad bet tai kaip yra su iš per apie arba jei taip let lets let\'s going go went decided decide decision chose choose chosen use using').split(/\s+/));

export function terms(s) {
  return (s.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter(t => t.length > 2 && !STOP.has(t));
}

function sentences(text) {
  return text.replace(/```[\s\S]*?```/g, ' ')          // skip code blocks
    .split(/(?<=[.!?])\s+|\n+/)
    .map(s => s.replace(/^[\s>*#\-\d.)]+/, '').trim())
    .filter(s => s.length > 12 && s.length < 400);
}

function snippet(text, qTerms, len = 240) {
  const flat = text.replace(/\s+/g, ' ');
  const lower = flat.toLowerCase();
  let i = -1;
  for (const t of qTerms) { i = lower.indexOf(t); if (i >= 0) break; }
  i = Math.max(0, i - 80);
  return (i > 0 ? '…' : '') + flat.slice(i, i + len) + (i + len < flat.length ? '…' : '');
}

// ---------- Search (BM25 over messages) ----------

export class Index {
  constructor(conversations) {
    this.conversations = conversations;
    this.byId = new Map(conversations.map(c => [c.id, c]));
    this.docs = [];
    for (const c of conversations) {
      c.messages.forEach((m, mi) => {
        const toks = terms(c.title + ' ' + m.text);
        const tf = new Map();
        for (const t of toks) tf.set(t, (tf.get(t) || 0) + 1);
        this.docs.push({ conv: c, mi, msg: m, tf, len: toks.length });
      });
    }
    this.df = new Map();
    for (const d of this.docs) for (const t of d.tf.keys()) this.df.set(t, (this.df.get(t) || 0) + 1);
    this.avgLen = this.docs.reduce((s, d) => s + d.len, 0) / (this.docs.length || 1);
    this._decisions = null;
  }

  bm25(d, qTerms) {
    const N = this.docs.length, k1 = 1.2, b = 0.75;
    let s = 0;
    for (const t of qTerms) {
      const f = d.tf.get(t); if (!f) continue;
      const n = this.df.get(t);
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      s += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * d.len / this.avgLen));
    }
    return s;
  }

  search(query, limit = 10) {
    const q = terms(query);
    if (!q.length) return [];
    // Best-scoring message per conversation.
    const best = new Map();
    for (const d of this.docs) {
      const s = this.bm25(d, q);
      if (s > 0 && s > (best.get(d.conv.id)?.score || 0)) best.set(d.conv.id, { score: s, d });
    }
    return [...best.values()].sort((a, b) => b.score - a.score).slice(0, limit).map(({ score, d }) => ({
      conversation_id: d.conv.id,
      title: d.conv.title,
      date: d.msg.date || d.conv.date,
      speaker: d.msg.sender,
      snippet: snippet(d.msg.text, q),
      link: d.conv.url,
      score: +score.toFixed(2),
    }));
  }

  get(id, maxChars = 20000) {
    const c = this.byId.get(id);
    if (!c) return null;
    let out = `# ${c.title}\n${c.date}${c.url ? `\n${c.url}` : ''}\n`;
    for (const m of c.messages) out += `\n## ${m.sender} (${m.date})\n${m.text}\n`;
    return out.length > maxChars ? out.slice(0, maxChars) + `\n\n[truncated — ${out.length} chars total]` : out;
  }

  list(limit = 50) {
    return [...this.conversations]
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .slice(0, limit)
      .map(c => ({ conversation_id: c.id, title: c.title, date: c.date, messages: c.messages.length, link: c.url }));
  }

  // ---------- Decisions ----------

  get decisions() {
    if (!this._decisions) this._decisions = this.docs.flatMap(d => extractDecisions(d));
    return this._decisions;
  }

  findDecisions(topic, limit = 20) {
    const q = terms(topic || '');
    const scored = this.decisions.map(dec => ({ dec, s: q.length ? overlap(q, dec.terms) + 0.3 * overlap(q, terms(dec.title)) : 1 }))
      .filter(x => x.s > 0);
    scored.sort((a, b) => b.s - a.s || String(b.dec.date).localeCompare(String(a.dec.date)));
    return scored.slice(0, limit).map(x => publicDecision(x.dec));
  }

  timeline(topic, limit = 30) {
    const found = this.findDecisions(topic, limit);
    found.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    // Mark each decision superseded if a later one covers the same subject.
    return found.map((d, i) => {
      const later = found.slice(i + 1).find(o => similarity(terms(d.decision), terms(o.decision)) >= 0.25);
      return { ...d, status: later ? 'possibly superseded' : 'latest on this subject', superseded_by: later ? later.decision : undefined };
    });
  }

  contradictions(topic, limit = 15) {
    const pool = topic ? this.findDecisions(topic, 60) : this.decisions.map(publicDecision);
    const pairs = [];
    for (let i = 0; i < pool.length; i++) {
      for (let j = i + 1; j < pool.length; j++) {
        const a = pool[i], b = pool[j];
        if (a.conversation_id === b.conversation_id && a.date === b.date) continue;
        const ta = terms(a.decision), tb = terms(b.decision);
        const sim = similarity(ta, tb);
        if (sim < 0.2) continue;
        const reason = conflictReason(a, b, ta, tb);
        if (reason) pairs.push({ similarity: +sim.toFixed(2), reason, earlier: older(a, b), later: newer(a, b) });
      }
    }
    return pairs.sort((x, y) => y.similarity - x.similarity).slice(0, limit);
  }
}

const DECISION = [
  /\b(we|i)('ve| have)? (decided|agreed|settled|concluded)\b/i,
  /\b(we|i)('ll| will) (go with|use|stick with|switch to|drop|keep)\b/i,
  /\blet'?s (go with|use|stick with|switch to|drop|keep|not)\b/i,
  /\b(going|went) with\b/i,
  // Past tense only: imperative "choose X" is usually an instruction, not a decision.
  /\b(we|i) (chose|picked|opted for|settled on)\b/i,
  /\bdecision\s*:/i,
  /\bfinal (answer|choice|decision|plan)\b/i,
  /\b(we|i) (won'?t|will not|are not going to|aren'?t going to)\b/i,
  /\b(vi|jeg) (har )?(besluttet|bestemt|valgt|aftalt)\b/i,
  /\b(vi|jeg) (går|kører) (med|videre med)\b/i,
  // Lithuanian. \b is ASCII-only in JS, so use letter lookarounds instead.
  /(nusprendėme|nusprendžiau|nutarėme|nutariau|pasirinkome|pasirinkau|apsisprendėme|apsisprendžiau|susitarėme)/iu,
  /(?<!\p{L})(naudosime|darysime|eisime su|liekame prie|atsisakome|atsisakėme)(?!\p{L})/iu,
];
// "instead of" etc. alone is mostly explanation; it only fills `rejected` on a real decision (see REJECT).
const REASON = /(?<!\p{L})(because|since|so that|due to|the reason|fordi|da |derfor|pga\.?|nes|kadangi|todėl)(?!\p{L})/iu;
const REJECT = /(?<!\p{L})(?:instead of|rather than|over|not|i stedet for|frem for|vietoj|užuot)\s+([^,.;]{3,80})/iu;
const NEGATION = /(?<!\p{L})(not|no longer|won'?t|don'?t|drop|stop|avoid|reject|never|ikke|droppe|aldrig|ne|niekada|atsisak\p{L}*)(?!\p{L})/iu;

function extractDecisions(d) {
  const ss = sentences(d.msg.text);
  const out = [];
  ss.forEach((s, i) => {
    if (!DECISION.some(r => r.test(s))) return;
    const next = ss[i + 1] || '';
    const reason = REASON.test(s) ? s : (REASON.test(next) ? next : '');
    const rej = s.match(REJECT);
    out.push({
      decision: s,
      reason,
      rejected: rej && /instead of|rather than|over|i stedet for|frem for|vietoj|užuot/i.test(rej[0]) ? rej[1].trim() : '',
      speaker: d.msg.sender,
      date: d.msg.date || d.conv.date,
      title: d.conv.title,
      conversation_id: d.conv.id,
      link: d.conv.url,
      terms: terms(s),
    });
  });
  return out;
}

function publicDecision(d) {
  const { terms: _t, ...rest } = d;
  return Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== ''));
}

function overlap(q, t) { const set = new Set(t); return q.filter(x => set.has(x)).length; }
function similarity(a, b) {
  const A = new Set(a), B = new Set(b);
  const inter = [...A].filter(x => B.has(x)).length;
  return inter / (Math.min(A.size, B.size) || 1);
}
function older(a, b) { return String(a.date) <= String(b.date) ? a : b; }
function newer(a, b) { return String(a.date) <= String(b.date) ? b : a; }

function conflictReason(a, b, ta, tb) {
  const na = NEGATION.test(a.decision), nb = NEGATION.test(b.decision);
  if (na !== nb) return 'one decision negates or drops what the other affirms';
  const chosenLater = (rej, other) => rej && terms(rej).some(t => terms(other.decision).includes(t));
  if (chosenLater(a.rejected, b)) return `"${a.rejected}" was rejected in one place but chosen in the other`;
  if (chosenLater(b.rejected, a)) return `"${b.rejected}" was rejected in one place but chosen in the other`;
  // Same subject, but each picks words the other doesn't mention — likely different choices.
  const A = new Set(ta), B = new Set(tb);
  const onlyA = ta.filter(x => !B.has(x)), onlyB = tb.filter(x => !A.has(x));
  if (onlyA.length && onlyB.length && a.conversation_id !== b.conversation_id && similarity(ta, tb) >= 0.4)
    return `same subject, different choices ("${onlyA.slice(0, 3).join(', ')}" vs "${onlyB.slice(0, 3).join(', ')}")`;
  return '';
}

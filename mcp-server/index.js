#!/usr/bin/env node
// Claude Finder MCP server — lets Claude search your exported claude.ai history
// and the decisions inside it. Usage: node index.js <path-to-export>
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { loadExport, Index } from './lib.js';

const exportPath = process.argv[2] || process.env.CLAUDE_FINDER_EXPORT;
let index = null, loadError = '';

function load() {
  if (!exportPath) { loadError = 'No export path set. Pass it as the first argument or set CLAUDE_FINDER_EXPORT.'; return; }
  try {
    index = new Index(loadExport(exportPath));
    loadError = '';
    console.error(`[claude-finder] indexed ${index.conversations.length} conversations, ${index.docs.length} messages from ${exportPath}`);
  } catch (e) {
    index = null;
    loadError = `Could not load export at ${exportPath}: ${e.message}`;
    console.error('[claude-finder]', loadError);
  }
}
load();

const json = data => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] });
const fail = msg => ({ content: [{ type: 'text', text: msg }], isError: true });
const withIndex = fn => async args => (index ? fn(args) : fail(loadError));

const server = new McpServer({ name: 'claude-finder', version: '0.1.0' });

server.registerTool('search_history', {
  title: 'Search past conversations',
  description: 'Keyword search (BM25) across all past claude.ai conversations. Returns the best-matching message per conversation with a snippet and link.',
  inputSchema: { query: z.string(), limit: z.number().int().min(1).max(50).optional() },
}, withIndex(({ query, limit }) => {
  const r = index.search(query, limit ?? 10);
  return json(r.length ? r : { results: [], note: 'No matches. Try other words or synonyms.' });
}));

server.registerTool('get_conversation', {
  title: 'Read a conversation',
  description: 'Return the full text of one past conversation by its conversation_id (from other tools).',
  inputSchema: { conversation_id: z.string(), max_chars: z.number().int().min(1000).max(200000).optional() },
}, withIndex(({ conversation_id, max_chars }) => {
  const t = index.get(conversation_id, max_chars ?? 20000);
  return t ? { content: [{ type: 'text', text: t }] } : fail(`No conversation with id ${conversation_id}`);
}));

server.registerTool('list_conversations', {
  title: 'List conversations',
  description: 'List past conversations, newest first.',
  inputSchema: { limit: z.number().int().min(1).max(500).optional() },
}, withIndex(({ limit }) => json(index.list(limit ?? 50))));

server.registerTool('find_decisions', {
  title: 'Find decisions',
  description: 'Find decisions made in past conversations about a topic ("pricing", "database"), with the stated reason, rejected alternatives, date and a link to the source. Extraction is pattern-based, so verify important ones with get_conversation.',
  inputSchema: { topic: z.string(), limit: z.number().int().min(1).max(100).optional() },
}, withIndex(({ topic, limit }) => json(index.findDecisions(topic, limit ?? 20))));

server.registerTool('decision_timeline', {
  title: 'Decision timeline',
  description: 'Chronological list of decisions on a topic, marking which ones were possibly superseded by later decisions.',
  inputSchema: { topic: z.string(), limit: z.number().int().min(1).max(100).optional() },
}, withIndex(({ topic, limit }) => json(index.timeline(topic, limit ?? 30))));

server.registerTool('find_contradictions', {
  title: 'Find conflicting decisions',
  description: 'Find pairs of past decisions that may conflict (one drops what another chose, or same subject with different choices). Heuristic — treat results as leads to check, not facts.',
  inputSchema: { topic: z.string().optional(), limit: z.number().int().min(1).max(50).optional() },
}, withIndex(({ topic, limit }) => json(index.contradictions(topic, limit ?? 15))));

server.registerTool('reload_export', {
  title: 'Reload export',
  description: 'Re-read the export from disk after replacing it with a newer one.',
  inputSchema: {},
}, async () => { load(); return index ? json({ conversations: index.conversations.length, messages: index.docs.length }) : fail(loadError); });

await server.connect(new StdioServerTransport());

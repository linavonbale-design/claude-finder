# Claude Finder — MCP server

Lets Claude search your past claude.ai conversations and the **decisions** in them.
It runs locally, reads your export from disk, and makes no network or API calls.

## Tools

| Tool | What it does |
|---|---|
| `search_history` | Keyword search (BM25) with a snippet and a link to each chat |
| `get_conversation` | Full text of one conversation |
| `list_conversations` | Newest conversations first |
| `find_decisions` | Decisions on a topic, with the reason, the rejected alternative, the date and the source |
| `decision_timeline` | Decisions in order, with earlier ones marked "possibly superseded" |
| `find_contradictions` | Pairs of decisions that may conflict |
| `reload_export` | Re-reads the export after you download a new one |

Decisions are found by matching phrases in English and Danish ("we decided", "let's go with",
"instead of", "vi har besluttet", …), not by AI. Treat the results as leads and check them with `get_conversation`.

## Setup

1. Export your data: claude.ai → Settings → Privacy → **Export data**. Unzip the file you get.
2. `cd mcp-server && npm install`
3. Connect it:

**Claude Code**
```
claude mcp add claude-finder -- node "C:/path/to/mcp-server/index.js" "C:/path/to/claude-export"
```

**Claude Desktop** (`%APPDATA%\Claude\claude_desktop_config.json`)
```json
{
  "mcpServers": {
    "claude-finder": {
      "command": "node",
      "args": ["C:/path/to/mcp-server/index.js", "C:/path/to/claude-export"]
    }
  }
}
```

The path can be the unzipped export folder, `conversations.json` itself, or a folder of `.md`/`.txt` notes.
You can also set it with the `CLAUDE_FINDER_EXPORT` environment variable instead.

Then ask Claude: *"What did we decide about pricing, and has it changed?"*

## Test
```
npm test
```
Runs against `sample/conversations.json`, a small made-up export.

# Claude Finder

**Find what you decided, not just what you said.**

Claude Finder searches your past claude.ai conversations and pulls out the **decisions** in them:
what you chose, why, what you rejected, when, and whether a later chat changed it.

- 🔍 **Search your history.** Keyword search (BM25) with a snippet and a link to each chat.
- ✅ **Find decisions.** For example, *"What did we decide about pricing?"* returns the decision, the reason, the rejected alternative, the date and the source.
- 🕒 **See the timeline.** Decisions in order, with earlier ones marked *possibly superseded*.
- ⚠️ **Spot contradictions.** Pairs of decisions that may conflict.
- 🔒 **Stays on your computer.** It reads your export from disk and makes no network or API calls.
- 🌍 **Works in more than one language.** Decision phrases are recognized in English, Danish and Lithuanian.

## Two ways to use it

| | What it is | Setup |
|---|---|---|
| **[MCP server](mcp-server/)** (recommended) | Claude itself gets 7 tools to search your history and decisions | [mcp-server/README.md](mcp-server/README.md) |
| **[Chrome extension](extension/)** | A small search box in your browser | See below |

### Quick start (MCP server, Claude Code)

1. Export your data: claude.ai → Settings → Privacy → **Export data**. Unzip it.
2. Install:
   ```
   git clone https://github.com/linavonbale-design/claude-finder.git
   cd claude-finder/mcp-server
   npm install
   ```
3. Connect it:
   ```
   claude mcp add claude-finder -- node "/full/path/to/claude-finder/mcp-server/index.js" "/full/path/to/claude-export"
   ```
4. Ask Claude: *"What did we decide about pricing, and has it changed?"*

Setup for Claude Desktop is in [mcp-server/README.md](mcp-server/README.md).

### Chrome extension

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and choose the `extension/` folder.
3. Open the extension, import your `conversations.json` and search.

## How decisions are found

Decisions are found by matching phrases such as "we decided", "let's go with", "instead of" and "vi har besluttet".
No AI model is used for this, so treat the results as leads and open the source conversation to check them.

## Roadmap

See [ROADMAP.md](ROADMAP.md). Next up: search by meaning (semantic search) and support for ChatGPT and Gemini exports.

## Support the project

Claude Finder is free and open source. If it saves you time, you can support further development:

- ⭐ Star this repo
- ☕ [Buy me a coffee](https://buymeacoffee.com/<your-username>)
- 💖 [GitHub Sponsors](https://github.com/sponsors/linavonbale-design)

## License

[MIT](LICENSE) © 2026 Lina

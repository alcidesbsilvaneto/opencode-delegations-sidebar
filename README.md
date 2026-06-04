# opencode-delegations-sidebar

TUI plugin for [opencode](https://opencode.ai) that adds a **Delegations** section to the session sidebar, showing every sub-agent (`explore`, `general`, etc.) the current session has spawned — active and completed — with a live status indicator and one-click navigation into the child session.

## What it looks like

In the right-hand sidebar of a session that has used the `task` tool:

```
┌─────────────────────────────┐
│ Delegations                 │
│ ● explore  find TODOs       │
│   scan repo for unfinished │
│ ◐ general  refactor auth    │
│   restructure the auth flow │
│ ✓ general  summarize changes│
└─────────────────────────────┘
```

- `●` idle / completed (green)
- `◐` busy (yellow)
- `✗` retrying (red)
- `○` unknown

Clicking (or pressing Enter on) a row navigates into that child session, so you can read its full conversation. Use the normal session switcher to come back to the parent.

The section is hidden automatically when the current session has no delegations, so sessions that never used the `task` tool look exactly like before.

## Install

### From a local checkout (development)

Build the plugin first, then point your opencode config at the package directory:

```bash
cd opencode-delegations-sidebar
npm install        # pulls in solid-js, @opentui/solid, @opencode-ai/plugin
npx bun run build  # compiles src/tui.tsx + src/server.ts into dist/
```

```jsonc
// ~/.config/opencode/opencode.jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "/absolute/path/to/opencode-delegations-sidebar"
  ]
}
```

Pointing at the **package directory** (not a file) is important: the loader reads `package.json` from that directory to decide which entry to use for the server vs. the TUI. We ship two compiled files:

- `dist/server.js` — a no-op `server()` stub. The opencode server loader requires every plugin to default-export a `server()` function; this stub satisfies that without doing anything.
- `dist/tui.js` — the real TUI plugin. Reached via `exports["./tui"]` in `package.json`.

The runtime JSX transform from the opencode binary's `bunfig.toml` doesn't apply to dynamically-imported plugin files, so we pre-compile with `Bun.build` using the `@opentui/solid/bun-plugin` plugin (transforms JSX → `createElement` calls at build time).

### From npm (once published)

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "opencode-delegations-sidebar"
  ]
}
```

opencode will install the package and its peer dependencies automatically.

## How it works

1. On every session change, the plugin calls `client.session.children` to list the child sessions (`parentID === current`) and `client.session.messages` to walk the parent's assistant messages and collect every `subtask` Part (the in-message record the `task` tool emits).
2. Each child session is matched with its `subtask` Part in spawn order. The row shows the agent name, the child session's title, and the task's description (or the first line of its prompt).
3. Live updates: subscribes to `session.created`, `session.updated`, `session.deleted`, `message.part.updated`, and `session.status` and re-fetches as needed. The status dot re-renders on every `session.status` event for any of the listed children.
4. Clicking a row calls `api.route.navigate("session", { sessionID: child.id })`, which drops you into the child session's normal chat view. Use the session switcher (or your normal `go back` keybind) to return.

The sidebar slot used is `sidebar_content` with `order: 150`, so the section appears just below the built-in `Context` panel and above the `MCP`/`LSP`/`Todo`/`Files` sections.

## Development

```bash
cd opencode-delegations-sidebar
npm install
npm run typecheck
npx bun run build
```

- `npm run typecheck` — `tsc --noEmit` against the locally installed `@opencode-ai/plugin@1.15.13` and `@opencode-ai/sdk@1.15.13` (uses `jsxImportSource: "@opentui/solid"`).
- `npx bun run build` — invokes `scripts/build.mjs` which calls `Bun.build` with the `@opentui/solid/bun-plugin` plugin, producing `dist/tui.js` (the actual TUI plugin) and `dist/server.js` (a no-op `server()` stub) with the JSX already transformed to `createElement` calls.

## Peer dependencies

- `@opencode-ai/plugin >= 1.4.0`
- `@opentui/solid >= 0.1.0`
- `solid-js >= 1.8.0`

These are resolved from opencode's runtime in production. When developing from a local checkout, the plugin's own `node_modules` provides them so `tsc` and `bun` both work standalone.

## License

MIT

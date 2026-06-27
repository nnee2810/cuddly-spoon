# MCP Notification Server

A local MCP stdio server that lets Claude, Codex, or another MCP client send macOS notifications for agent events.

## Tools

- `notify_chat_complete`: notify when an agent finishes a chat turn or task.
- `notify_user_action_required`: notify when an agent needs user input, approval, or manual action.

## Tech Stack

- TypeScript ESM
- `@modelcontextprotocol/sdk`
- `zod`
- macOS `osascript`

## Install

```bash
npm install
npm run build
```

## Test

```bash
npm test
npm run typecheck
```

Automated tests do not send real OS notifications.

## MCP Client Config

Use the built stdio server from this repository:

```json
{
  "mcpServers": {
    "notifications": {
      "command": "node",
      "args": ["/absolute/path/to/cuddly-spoon/dist/index.js"]
    }
  }
}
```

If installed as a package, use the bin command:

```json
{
  "mcpServers": {
    "notifications": {
      "command": "mcp-notification-server"
    }
  }
}
```

## Manual macOS Smoke Check

After building, connect the server through an MCP client and call `notify_chat_complete` with:

```json
{
  "source": "codex",
  "workspace": "cuddly-spoon",
  "summary": "Notification bridge is ready"
}
```

The expected result is a macOS notification titled `Codex completed`.

## Hook-Driven Notifications (notify-cli)

Agents can only call MCP tools mid-turn. To notify when a session *ends* or
when the agent needs you, wire the bundled `notify-cli` into your client's
lifecycle hooks.

Build first, then install the hooks:

```bash
npm run build
node dist/cli/index.js install          # both clients
node dist/cli/index.js install --claude # Claude only
node dist/cli/index.js install --codex  # Codex only
```

`install` writes an absolute `node <repo>/dist/cli/index.js` invocation into:

- `~/.claude/settings.json` — `Stop` hook → completion notification;
  `Notification` hook (permission/idle) → action-required notification.
- `~/.codex/config.toml` — `notify` → completion / approval notifications.

Existing hooks are preserved (entries are matched by a marker and updated in
place, never duplicated). The previous config is backed up to `<file>.bak`.
If Codex already has its own `notify`, it is left untouched and the command
prints the value to set manually.

Remove everything with:

```bash
node dist/cli/index.js uninstall
```

(Optional) `npm link` exposes `notify-cli` and `mcp-notification-server` on
your PATH so you can type them directly; it is not required for hooks.

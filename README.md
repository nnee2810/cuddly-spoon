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

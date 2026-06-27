# MCP Notification Server Design

## Context

Build a local TypeScript MCP server that receives events from Claude or Codex and sends operating system notifications. The first implementation targets macOS notifications and uses the official Model Context Protocol TypeScript SDK. The repository is currently empty aside from project metadata, so this spec defines the initial project shape.

## Goals

- Provide an MCP server over stdio for local MCP clients.
- Expose two explicit notification tools:
  - `notify_chat_complete`
  - `notify_user_action_required`
- Accept structured event data from clients and let the server format user-facing notification text.
- Send macOS notifications through built-in `osascript`.
- Fail the MCP tool call when validation or notification delivery fails.
- Keep transport and notification logic separated so HTTP or other OS notifiers can be added later without rewriting event handling.

## Non-Goals

- No HTTP transport in the MVP.
- No Linux or Windows notifier in the MVP.
- No clickable notification action handling in the MVP.
- No persistence, event history, queueing, retry system, or background daemon management.
- No user-facing UI beyond OS notifications.

## Architecture

The MVP is a TypeScript ESM application. `src/index.ts` starts a stdio MCP server. MCP tool registration lives in a small server module. Tool callbacks validate input and call shared domain handlers. Domain handlers normalize defaults, format a notification, and send it through a `Notifier` interface.

Suggested module layout:

```text
src/index.ts
src/mcp/server.ts
src/events/schema.ts
src/events/handlers.ts
src/notifications/types.ts
src/notifications/format.ts
src/notifications/macos.ts
```

Responsibilities:

- `src/index.ts`: entrypoint that creates dependencies and connects the stdio transport.
- `src/mcp/server.ts`: creates the MCP server and registers the two tools.
- `src/events/schema.ts`: defines schemas and inferred TypeScript types for tool input.
- `src/events/handlers.ts`: exposes `notifyChatComplete` and `notifyUserActionRequired`, independent of MCP transport.
- `src/notifications/types.ts`: defines `Notification`, `Notifier`, and delivery result types.
- `src/notifications/format.ts`: turns normalized events into notification title/body/subtitle fields.
- `src/notifications/macos.ts`: implements `Notifier` with `osascript`.

This keeps the future HTTP path straightforward: an HTTP route can parse a request and call the same event handlers used by the MCP tools.

## MCP Tools

### `notify_chat_complete`

Use this when Claude or Codex completes a chat turn, task, or long-running operation.

Input fields:

- `source`: required string. Expected values include `claude` and `codex`, but other clients may pass their own source names.
- `conversationId`: optional string.
- `workspace`: optional string, usually the project or repository name.
- `summary`: optional string for the completed work.
- `priority`: optional enum: `low`, `normal`, or `high`. Default: `normal`.
- `actionUrl`: optional string or deeplink to help the user return to the relevant session.
- `metadata`: optional object for client-specific data. The MVP stores no metadata and does not render it directly.

### `notify_user_action_required`

Use this when an agent needs user approval, input, a choice, or manual unblock.

Input fields:

- `source`: required string. Expected values include `claude` and `codex`, but other clients may pass their own source names.
- `conversationId`: optional string.
- `workspace`: optional string, usually the project or repository name.
- `request`: required string describing what the user needs to do.
- `priority`: optional enum: `low`, `normal`, or `high`. Default: `high`.
- `actionUrl`: optional string or deeplink to help the user return to the relevant session.
- `metadata`: optional object for client-specific data. The MVP stores no metadata and does not render it directly.

## Notification Formatting

The client sends structured event data. The server owns notification wording.

Formatting rules:

- Normalize `source` for display, for example `codex` becomes `Codex` and `claude` becomes `Claude`.
- `notify_chat_complete` title: `<Source> completed`.
- `notify_user_action_required` title: `<Source> needs input`.
- Body includes `workspace` when present.
- Chat completion body uses `summary` when present; otherwise it falls back to a concise completion message.
- User action body uses the required `request`.
- If `actionUrl` is present, include it in the subtitle or body as plain text. The MVP does not implement click actions.
- `priority` affects server-side defaults and future extension points, but the macOS `osascript` MVP does not map it to OS-level urgency because `display notification` does not provide a reliable urgency field.
- Keep generated notification text short enough for macOS notification surfaces.

## Data Flow

```text
MCP client
  -> calls notify_chat_complete or notify_user_action_required
  -> MCP tool schema validates input
  -> event handler normalizes defaults
  -> formatter builds notification fields
  -> MacOsNotifier sends osascript notification
  -> handler returns a delivery result or throws
```

Success result should include:

- `delivered: true`
- `eventType`
- `notificationTitle`

The result is returned as MCP text content containing a JSON string.

## Error Handling

- Invalid tool input fails the MCP tool call.
- `osascript` execution failure fails the MCP tool call.
- Unknown source values are allowed and displayed in title case instead of rejected.
- Empty required strings are invalid.
- The MVP does not retry failed notifications.

Failing hard is intentional: if this server exists to notify the user, clients should know when notification delivery is broken.

## macOS Notifier

The initial notifier uses built-in `osascript` so the MVP has no native notification dependency.

Implementation notes:

- Use child process APIs with argument passing or safe string escaping so notification text cannot break the AppleScript command.
- Prefer the AppleScript `display notification` command.
- Map formatted fields to macOS notification title, subtitle, and body where practical.
- Treat any non-zero process exit as delivery failure.

## Testing

Automated test scope:

- Schema validation and default normalization for both event types.
- Formatter output for common combinations of source, workspace, summary, request, priority, and action URL.
- Handler behavior with a fake notifier:
  - success returns `delivered: true`
  - notifier failure propagates as an error
- MCP registration smoke test if the SDK allows testing tool registration without spawning a long-running process.

Automated tests should not send real OS notifications. A manual smoke check can exercise the built binary on macOS.

## Packaging

Package as a TypeScript ESM Node application.

Expected scripts:

- `npm run build`: compile TypeScript to `dist`.
- `npm test`: run automated tests.
- `npm run typecheck`: run TypeScript checks.

Package metadata should expose a `bin` entry that points at the built server entrypoint. README should include a minimal MCP client configuration example that runs the server over stdio with either the package binary or `node /path/to/dist/index.js`.

## Open Extension Path

HTTP is not part of the MVP. The design intentionally keeps handlers independent of MCP so a later HTTP implementation can route requests into the same validation, formatting, and notification modules.

Additional future extensions can add:

- Linux and Windows `Notifier` implementations.
- `terminal-notifier` or richer macOS notification support.
- Optional soft-fail mode.
- Clickable action handling when a notifier backend supports it reliably.

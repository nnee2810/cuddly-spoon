# notify-cli: Hook-Driven Notifications and One-Command Install Design

## Context

The existing MCP notification server (`mcp-notification-server`) exposes two
tools that an agent calls *during* a turn. This leaves a gap: at the moment a
session or turn actually *ends*, the agent is no longer executing, so it
cannot reliably call `notify_chat_complete` itself. The same is true for
"agent needs input" — the harness, not the agent, decides those moments.

Both Claude Code and Codex solve this with lifecycle hooks, but hooks are
shell commands and cannot speak the MCP stdio protocol. This feature adds a
second binary, `notify-cli`, that hooks invoke directly, reusing the existing
transport-independent notification core. It also provides a one-command
`install` that wires those hooks into the user's Claude and Codex config.

The MVP MCP server stays unchanged; this is purely additive.

## Goals

- Add a `notify-cli` binary that converts a Claude or Codex hook payload into
  an OS notification using the existing handlers, formatter, and macOS
  notifier.
- Map exactly two semantic events:
  - agent finished responding → `chat_complete`
  - agent needs user action → `user_action_required`
- Provide `notify-cli install` / `uninstall` that idempotently patch
  `~/.claude/settings.json` and `~/.codex/config.toml`.
- Preserve any hooks the user already configured (append + marker, never
  blind overwrite).
- Keep all notification logic shared with the MCP path — no duplicated
  formatting or delivery code.

## Non-Goals

- No npm publish / `npx` distribution in this iteration. Distribution is
  local-only: clone, `npm install && npm run build`, then `npm link` or
  absolute path.
- No transcript parsing to synthesize richer summaries.
- No new OS notifier; macOS `osascript` only, same as the MVP.
- No changes to the existing MCP stdio server (`mcp-notification-server`) or
  its entrypoint `src/index.ts`.
- No configurable notification-type allowlist (the set is fixed; see
  Event Mapping).

## Distribution

Local-only. The user builds the project, then either runs `npm link` (exposes
`mcp-notification-server` and `notify-cli` on PATH) or invokes the built file
directly. To stay independent of PATH state, every command `install` writes
into config files uses an **absolute node invocation**:
`node <abs-repo>/dist/cli/index.js <subcommand>`, where `<abs-repo>` is
resolved at install time from the running CLI's own location.

## Architecture

A second binary alongside the unchanged MCP server. New code lives under
`src/cli/` and reuses the reviewed core untouched.

```text
src/index.ts            # UNCHANGED — mcp-notification-server (MCP stdio)
src/cli/index.ts        # notify-cli entrypoint + command router
src/cli/adapters.ts     # hook payload -> normalized event input
src/cli/install.ts      # patch/unpatch Claude settings.json + Codex config.toml
```

Reused unchanged:

- `src/events/handlers.ts` — `notifyChatComplete`, `notifyUserActionRequired`
- `src/notifications/format.ts` — notification wording
- `src/notifications/macos.ts` — `MacOsNotifier`
- `src/notifications/types.ts`, `src/events/schema.ts` — types and schemas

`package.json` gains a second `bin` entry:

```json
"bin": {
  "mcp-notification-server": "./dist/index.js",
  "notify-cli": "./dist/cli/index.js"
}
```

## CLI Surface

`notify-cli <command> [options]`:

- `claude-hook` — read a Claude hook JSON payload from **stdin**, deliver a
  notification. Used as the `command` in Claude `Stop` and `Notification`
  hooks.
- `codex-hook` — read a Codex notify JSON payload from **argv** (Codex
  appends the payload as a single trailing argument), deliver a notification.
  Used as the program in Codex `notify`.
- `install [--claude] [--codex]` — patch config for both clients, or just the
  named one. No flag means both.
- `uninstall [--claude] [--codex]` — remove the entries this tool added.

## Event Mapping

`source` is fixed per subcommand: `claude` for `claude-hook`, `codex` for
`codex-hook`. `workspace` is `basename(cwd)` where `cwd` comes from the
payload when present, else `process.cwd()`.

### Claude (`claude-hook`, stdin JSON)

Common payload fields: `session_id`, `transcript_path`, `cwd`,
`hook_event_name`, `permission_mode`. Notification adds `message` and
`notification_type`.

| `hook_event_name` | Condition | Event | Body source |
|---|---|---|---|
| `Stop` | always | `chat_complete` | fallback `Task completed.` (no summary in payload) |
| `Notification` | `notification_type ∈ {permission_prompt, idle_prompt}` | `user_action_required` | `message` |
| `Notification` | any other `notification_type` | none — exit 0 silently | — |
| anything else | — | none — exit 0 silently | — |

### Codex (`codex-hook`, argv JSON)

Payload: `{ "type": ..., "last-assistant-message"?: string, "cwd"?: string }`.

| `type` | Event | Body source |
|---|---|---|
| `agent-turn-complete` | `chat_complete` | `last-assistant-message`, trimmed to a short single-line summary (≤ 150 chars, ellipsis if longer); fallback `Task completed.` if absent |
| `approval-requested` | `user_action_required` | `last-assistant-message` if present, else `Approval requested.` |
| any other | none — exit 0 silently | — |

Summaries are shortened before formatting so macOS notification surfaces stay
readable; newlines collapse to spaces.

## Install Behavior

### Claude — `~/.claude/settings.json` (JSON)

Append one hook entry to both `hooks.Stop` and `hooks.Notification`. Claude's
hook shape:

```json
{
  "hooks": {
    "Stop": [
      { "hooks": [ { "type": "command", "command": "node /abs/repo/dist/cli/index.js claude-hook" } ] }
    ],
    "Notification": [
      { "hooks": [ { "type": "command", "command": "node /abs/repo/dist/cli/index.js claude-hook" } ] }
    ]
  }
}
```

- **Marker:** a command string containing `dist/cli/index.js`. On re-run, if
  an entry with that marker already exists in the target array, update it in
  place (refresh the absolute path) rather than appending a duplicate.
- Existing user hooks in the same arrays are preserved.
- Missing file or missing `hooks` keys are created.

### Codex — `~/.codex/config.toml` (TOML)

Codex supports a single top-level `notify` array:

```toml
notify = ["node", "/abs/repo/dist/cli/index.js", "codex-hook"]
```

- If `notify` is absent → set it.
- If `notify` is present and is our marker (contains `dist/cli/index.js`) →
  update the absolute path.
- If `notify` is present but is the user's own command → **do not overwrite**.
  Print a warning explaining the conflict and the exact value the user should
  set manually, and leave the file unchanged. (Codex's single-slot `notify`
  cannot host two programs; resolving that is the user's call.)

### Safety

- Before writing any config file, copy it to `<file>.bak` (overwriting a
  previous backup). New files need no backup.
- Writes are atomic enough for this scope: read, modify in memory, write whole
  file.

### Uninstall

- Claude: remove only entries whose command contains the marker from
  `hooks.Stop` and `hooks.Notification`; leave other hooks intact; drop empty
  arrays/objects where natural.
- Codex: if `notify` is our marker, remove the key; if it is the user's, leave
  it and report that nothing was removed.

## Data Flow

```text
Claude Stop/Notification hook
  -> notify-cli claude-hook  (reads stdin JSON)
  -> adapter normalizes -> ChatCompleteInput | UserActionRequiredInput
  -> existing handler -> formatter -> MacOsNotifier -> osascript

Codex notify
  -> notify-cli codex-hook <json>  (reads argv JSON)
  -> adapter normalizes -> same handlers -> same notifier
```

## Error Handling

- Malformed JSON or a payload missing required fields → write a message to
  stderr and exit non-zero, so the failure is visible in the harness's hook
  log without crashing the harness. The adapter never throws past `main`.
- Events that map to "none" (filtered notification types, unknown Codex
  types) → exit 0 with no output; they are normal, not errors.
- `osascript` failure → propagates as a non-zero exit (fail-hard, consistent
  with the MVP notifier).
- `install`/`uninstall` I/O errors → clear stderr message, non-zero exit, no
  partial half-written config (write only after the new content is fully
  built in memory).

## Testing

Automated, no real OS notifications (inject a fake `Notifier`; never spawn
`osascript`).

- **Adapters** (`src/cli/adapters.ts`): table-driven over representative
  payloads — Claude `Stop`; Claude `Notification` for each handled and each
  ignored `notification_type`; Codex `agent-turn-complete` with and without
  `last-assistant-message`; Codex `approval-requested`; unknown/garbage
  payloads. Assert the normalized event (type, source, workspace, body) or the
  "no event" outcome.
- **Summary shortening:** long and multi-line `last-assistant-message`
  collapses to a single short line with ellipsis.
- **Install** (`src/cli/install.ts`): operate on temp files.
  - Claude: fresh file created; append preserves an existing unrelated hook;
    running twice does not duplicate (marker update); backup written;
    uninstall removes only our entries.
  - Codex: fresh `notify` set; our-marker update; user-owned `notify` left
    untouched with a warning; uninstall removes only our marker.
- **Router** (`src/cli/index.ts`): dispatches each subcommand and returns the
  right exit code; `claude-hook`/`codex-hook` wired through a fake notifier
  deliver the expected notification; filtered events exit 0 without
  delivering.

A manual macOS smoke check (real hook firing a real notification) is
documented but not automated.

## Packaging

- Second `bin` entry `notify-cli` → `./dist/cli/index.js`.
- `dist/cli/index.js` must keep the `#!/usr/bin/env node` shebang so it is
  directly executable after `npm link`.
- README gains a "Hook-driven notifications" section: build, `npm link` (or
  absolute path), `notify-cli install`, what it writes, and the manual smoke
  check.

## Open Extension Path

- npm publish + `npx notify-cli install` once the local flow is proven.
- Configurable notification-type allowlist if the fixed set proves too narrow.
- Reading the Claude transcript to produce a real completion summary.
- Linux/Windows notifiers inherit automatically once the core gains them,
  since the CLI only depends on the `Notifier` interface.

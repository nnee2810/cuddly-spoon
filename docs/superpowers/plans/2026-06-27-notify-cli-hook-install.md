# notify-cli: Hook-Driven Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `notify-cli` binary that turns Claude/Codex lifecycle-hook payloads into macOS notifications, plus a one-command `install`/`uninstall` that wires those hooks into the user's client config.

**Architecture:** A second `bin` entry alongside the unchanged MCP server. New code under `src/cli/` reuses the existing transport-independent core (`handlers`, `format`, `macos`). Adapters normalize hook payloads into the existing event-input shapes; an install module idempotently patches `~/.claude/settings.json` (JSON) and `~/.codex/config.toml` (TOML). Config written into the hooks uses an absolute `node <abs-repo>/dist/cli/index.js <subcommand>` invocation resolved at runtime — no `npm link` prerequisite.

**Tech Stack:** Node.js ESM, TypeScript, `vitest`, Node built-ins (`node:fs`, `node:os`, `node:path`, `node:url`). No new dependencies.

## Global Constraints

- Reuse the existing core UNCHANGED: `src/events/handlers.ts`, `src/notifications/format.ts`, `src/notifications/macos.ts`, `src/notifications/types.ts`, `src/events/schema.ts`. Do not modify `src/index.ts` (the MCP server entrypoint).
- macOS `osascript` only; no new OS notifier. No new npm dependencies.
- ESM imports use `.js` extensions in source.
- `source` is fixed per subcommand: `claude` for `claude-hook`, `codex` for `codex-hook`.
- `workspace` = `basename(cwd)`, where `cwd` is the payload's `cwd` if present else a caller-supplied fallback (`process.cwd()` at runtime).
- Hook marker string: `dist/cli/index.js` (a command/notify value containing this substring is "ours").
- Event mapping (fixed): Claude `Stop` → `chat_complete`; Claude `Notification` with `notification_type` ∈ {`permission_prompt`, `idle_prompt`} → `user_action_required` (other types → no event); Codex `agent-turn-complete` → `chat_complete`; Codex `approval-requested` → `user_action_required`; anything else → no event.
- `chat_complete` priority default `normal`; `user_action_required` priority default `high`.
- Summaries shortened before formatting: collapse whitespace/newlines to single spaces, trim, ellipsis (`…`) if longer than 150 chars.
- Config writes back up the existing file to `<file>.bak` before overwriting (no backup when creating a new file). Codex `notify` is assumed single-line.
- Codex single `notify` slot: if present and not ours, do NOT overwrite — warn and skip.
- Tests never send real OS notifications and never spawn `osascript` (inject a fake `Notifier` / pass explicit paths).

---

## File Map

- Create `src/cli/adapters.ts`: hook payload → normalized event input.
- Create `src/cli/install.ts`: Claude/Codex config patch + unpatch, marker, path resolution, backup.
- Create `src/cli/index.ts`: `notify-cli` entrypoint, command router, testable payload handler.
- Modify `package.json`: add second `bin` entry `notify-cli`.
- Modify `README.md`: add "Hook-driven notifications" section.
- Create `tests/cli/adapters.test.ts`, `tests/cli/install.test.ts`, `tests/cli/index.test.ts`.

---

## Task 1: CLI Adapters

**Files:**
- Create: `src/cli/adapters.ts`
- Test: `tests/cli/adapters.test.ts`

**Interfaces:**
- Consumes: `ChatCompleteInput`, `UserActionRequiredInput` from `src/notifications/types.ts`.
- Produces:
  - `type NormalizedEvent = { kind: "chat_complete"; input: ChatCompleteInput } | { kind: "user_action_required"; input: UserActionRequiredInput } | null`
  - `shortenSummary(text: string, max?: number): string`
  - `adaptClaudePayload(payload: unknown, fallbackCwd: string): NormalizedEvent`
  - `adaptCodexPayload(payload: unknown, fallbackCwd: string): NormalizedEvent`
  - Both adapters THROW on a payload that is not a JSON object; return `null` for recognized-but-unmatched events.

- [ ] **Step 1: Write the failing tests**

Create `tests/cli/adapters.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  adaptClaudePayload,
  adaptCodexPayload,
  shortenSummary,
} from "../../src/cli/adapters.js";

describe("shortenSummary", () => {
  it("collapses whitespace and trims", () => {
    expect(shortenSummary("  multi   line\t text  ")).toBe("multi line text");
  });

  it("collapses newlines to single spaces", () => {
    expect(shortenSummary("line one\nline two")).toBe("line one line two");
  });

  it("ellipsizes when longer than max", () => {
    const long = "x".repeat(200);
    const out = shortenSummary(long, 150);
    expect(out.length).toBe(150);
    expect(out.endsWith("…")).toBe(true);
  });

  it("leaves short text unchanged", () => {
    expect(shortenSummary("short", 150)).toBe("short");
  });
});

describe("adaptClaudePayload", () => {
  it("maps Stop to chat_complete with workspace from cwd and fallback body", () => {
    const event = adaptClaudePayload(
      { hook_event_name: "Stop", cwd: "/home/me/cuddly-spoon" },
      "/unused",
    );
    expect(event).toEqual({
      kind: "chat_complete",
      input: { source: "claude", workspace: "cuddly-spoon", priority: "normal" },
    });
  });

  it("uses fallbackCwd when payload has no cwd", () => {
    const event = adaptClaudePayload({ hook_event_name: "Stop" }, "/tmp/proj");
    expect(event).toEqual({
      kind: "chat_complete",
      input: { source: "claude", workspace: "proj", priority: "normal" },
    });
  });

  it("maps permission_prompt Notification to user_action_required with message", () => {
    const event = adaptClaudePayload(
      {
        hook_event_name: "Notification",
        notification_type: "permission_prompt",
        message: "Permission required to run Bash",
        cwd: "/home/me/app",
      },
      "/unused",
    );
    expect(event).toEqual({
      kind: "user_action_required",
      input: {
        source: "claude",
        workspace: "app",
        request: "Permission required to run Bash",
        priority: "high",
      },
    });
  });

  it("maps idle_prompt Notification to user_action_required", () => {
    const event = adaptClaudePayload(
      { hook_event_name: "Notification", notification_type: "idle_prompt", message: "Waiting for input", cwd: "/x/app" },
      "/unused",
    );
    expect(event?.kind).toBe("user_action_required");
  });

  it("returns null for ignored notification types", () => {
    expect(
      adaptClaudePayload(
        { hook_event_name: "Notification", notification_type: "auth_success", message: "ok", cwd: "/x/app" },
        "/unused",
      ),
    ).toBeNull();
  });

  it("returns null for unrelated hook events", () => {
    expect(adaptClaudePayload({ hook_event_name: "PreToolUse", cwd: "/x/app" }, "/unused")).toBeNull();
  });

  it("throws on a non-object payload", () => {
    expect(() => adaptClaudePayload("nope", "/x")).toThrow();
  });
});

describe("adaptCodexPayload", () => {
  it("maps agent-turn-complete to chat_complete with shortened summary", () => {
    const event = adaptCodexPayload(
      { type: "agent-turn-complete", "last-assistant-message": "All\ntests pass", cwd: "/home/me/repo" },
      "/unused",
    );
    expect(event).toEqual({
      kind: "chat_complete",
      input: { source: "codex", workspace: "repo", summary: "All tests pass", priority: "normal" },
    });
  });

  it("falls back when agent-turn-complete has no message", () => {
    const event = adaptCodexPayload({ type: "agent-turn-complete" }, "/tmp/here");
    expect(event).toEqual({
      kind: "chat_complete",
      input: { source: "codex", workspace: "here", priority: "normal" },
    });
  });

  it("maps approval-requested to user_action_required", () => {
    const event = adaptCodexPayload(
      { type: "approval-requested", "last-assistant-message": "Run migration?", cwd: "/x/db" },
      "/unused",
    );
    expect(event).toEqual({
      kind: "user_action_required",
      input: { source: "codex", workspace: "db", request: "Run migration?", priority: "high" },
    });
  });

  it("uses a fallback request for approval-requested without a message", () => {
    const event = adaptCodexPayload({ type: "approval-requested", cwd: "/x/db" }, "/unused");
    expect(event).toEqual({
      kind: "user_action_required",
      input: { source: "codex", workspace: "db", request: "Approval requested.", priority: "high" },
    });
  });

  it("returns null for unknown types", () => {
    expect(adaptCodexPayload({ type: "something-else" }, "/x")).toBeNull();
  });

  it("throws on a non-object payload", () => {
    expect(() => adaptCodexPayload(42, "/x")).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
rtk npm test -- tests/cli/adapters.test.ts
```

Expected: FAIL because `src/cli/adapters.ts` does not exist.

- [ ] **Step 3: Implement adapters**

Create `src/cli/adapters.ts`:

```ts
import { basename } from "node:path";
import type {
  ChatCompleteInput,
  UserActionRequiredInput,
} from "../notifications/types.js";

export type NormalizedEvent =
  | { kind: "chat_complete"; input: ChatCompleteInput }
  | { kind: "user_action_required"; input: UserActionRequiredInput }
  | null;

const CLAUDE_USER_ACTION_TYPES = new Set(["permission_prompt", "idle_prompt"]);

export function shortenSummary(text: string, max = 150): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= max) {
    return collapsed;
  }
  return collapsed.slice(0, max - 1).trimEnd() + "…";
}

function asRecord(payload: unknown): Record<string, unknown> {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new Error("Hook payload must be a JSON object");
  }
  return payload as Record<string, unknown>;
}

function workspaceFrom(record: Record<string, unknown>, fallbackCwd: string): string {
  const cwd = typeof record.cwd === "string" && record.cwd ? record.cwd : fallbackCwd;
  return basename(cwd);
}

function asText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

export function adaptClaudePayload(payload: unknown, fallbackCwd: string): NormalizedEvent {
  const record = asRecord(payload);
  const workspace = workspaceFrom(record, fallbackCwd);

  if (record.hook_event_name === "Stop") {
    return {
      kind: "chat_complete",
      input: { source: "claude", workspace, priority: "normal" },
    };
  }

  if (
    record.hook_event_name === "Notification" &&
    typeof record.notification_type === "string" &&
    CLAUDE_USER_ACTION_TYPES.has(record.notification_type)
  ) {
    return {
      kind: "user_action_required",
      input: {
        source: "claude",
        workspace,
        request: asText(record.message) ?? "Action required.",
        priority: "high",
      },
    };
  }

  return null;
}

export function adaptCodexPayload(payload: unknown, fallbackCwd: string): NormalizedEvent {
  const record = asRecord(payload);
  const workspace = workspaceFrom(record, fallbackCwd);
  const message = asText(record["last-assistant-message"]);

  if (record.type === "agent-turn-complete") {
    const summary = message ? shortenSummary(message) : undefined;
    const input: ChatCompleteInput = { source: "codex", workspace, priority: "normal" };
    if (summary) {
      input.summary = summary;
    }
    return { kind: "chat_complete", input };
  }

  if (record.type === "approval-requested") {
    return {
      kind: "user_action_required",
      input: {
        source: "codex",
        workspace,
        request: message ? shortenSummary(message) : "Approval requested.",
        priority: "high",
      },
    };
  }

  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
rtk npm test -- tests/cli/adapters.test.ts
```

Expected: PASS for all adapter and shortenSummary tests.

- [ ] **Step 5: Run typecheck**

Run:

```bash
rtk npm run typecheck
```

Expected: PASS with no TypeScript errors.

- [ ] **Step 6: Commit**

Run:

```bash
rtk git add src/cli/adapters.ts tests/cli/adapters.test.ts
rtk git commit -m "feat: add hook payload adapters"
```

Expected: one commit with the adapters and their tests.

---

## Task 2: Config Install / Uninstall

**Files:**
- Create: `src/cli/install.ts`
- Test: `tests/cli/install.test.ts`

**Interfaces:**
- Consumes: nothing from prior tasks (pure Node fs/path/url).
- Produces:
  - `HOOK_MARKER = "dist/cli/index.js"` (const string)
  - `resolveCliEntry(): string` — absolute path to the sibling `index.js` (the CLI entrypoint), derived from `import.meta.url`.
  - `claudeCommand(cliEntry: string): string` — returns `node <cliEntry> claude-hook`.
  - `interface InstallResult { changed: boolean; message: string; backupPath?: string }`
  - `installClaude(settingsPath: string, cliEntry: string): InstallResult`
  - `uninstallClaude(settingsPath: string): InstallResult`
  - `installCodex(configPath: string, cliEntry: string): InstallResult`
  - `uninstallCodex(configPath: string): InstallResult`

- [ ] **Step 1: Write the failing tests**

Create `tests/cli/install.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  claudeCommand,
  installClaude,
  installCodex,
  uninstallClaude,
  uninstallCodex,
} from "../../src/cli/install.js";

const CLI = "/abs/repo/dist/cli/index.js";
const dirs: string[] = [];

function tmp(): string {
  const dir = mkdtempSync(join(tmpdir(), "notify-cli-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("claudeCommand", () => {
  it("builds the node invocation", () => {
    expect(claudeCommand(CLI)).toBe(`node ${CLI} claude-hook`);
  });
});

describe("installClaude", () => {
  it("creates settings.json with Stop and Notification hooks", () => {
    const path = join(tmp(), "settings.json");
    const result = installClaude(path, CLI);

    expect(result.changed).toBe(true);
    const settings = JSON.parse(readFileSync(path, "utf8"));
    expect(settings.hooks.Stop[0].hooks[0].command).toBe(`node ${CLI} claude-hook`);
    expect(settings.hooks.Notification[0].hooks[0].command).toBe(`node ${CLI} claude-hook`);
  });

  it("preserves an existing unrelated hook and backs up", () => {
    const path = join(tmp(), "settings.json");
    writeFileSync(
      path,
      JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: "command", command: "echo hi" }] }] } }),
    );

    installClaude(path, CLI);

    const settings = JSON.parse(readFileSync(path, "utf8"));
    const commands = settings.hooks.Stop.flatMap((e: any) => e.hooks.map((h: any) => h.command));
    expect(commands).toContain("echo hi");
    expect(commands).toContain(`node ${CLI} claude-hook`);
    expect(existsSync(`${path}.bak`)).toBe(true);
  });

  it("is idempotent and updates the path on re-run", () => {
    const path = join(tmp(), "settings.json");
    installClaude(path, CLI);
    installClaude(path, "/abs/repo/dist/cli/index.js");
    const result = installClaude(path, "/new/repo/dist/cli/index.js");

    const settings = JSON.parse(readFileSync(path, "utf8"));
    expect(settings.hooks.Stop).toHaveLength(1);
    expect(settings.hooks.Stop[0].hooks[0].command).toBe("node /new/repo/dist/cli/index.js claude-hook");
    expect(result.changed).toBe(true);
  });
});

describe("uninstallClaude", () => {
  it("removes only the notify-cli hooks", () => {
    const path = join(tmp(), "settings.json");
    writeFileSync(
      path,
      JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: "command", command: "echo hi" }] }] } }),
    );
    installClaude(path, CLI);

    const result = uninstallClaude(path);

    expect(result.changed).toBe(true);
    const settings = JSON.parse(readFileSync(path, "utf8"));
    const commands = settings.hooks.Stop.flatMap((e: any) => e.hooks.map((h: any) => h.command));
    expect(commands).toEqual(["echo hi"]);
    expect(settings.hooks.Notification).toBeUndefined();
  });

  it("reports no change when nothing matches", () => {
    const path = join(tmp(), "settings.json");
    writeFileSync(path, JSON.stringify({ hooks: {} }));
    expect(uninstallClaude(path).changed).toBe(false);
  });
});

describe("installCodex", () => {
  it("sets notify in a fresh file", () => {
    const path = join(tmp(), "config.toml");
    const result = installCodex(path, CLI);

    expect(result.changed).toBe(true);
    expect(readFileSync(path, "utf8")).toContain(`notify = ["node", "${CLI}", "codex-hook"]`);
  });

  it("updates an existing notify-cli marker and preserves other content", () => {
    const path = join(tmp(), "config.toml");
    writeFileSync(path, `model = "o3"\nnotify = ["node", "/old/repo/dist/cli/index.js", "codex-hook"]\n`);

    const result = installCodex(path, CLI);

    const text = readFileSync(path, "utf8");
    expect(result.changed).toBe(true);
    expect(text).toContain('model = "o3"');
    expect(text).toContain(`notify = ["node", "${CLI}", "codex-hook"]`);
    expect(text).not.toContain("/old/repo");
  });

  it("does not overwrite a user-owned notify", () => {
    const path = join(tmp(), "config.toml");
    writeFileSync(path, `notify = ["my-own-notifier"]\n`);

    const result = installCodex(path, CLI);

    expect(result.changed).toBe(false);
    expect(readFileSync(path, "utf8")).toContain(`notify = ["my-own-notifier"]`);
    expect(result.message).toContain("left unchanged");
  });
});

describe("uninstallCodex", () => {
  it("removes our notify line", () => {
    const path = join(tmp(), "config.toml");
    writeFileSync(path, `model = "o3"\n`);
    installCodex(path, CLI);

    const result = uninstallCodex(path);

    expect(result.changed).toBe(true);
    const text = readFileSync(path, "utf8");
    expect(text).toContain('model = "o3"');
    expect(text).not.toContain("notify");
  });

  it("leaves a user-owned notify alone", () => {
    const path = join(tmp(), "config.toml");
    writeFileSync(path, `notify = ["my-own-notifier"]\n`);
    expect(uninstallCodex(path).changed).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
rtk npm test -- tests/cli/install.test.ts
```

Expected: FAIL because `src/cli/install.ts` does not exist.

- [ ] **Step 3: Implement the install module**

Create `src/cli/install.ts`:

```ts
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const HOOK_MARKER = "dist/cli/index.js";

export interface InstallResult {
  changed: boolean;
  message: string;
  backupPath?: string;
}

export function resolveCliEntry(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "index.js");
}

export function claudeCommand(cliEntry: string): string {
  return `node ${cliEntry} claude-hook`;
}

function backupIfExists(path: string): string | undefined {
  if (!existsSync(path)) {
    return undefined;
  }
  const backupPath = `${path}.bak`;
  copyFileSync(path, backupPath);
  return backupPath;
}

function writeFile(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

interface ClaudeHookEntry {
  matcher?: string;
  hooks?: Array<{ type?: string; command?: string }>;
}

function entryHasMarker(entry: ClaudeHookEntry): boolean {
  return Boolean(
    entry.hooks?.some((hook) => typeof hook.command === "string" && hook.command.includes(HOOK_MARKER)),
  );
}

function upsertClaudeHook(entries: ClaudeHookEntry[], command: string): void {
  for (const entry of entries) {
    const hook = entry.hooks?.find(
      (item) => typeof item.command === "string" && item.command.includes(HOOK_MARKER),
    );
    if (hook) {
      hook.command = command;
      return;
    }
  }
  entries.push({ hooks: [{ type: "command", command }] });
}

export function installClaude(settingsPath: string, cliEntry: string): InstallResult {
  const raw = existsSync(settingsPath) ? readFileSync(settingsPath, "utf8") : "";
  const settings = raw.trim() ? (JSON.parse(raw) as Record<string, any>) : {};
  settings.hooks ??= {};
  const command = claudeCommand(cliEntry);

  for (const event of ["Stop", "Notification"] as const) {
    settings.hooks[event] ??= [];
    upsertClaudeHook(settings.hooks[event] as ClaudeHookEntry[], command);
  }

  const backupPath = backupIfExists(settingsPath);
  writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
  return { changed: true, message: `Patched ${settingsPath} (Stop, Notification hooks).`, backupPath };
}

export function uninstallClaude(settingsPath: string): InstallResult {
  if (!existsSync(settingsPath)) {
    return { changed: false, message: `No file at ${settingsPath}.` };
  }
  const settings = JSON.parse(readFileSync(settingsPath, "utf8") || "{}") as Record<string, any>;
  let changed = false;

  for (const event of ["Stop", "Notification"] as const) {
    const arr = settings.hooks?.[event] as ClaudeHookEntry[] | undefined;
    if (!Array.isArray(arr)) {
      continue;
    }
    const filtered = arr.filter((entry) => !entryHasMarker(entry));
    if (filtered.length !== arr.length) {
      changed = true;
      if (filtered.length) {
        settings.hooks[event] = filtered;
      } else {
        delete settings.hooks[event];
      }
    }
  }

  if (!changed) {
    return { changed: false, message: `No notify-cli hooks found in ${settingsPath}.` };
  }
  if (settings.hooks && Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }
  backupIfExists(settingsPath);
  writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
  return { changed: true, message: `Removed notify-cli hooks from ${settingsPath}.` };
}

const NOTIFY_RE = /^[ \t]*notify[ \t]*=.*$/m;

function codexNotifyLine(cliEntry: string): string {
  return `notify = ["node", ${JSON.stringify(cliEntry)}, "codex-hook"]`;
}

export function installCodex(configPath: string, cliEntry: string): InstallResult {
  const raw = existsSync(configPath) ? readFileSync(configPath, "utf8") : "";
  const notifyLine = codexNotifyLine(cliEntry);
  const match = raw.match(NOTIFY_RE);

  let next: string;
  if (!match) {
    next = raw.length === 0 || raw.endsWith("\n") ? `${raw}${notifyLine}\n` : `${raw}\n${notifyLine}\n`;
  } else if (match[0].includes(HOOK_MARKER)) {
    next = raw.replace(NOTIFY_RE, notifyLine);
  } else {
    return {
      changed: false,
      message: `Codex already has a 'notify' in ${configPath}; left unchanged.\nTo use notify-cli, set:\n  ${notifyLine}`,
    };
  }

  const backupPath = backupIfExists(configPath);
  writeFile(configPath, next);
  return { changed: true, message: `Set notify in ${configPath}.`, backupPath };
}

export function uninstallCodex(configPath: string): InstallResult {
  if (!existsSync(configPath)) {
    return { changed: false, message: `No file at ${configPath}.` };
  }
  const raw = readFileSync(configPath, "utf8");
  const match = raw.match(NOTIFY_RE);
  if (!match) {
    return { changed: false, message: `No notify line in ${configPath}.` };
  }
  if (!match[0].includes(HOOK_MARKER)) {
    return { changed: false, message: `'notify' in ${configPath} is not notify-cli's; left unchanged.` };
  }
  backupIfExists(configPath);
  const next = raw.replace(new RegExp(`${NOTIFY_RE.source}\\n?`, "m"), "");
  writeFile(configPath, next);
  return { changed: true, message: `Removed notify from ${configPath}.` };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
rtk npm test -- tests/cli/install.test.ts
```

Expected: PASS for all install/uninstall tests; no real config files touched (temp dirs only).

- [ ] **Step 5: Run typecheck**

Run:

```bash
rtk npm run typecheck
```

Expected: PASS with no TypeScript errors.

- [ ] **Step 6: Commit**

Run:

```bash
rtk git add src/cli/install.ts tests/cli/install.test.ts
rtk git commit -m "feat: add config install and uninstall"
```

Expected: one commit with the config patching module.

---

## Task 3: CLI Router, Bin, and README

**Files:**
- Create: `src/cli/index.ts`
- Modify: `package.json`
- Modify: `README.md`
- Test: `tests/cli/index.test.ts`

**Interfaces:**
- Consumes: `NormalizedEvent`, `adaptClaudePayload`, `adaptCodexPayload` from `src/cli/adapters.ts`; `notifyChatComplete`, `notifyUserActionRequired` from `src/events/handlers.ts`; `MacOsNotifier` from `src/notifications/macos.ts`; `Notifier` from `src/notifications/types.ts`; `installClaude`, `installCodex`, `uninstallClaude`, `uninstallCodex`, `resolveCliEntry` from `src/cli/install.ts`.
- Produces:
  - `handleHookPayload(raw: string, adapt: (payload: unknown, cwd: string) => NormalizedEvent, deps: { notifier: Notifier; cwd: string }): Promise<{ delivered: boolean }>` — parses JSON, adapts, and on a non-null event calls the matching handler; throws on malformed JSON or a non-object payload.

- [ ] **Step 1: Write the failing tests**

Create `tests/cli/index.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { handleHookPayload } from "../../src/cli/index.js";
import { adaptClaudePayload, adaptCodexPayload } from "../../src/cli/adapters.js";
import type { Notification, Notifier } from "../../src/notifications/types.js";

function recordingNotifier(): { notifier: Notifier; sent: Notification[] } {
  const sent: Notification[] = [];
  return { notifier: { notify: async (n) => void sent.push(n) }, sent };
}

describe("handleHookPayload", () => {
  it("delivers a Claude Stop notification", async () => {
    const { notifier, sent } = recordingNotifier();
    const result = await handleHookPayload(
      JSON.stringify({ hook_event_name: "Stop", cwd: "/home/me/app" }),
      adaptClaudePayload,
      { notifier, cwd: "/fallback" },
    );

    expect(result).toEqual({ delivered: true });
    expect(sent).toEqual([{ title: "Claude completed", subtitle: "app", body: "Task completed." }]);
  });

  it("delivers a Codex agent-turn-complete notification with summary", async () => {
    const { notifier, sent } = recordingNotifier();
    const result = await handleHookPayload(
      JSON.stringify({ type: "agent-turn-complete", "last-assistant-message": "Done", cwd: "/x/repo" }),
      adaptCodexPayload,
      { notifier, cwd: "/fallback" },
    );

    expect(result).toEqual({ delivered: true });
    expect(sent).toEqual([{ title: "Codex completed", subtitle: "repo", body: "Done" }]);
  });

  it("does not deliver for filtered events", async () => {
    const { notifier, sent } = recordingNotifier();
    const result = await handleHookPayload(
      JSON.stringify({ hook_event_name: "Notification", notification_type: "auth_success", cwd: "/x/app" }),
      adaptClaudePayload,
      { notifier, cwd: "/fallback" },
    );

    expect(result).toEqual({ delivered: false });
    expect(sent).toEqual([]);
  });

  it("throws on malformed JSON", async () => {
    const { notifier } = recordingNotifier();
    await expect(
      handleHookPayload("{not json", adaptClaudePayload, { notifier, cwd: "/x" }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
rtk npm test -- tests/cli/index.test.ts
```

Expected: FAIL because `src/cli/index.ts` does not exist.

- [ ] **Step 3: Implement the CLI entrypoint**

Create `src/cli/index.ts`:

```ts
#!/usr/bin/env node
import { homedir } from "node:os";
import { join } from "node:path";
import {
  adaptClaudePayload,
  adaptCodexPayload,
  type NormalizedEvent,
} from "./adapters.js";
import {
  notifyChatComplete,
  notifyUserActionRequired,
} from "../events/handlers.js";
import { MacOsNotifier } from "../notifications/macos.js";
import type { Notifier } from "../notifications/types.js";
import {
  installClaude,
  installCodex,
  resolveCliEntry,
  uninstallClaude,
  uninstallCodex,
} from "./install.js";

export async function handleHookPayload(
  raw: string,
  adapt: (payload: unknown, cwd: string) => NormalizedEvent,
  deps: { notifier: Notifier; cwd: string },
): Promise<{ delivered: boolean }> {
  const event = adapt(JSON.parse(raw), deps.cwd);
  if (!event) {
    return { delivered: false };
  }
  if (event.kind === "chat_complete") {
    await notifyChatComplete(event.input, { notifier: deps.notifier });
  } else {
    await notifyUserActionRequired(event.input, { notifier: deps.notifier });
  }
  return { delivered: true };
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function runConfig(command: "install" | "uninstall", flags: string[]): void {
  const both = !flags.includes("--claude") && !flags.includes("--codex");
  const cliEntry = resolveCliEntry();
  const claudePath = join(homedir(), ".claude", "settings.json");
  const codexPath = join(homedir(), ".codex", "config.toml");

  if (both || flags.includes("--claude")) {
    const result = command === "install" ? installClaude(claudePath, cliEntry) : uninstallClaude(claudePath);
    console.log(result.message);
  }
  if (both || flags.includes("--codex")) {
    const result = command === "install" ? installCodex(codexPath, cliEntry) : uninstallCodex(codexPath);
    console.log(result.message);
  }
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  const deps = { notifier: new MacOsNotifier(), cwd: process.cwd() };

  switch (command) {
    case "claude-hook":
      await handleHookPayload(await readStdin(), adaptClaudePayload, deps);
      return;
    case "codex-hook":
      await handleHookPayload(process.argv[3] ?? "", adaptCodexPayload, deps);
      return;
    case "install":
    case "uninstall":
      runConfig(command, rest);
      return;
    default:
      console.error("Usage: notify-cli <claude-hook|codex-hook|install|uninstall> [--claude|--codex]");
      process.exitCode = 1;
  }
}

const invokedDirectly = process.argv[1]?.endsWith("cli/index.js");
if (invokedDirectly) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
rtk npm test -- tests/cli/index.test.ts
```

Expected: PASS. The `main()` glue is not invoked under vitest (the `invokedDirectly` guard is false), so importing the module is side-effect free.

- [ ] **Step 5: Add the second bin entry**

Modify `package.json` — change the `bin` block to:

```json
  "bin": {
    "mcp-notification-server": "./dist/index.js",
    "notify-cli": "./dist/cli/index.js"
  },
```

- [ ] **Step 6: Add the README section**

Append this section to `README.md` (after the existing "Manual macOS Smoke Check" section):

```md
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
```

- [ ] **Step 7: Build and verify the bin output**

Run:

```bash
rtk npm run build
```

Expected: PASS and `dist/cli/index.js` exists with a `#!/usr/bin/env node` first line.

- [ ] **Step 8: Run typecheck and the full suite**

Run:

```bash
rtk npm run typecheck
rtk npm test
```

Expected: PASS for typecheck and all tests (MVP suites plus the three new CLI suites).

- [ ] **Step 9: Commit**

Run:

```bash
rtk git add src/cli/index.ts package.json README.md tests/cli/index.test.ts
rtk git commit -m "feat: add notify-cli entrypoint, bin, and docs"
```

Expected: one commit with the CLI entrypoint, bin entry, and README.

---

## Task 4: Final Verification

**Files:**
- Modify only if checks reveal a concrete issue in files from earlier tasks.

- [ ] **Step 1: Run full verification**

Run:

```bash
rtk npm run build
rtk npm run typecheck
rtk npm test
```

Expected:

- `npm run build`: PASS and emits `dist/cli/index.js`.
- `npm run typecheck`: PASS.
- `npm test`: PASS (MVP + CLI suites).

- [ ] **Step 2: Verify the built CLI dispatches**

Run:

```bash
node dist/cli/index.js 2>&1 | head -1
```

Expected: prints the usage line `Usage: notify-cli <claude-hook|codex-hook|install|uninstall> [--claude|--codex]` (and exits non-zero).

- [ ] **Step 3: Inspect final git status**

Run:

```bash
rtk git status --short
```

Expected: no unstaged implementation files. `dist/` is git-ignored.

- [ ] **Step 4: Report completion**

Report:

- Latest commit hash.
- Verification commands and pass/fail status.
- Confirmation that no real OS notification was sent by the test suite.
- Any skipped manual macOS hook smoke check.

## Spec Coverage Check

- `notify-cli` binary + reuse of core: Tasks 1–3 (handlers/format/macos imported, never modified).
- Two semantic events with fixed mapping: Task 1 adapters.
- Summary shortening for macOS surfaces: Task 1 `shortenSummary`.
- `claude-hook` (stdin) and `codex-hook` (argv) ingest: Task 3 router.
- `install`/`uninstall` patch Claude JSON + Codex TOML, idempotent, marker-based, backup: Task 2.
- Codex single-slot skip + warn: Task 2 `installCodex`.
- Absolute `node <abs>/dist/cli/index.js` invocation, no npm link required: Task 2 `resolveCliEntry`/`claudeCommand`, Task 3 README.
- Second `bin` entry + shebang: Task 3.
- No real OS notifications in tests; fake notifier / temp files: Tasks 1–3.
- Build/typecheck/full suite: Tasks 3 and 4.

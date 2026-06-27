# MCP Notification Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a TypeScript MCP stdio server that exposes notification tools for Claude/Codex events and sends macOS notifications through `osascript`.

**Architecture:** The MCP transport layer registers two tools and delegates all work to transport-independent handlers. Event schemas normalize structured input, formatters generate notification text, and a `Notifier` interface isolates macOS delivery from domain logic. HTTP and other OS notifiers stay out of the MVP, but the core handlers remain reusable.

**Tech Stack:** Node.js ESM, TypeScript, `@modelcontextprotocol/sdk` v1 package, `zod`, `vitest`, built-in `node:child_process`, macOS `osascript`.

---

## File Map

- Create `package.json`: package metadata, bin entry, scripts, dependencies.
- Create `tsconfig.json`: TypeScript ESM compiler config.
- Create `vitest.config.ts`: Vitest config for TypeScript unit tests.
- Create `src/notifications/types.ts`: shared event, notification, notifier, and delivery result types.
- Create `src/events/schema.ts`: zod schemas, MCP input shapes, normalized input types.
- Create `src/notifications/format.ts`: source display normalization and notification formatting.
- Create `src/events/handlers.ts`: transport-independent handlers for both MCP tools.
- Create `src/notifications/macos.ts`: `osascript` notifier implementation.
- Create `src/mcp/server.ts`: MCP server factory and tool registration.
- Create `src/index.ts`: stdio entrypoint.
- Create `README.md`: usage, build/test commands, MCP client config example, manual smoke check.
- Create `tests/events/schema.test.ts`: schema validation and defaults.
- Create `tests/notifications/format.test.ts`: formatter behavior.
- Create `tests/events/handlers.test.ts`: handler success and failure behavior.
- Create `tests/notifications/macos.test.ts`: AppleScript generation and runner behavior without sending notifications.
- Create `tests/mcp/server.test.ts`: server factory smoke test.

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Create package metadata**

Create `package.json`:

```json
{
  "name": "mcp-notification-server",
  "version": "0.1.0",
  "description": "MCP stdio server that sends local OS notifications for Claude and Codex events.",
  "type": "module",
  "bin": {
    "mcp-notification-server": "./dist/index.js"
  },
  "files": [
    "dist",
    "README.md"
  ],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.13.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

- [ ] **Step 2: Create TypeScript config**

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["dist", "node_modules", "tests"]
}
```

- [ ] **Step 3: Create Vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Install dependencies**

Run:

```bash
rtk npm install
```

Expected: `node_modules/` and `package-lock.json` are created, and npm exits with code 0.

- [ ] **Step 5: Run baseline checks**

Run:

```bash
rtk npm run typecheck
```

Expected: TypeScript reports no source inputs or no errors once source files exist. If TypeScript reports that `src` has no inputs, continue; Task 2 creates the first source files.

- [ ] **Step 6: Commit scaffold**

Run:

```bash
rtk git add package.json package-lock.json tsconfig.json vitest.config.ts
rtk git commit -m "chore: scaffold TypeScript project"
```

Expected: one commit containing package and TypeScript setup.

## Task 2: Event Schemas

**Files:**
- Create: `src/notifications/types.ts`
- Create: `src/events/schema.ts`
- Test: `tests/events/schema.test.ts`

- [ ] **Step 1: Write failing schema tests**

Create `tests/events/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  ChatCompleteInputSchema,
  UserActionRequiredInputSchema,
} from "../../src/events/schema.js";

describe("event input schemas", () => {
  it("normalizes chat complete priority to normal", () => {
    const input = ChatCompleteInputSchema.parse({
      source: "codex",
      workspace: "cuddly-spoon",
      summary: "Finished the task",
    });

    expect(input).toEqual({
      source: "codex",
      workspace: "cuddly-spoon",
      summary: "Finished the task",
      priority: "normal",
    });
  });

  it("normalizes user action priority to high", () => {
    const input = UserActionRequiredInputSchema.parse({
      source: "claude",
      request: "Approve the command",
    });

    expect(input).toEqual({
      source: "claude",
      request: "Approve the command",
      priority: "high",
    });
  });

  it("rejects empty required strings", () => {
    expect(() =>
      ChatCompleteInputSchema.parse({
        source: "   ",
      }),
    ).toThrow();

    expect(() =>
      UserActionRequiredInputSchema.parse({
        source: "codex",
        request: "",
      }),
    ).toThrow();
  });

  it("rejects unknown priority values", () => {
    expect(() =>
      ChatCompleteInputSchema.parse({
        source: "codex",
        priority: "urgent",
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run schema tests and verify failure**

Run:

```bash
rtk npm test -- tests/events/schema.test.ts
```

Expected: FAIL because `src/events/schema.ts` does not exist.

- [ ] **Step 3: Create shared types**

Create `src/notifications/types.ts`:

```ts
export type Priority = "low" | "normal" | "high";

export type EventType = "chat_complete" | "user_action_required";

export interface BaseEventInput {
  source: string;
  conversationId?: string;
  workspace?: string;
  priority: Priority;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface ChatCompleteInput extends BaseEventInput {
  summary?: string;
}

export interface UserActionRequiredInput extends BaseEventInput {
  request: string;
}

export interface Notification {
  title: string;
  body: string;
  subtitle?: string;
}

export interface DeliveryResult {
  delivered: true;
  eventType: EventType;
  notificationTitle: string;
}

export interface Notifier {
  notify(notification: Notification): Promise<void>;
}
```

- [ ] **Step 4: Create zod schemas and MCP input shapes**

Create `src/events/schema.ts`:

```ts
import { z } from "zod";
import type {
  ChatCompleteInput,
  Priority,
  UserActionRequiredInput,
} from "../notifications/types.js";

const nonEmptyString = z.string().trim().min(1);
const optionalNonEmptyString = nonEmptyString.optional();

export const PrioritySchema = z.enum(["low", "normal", "high"]);

export const baseEventInputShape = {
  source: nonEmptyString,
  conversationId: optionalNonEmptyString,
  workspace: optionalNonEmptyString,
  priority: PrioritySchema.optional(),
  actionUrl: optionalNonEmptyString,
  metadata: z.record(z.unknown()).optional(),
};

export const chatCompleteInputShape = {
  ...baseEventInputShape,
  summary: optionalNonEmptyString,
};

export const userActionRequiredInputShape = {
  ...baseEventInputShape,
  request: nonEmptyString,
};

export const ChatCompleteInputSchema: z.ZodType<ChatCompleteInput> = z
  .object(chatCompleteInputShape)
  .strict()
  .transform((input) => ({
    ...input,
    priority: (input.priority ?? "normal") as Priority,
  }));

export const UserActionRequiredInputSchema: z.ZodType<UserActionRequiredInput> = z
  .object(userActionRequiredInputShape)
  .strict()
  .transform((input) => ({
    ...input,
    priority: (input.priority ?? "high") as Priority,
  }));
```

- [ ] **Step 5: Run schema tests and verify pass**

Run:

```bash
rtk npm test -- tests/events/schema.test.ts
```

Expected: PASS for all schema tests.

- [ ] **Step 6: Run typecheck**

Run:

```bash
rtk npm run typecheck
```

Expected: PASS with no TypeScript errors.

- [ ] **Step 7: Commit schemas**

Run:

```bash
rtk git add src/notifications/types.ts src/events/schema.ts tests/events/schema.test.ts
rtk git commit -m "feat: add notification event schemas"
```

Expected: one commit with schema and type files.

## Task 3: Notification Formatter

**Files:**
- Create: `src/notifications/format.ts`
- Test: `tests/notifications/format.test.ts`

- [ ] **Step 1: Write failing formatter tests**

Create `tests/notifications/format.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  formatChatCompleteNotification,
  formatUserActionRequiredNotification,
  toDisplaySource,
} from "../../src/notifications/format.js";

describe("notification formatting", () => {
  it("normalizes known and custom source names", () => {
    expect(toDisplaySource("codex")).toBe("Codex");
    expect(toDisplaySource("claude")).toBe("Claude");
    expect(toDisplaySource("my-agent_runner")).toBe("My Agent Runner");
  });

  it("formats chat complete notifications with summary and workspace", () => {
    const notification = formatChatCompleteNotification({
      source: "codex",
      workspace: "cuddly-spoon",
      summary: "Tests are green",
      priority: "normal",
    });

    expect(notification).toEqual({
      title: "Codex completed",
      subtitle: "cuddly-spoon",
      body: "Tests are green",
    });
  });

  it("formats chat complete fallback body", () => {
    const notification = formatChatCompleteNotification({
      source: "claude",
      priority: "normal",
    });

    expect(notification).toEqual({
      title: "Claude completed",
      body: "Task completed.",
    });
  });

  it("formats user action notifications with action url text", () => {
    const notification = formatUserActionRequiredNotification({
      source: "codex",
      workspace: "cuddly-spoon",
      request: "Approve command execution",
      priority: "high",
      actionUrl: "codex://session/123",
    });

    expect(notification).toEqual({
      title: "Codex needs input",
      subtitle: "cuddly-spoon",
      body: "Approve command execution\nOpen: codex://session/123",
    });
  });
});
```

- [ ] **Step 2: Run formatter tests and verify failure**

Run:

```bash
rtk npm test -- tests/notifications/format.test.ts
```

Expected: FAIL because `src/notifications/format.ts` does not exist.

- [ ] **Step 3: Implement formatter**

Create `src/notifications/format.ts`:

```ts
import type {
  ChatCompleteInput,
  Notification,
  UserActionRequiredInput,
} from "./types.js";

export function toDisplaySource(source: string): string {
  return source
    .trim()
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function formatChatCompleteNotification(
  input: ChatCompleteInput,
): Notification {
  return {
    title: `${toDisplaySource(input.source)} completed`,
    subtitle: input.workspace,
    body: appendActionUrl(input.summary ?? "Task completed.", input.actionUrl),
  };
}

export function formatUserActionRequiredNotification(
  input: UserActionRequiredInput,
): Notification {
  return {
    title: `${toDisplaySource(input.source)} needs input`,
    subtitle: input.workspace,
    body: appendActionUrl(input.request, input.actionUrl),
  };
}

function appendActionUrl(body: string, actionUrl: string | undefined): string {
  if (!actionUrl) {
    return body;
  }

  return `${body}\nOpen: ${actionUrl}`;
}
```

- [ ] **Step 4: Run formatter tests and verify pass**

Run:

```bash
rtk npm test -- tests/notifications/format.test.ts
```

Expected: PASS for all formatter tests.

- [ ] **Step 5: Run typecheck**

Run:

```bash
rtk npm run typecheck
```

Expected: PASS with no TypeScript errors.

- [ ] **Step 6: Commit formatter**

Run:

```bash
rtk git add src/notifications/format.ts tests/notifications/format.test.ts
rtk git commit -m "feat: format notification events"
```

Expected: one commit with formatter behavior.

## Task 4: Event Handlers

**Files:**
- Create: `src/events/handlers.ts`
- Test: `tests/events/handlers.test.ts`

- [ ] **Step 1: Write failing handler tests**

Create `tests/events/handlers.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import {
  notifyChatComplete,
  notifyUserActionRequired,
} from "../../src/events/handlers.js";
import type { Notification, Notifier } from "../../src/notifications/types.js";

describe("event handlers", () => {
  it("sends chat complete notification and returns delivery result", async () => {
    const sent: Notification[] = [];
    const notifier: Notifier = {
      notify: async (notification) => {
        sent.push(notification);
      },
    };

    const result = await notifyChatComplete(
      {
        source: "codex",
        workspace: "cuddly-spoon",
        summary: "Done",
        priority: "normal",
      },
      { notifier },
    );

    expect(sent).toEqual([
      {
        title: "Codex completed",
        subtitle: "cuddly-spoon",
        body: "Done",
      },
    ]);
    expect(result).toEqual({
      delivered: true,
      eventType: "chat_complete",
      notificationTitle: "Codex completed",
    });
  });

  it("sends user action notification and returns delivery result", async () => {
    const notifier: Notifier = {
      notify: vi.fn().mockResolvedValue(undefined),
    };

    const result = await notifyUserActionRequired(
      {
        source: "claude",
        request: "Pick an option",
        priority: "high",
      },
      { notifier },
    );

    expect(notifier.notify).toHaveBeenCalledWith({
      title: "Claude needs input",
      body: "Pick an option",
    });
    expect(result).toEqual({
      delivered: true,
      eventType: "user_action_required",
      notificationTitle: "Claude needs input",
    });
  });

  it("propagates notifier failures", async () => {
    const notifier: Notifier = {
      notify: vi.fn().mockRejectedValue(new Error("osascript failed")),
    };

    await expect(
      notifyChatComplete(
        {
          source: "codex",
          priority: "normal",
        },
        { notifier },
      ),
    ).rejects.toThrow("osascript failed");
  });
});
```

- [ ] **Step 2: Run handler tests and verify failure**

Run:

```bash
rtk npm test -- tests/events/handlers.test.ts
```

Expected: FAIL because `src/events/handlers.ts` does not exist.

- [ ] **Step 3: Implement handlers**

Create `src/events/handlers.ts`:

```ts
import {
  formatChatCompleteNotification,
  formatUserActionRequiredNotification,
} from "../notifications/format.js";
import type {
  ChatCompleteInput,
  DeliveryResult,
  Notifier,
  UserActionRequiredInput,
} from "../notifications/types.js";

interface HandlerDependencies {
  notifier: Notifier;
}

export async function notifyChatComplete(
  input: ChatCompleteInput,
  dependencies: HandlerDependencies,
): Promise<DeliveryResult> {
  const notification = formatChatCompleteNotification(input);

  await dependencies.notifier.notify(notification);

  return {
    delivered: true,
    eventType: "chat_complete",
    notificationTitle: notification.title,
  };
}

export async function notifyUserActionRequired(
  input: UserActionRequiredInput,
  dependencies: HandlerDependencies,
): Promise<DeliveryResult> {
  const notification = formatUserActionRequiredNotification(input);

  await dependencies.notifier.notify(notification);

  return {
    delivered: true,
    eventType: "user_action_required",
    notificationTitle: notification.title,
  };
}
```

- [ ] **Step 4: Run handler tests and verify pass**

Run:

```bash
rtk npm test -- tests/events/handlers.test.ts
```

Expected: PASS for all handler tests.

- [ ] **Step 5: Run typecheck**

Run:

```bash
rtk npm run typecheck
```

Expected: PASS with no TypeScript errors.

- [ ] **Step 6: Commit handlers**

Run:

```bash
rtk git add src/events/handlers.ts tests/events/handlers.test.ts
rtk git commit -m "feat: add notification event handlers"
```

Expected: one commit with transport-independent handlers.

## Task 5: macOS Notifier

**Files:**
- Create: `src/notifications/macos.ts`
- Test: `tests/notifications/macos.test.ts`

- [ ] **Step 1: Write failing macOS notifier tests**

Create `tests/notifications/macos.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import {
  buildDisplayNotificationScript,
  MacOsNotifier,
} from "../../src/notifications/macos.js";

describe("macOS notifier", () => {
  it("builds display notification AppleScript with escaped values", () => {
    const script = buildDisplayNotificationScript({
      title: 'Codex "done"',
      subtitle: "cuddly-spoon",
      body: 'Finished \\ checked "quotes"',
    });

    expect(script).toBe(
      'display notification "Finished \\\\ checked \\"quotes\\"" with title "Codex \\"done\\"" subtitle "cuddly-spoon"',
    );
  });

  it("runs osascript with the generated script", async () => {
    const runOsascript = vi.fn().mockResolvedValue(undefined);
    const notifier = new MacOsNotifier(runOsascript);

    await notifier.notify({
      title: "Codex completed",
      body: "Done",
    });

    expect(runOsascript).toHaveBeenCalledWith([
      "-e",
      'display notification "Done" with title "Codex completed"',
    ]);
  });

  it("propagates runner failures", async () => {
    const runOsascript = vi.fn().mockRejectedValue(new Error("not allowed"));
    const notifier = new MacOsNotifier(runOsascript);

    await expect(
      notifier.notify({
        title: "Codex completed",
        body: "Done",
      }),
    ).rejects.toThrow("not allowed");
  });
});
```

- [ ] **Step 2: Run macOS notifier tests and verify failure**

Run:

```bash
rtk npm test -- tests/notifications/macos.test.ts
```

Expected: FAIL because `src/notifications/macos.ts` does not exist.

- [ ] **Step 3: Implement macOS notifier**

Create `src/notifications/macos.ts`:

```ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Notification, Notifier } from "./types.js";

type OsascriptRunner = (args: string[]) => Promise<void>;

const execFileAsync = promisify(execFile);

export class MacOsNotifier implements Notifier {
  constructor(private readonly runOsascript: OsascriptRunner = defaultOsascriptRunner) {}

  async notify(notification: Notification): Promise<void> {
    const script = buildDisplayNotificationScript(notification);

    await this.runOsascript(["-e", script]);
  }
}

export function buildDisplayNotificationScript(notification: Notification): string {
  const parts = [
    `display notification "${escapeAppleScriptString(notification.body)}"`,
    `with title "${escapeAppleScriptString(notification.title)}"`,
  ];

  if (notification.subtitle) {
    parts.push(`subtitle "${escapeAppleScriptString(notification.subtitle)}"`);
  }

  return parts.join(" ");
}

function escapeAppleScriptString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function defaultOsascriptRunner(args: string[]): Promise<void> {
  await execFileAsync("osascript", args);
}
```

- [ ] **Step 4: Run macOS notifier tests and verify pass**

Run:

```bash
rtk npm test -- tests/notifications/macos.test.ts
```

Expected: PASS for all macOS notifier tests and no real OS notification is sent.

- [ ] **Step 5: Run typecheck**

Run:

```bash
rtk npm run typecheck
```

Expected: PASS with no TypeScript errors.

- [ ] **Step 6: Commit macOS notifier**

Run:

```bash
rtk git add src/notifications/macos.ts tests/notifications/macos.test.ts
rtk git commit -m "feat: add macOS notification adapter"
```

Expected: one commit with the `osascript` notifier.

## Task 6: MCP Server Tools

**Files:**
- Create: `src/mcp/server.ts`
- Test: `tests/mcp/server.test.ts`

- [ ] **Step 1: Write failing MCP server smoke test**

Create `tests/mcp/server.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createNotificationServer } from "../../src/mcp/server.js";
import type { Notifier } from "../../src/notifications/types.js";

describe("MCP notification server", () => {
  it("creates the server without starting a transport", () => {
    const notifier: Notifier = {
      notify: async () => undefined,
    };

    const server = createNotificationServer({ notifier });

    expect(server).toBeDefined();
  });
});
```

- [ ] **Step 2: Run MCP server smoke test and verify failure**

Run:

```bash
rtk npm test -- tests/mcp/server.test.ts
```

Expected: FAIL because `src/mcp/server.ts` does not exist.

- [ ] **Step 3: Implement MCP server factory**

Create `src/mcp/server.ts`:

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  ChatCompleteInputSchema,
  chatCompleteInputShape,
  UserActionRequiredInputSchema,
  userActionRequiredInputShape,
} from "../events/schema.js";
import {
  notifyChatComplete,
  notifyUserActionRequired,
} from "../events/handlers.js";
import type { Notifier } from "../notifications/types.js";

interface CreateNotificationServerOptions {
  notifier: Notifier;
}

export function createNotificationServer(
  options: CreateNotificationServerOptions,
): McpServer {
  const server = new McpServer({
    name: "mcp-notification-server",
    version: "0.1.0",
  });

  server.registerTool(
    "notify_chat_complete",
    {
      title: "Notify chat complete",
      description:
        "Send a local OS notification when Claude, Codex, or another agent completes a chat turn or task.",
      inputSchema: chatCompleteInputShape,
    },
    async (input) => {
      const parsedInput = ChatCompleteInputSchema.parse(input);
      const result = await notifyChatComplete(parsedInput, {
        notifier: options.notifier,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result),
          },
        ],
      };
    },
  );

  server.registerTool(
    "notify_user_action_required",
    {
      title: "Notify user action required",
      description:
        "Send a local OS notification when Claude, Codex, or another agent needs user input, approval, or manual action.",
      inputSchema: userActionRequiredInputShape,
    },
    async (input) => {
      const parsedInput = UserActionRequiredInputSchema.parse(input);
      const result = await notifyUserActionRequired(parsedInput, {
        notifier: options.notifier,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result),
          },
        ],
      };
    },
  );

  return server;
}
```

- [ ] **Step 4: Run MCP server smoke test and verify pass**

Run:

```bash
rtk npm test -- tests/mcp/server.test.ts
```

Expected: PASS for server creation.

- [ ] **Step 5: Run all automated tests**

Run:

```bash
rtk npm test
```

Expected: PASS for schema, formatter, handler, macOS notifier, and MCP server tests.

- [ ] **Step 6: Run typecheck**

Run:

```bash
rtk npm run typecheck
```

Expected: PASS with no TypeScript errors.

- [ ] **Step 7: Commit MCP server**

Run:

```bash
rtk git add src/mcp/server.ts tests/mcp/server.test.ts
rtk git commit -m "feat: register MCP notification tools"
```

Expected: one commit with MCP SDK tool registration.

## Task 7: Stdio Entrypoint And README

**Files:**
- Create: `src/index.ts`
- Create: `README.md`

- [ ] **Step 1: Create stdio entrypoint**

Create `src/index.ts`:

```ts
#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createNotificationServer } from "./mcp/server.js";
import { MacOsNotifier } from "./notifications/macos.js";

const server = createNotificationServer({
  notifier: new MacOsNotifier(),
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

- [ ] **Step 2: Create README**

Create `README.md`:

```md
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
```

- [ ] **Step 3: Build project and verify dist output**

Run:

```bash
rtk npm run build
```

Expected: PASS and `dist/index.js` exists.

- [ ] **Step 4: Run typecheck**

Run:

```bash
rtk npm run typecheck
```

Expected: PASS with no TypeScript errors.

- [ ] **Step 5: Run all tests**

Run:

```bash
rtk npm test
```

Expected: PASS for all automated tests.

- [ ] **Step 6: Commit entrypoint and README**

Run:

```bash
rtk git add src/index.ts README.md
rtk git commit -m "docs: add MCP server usage"
```

Expected: one commit with the executable entrypoint and user documentation.

## Task 8: Final Verification

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

- `npm run build`: PASS and emits `dist`.
- `npm run typecheck`: PASS.
- `npm test`: PASS.

- [ ] **Step 2: Inspect final git status**

Run:

```bash
rtk git status --short
```

Expected: no unstaged implementation files. Pre-existing `.serena/` may remain untracked and should not be committed unless explicitly requested.

- [ ] **Step 3: Commit final fixes if any were required**

If Step 1 required small fixes, run:

```bash
rtk git add src tests README.md package.json package-lock.json tsconfig.json vitest.config.ts
rtk git commit -m "fix: stabilize notification server checks"
```

Expected: a commit only if verification fixes were necessary. If no fixes were necessary, skip this commit.

- [ ] **Step 4: Report completion**

Report:

- Latest commit hash.
- Verification commands and pass/fail status.
- Any skipped manual macOS notification check.
- Remaining untracked `.serena/` status if still present.

## Spec Coverage Check

- MCP stdio server: Task 6 registers tools; Task 7 connects stdio.
- Two explicit tools: Task 6 implements `notify_chat_complete` and `notify_user_action_required`.
- Structured schemas and defaults: Task 2.
- Server-owned notification wording: Task 3.
- Fail-hard delivery errors: Task 4 and Task 5 propagate notifier failures.
- macOS `osascript`: Task 5.
- Transport-independent core handlers: Task 4, with MCP wiring isolated in Task 6.
- Automated tests without real OS notifications: Tasks 2 through 6.
- Build, typecheck, package bin, README config: Tasks 1, 7, and 8.

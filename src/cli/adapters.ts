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

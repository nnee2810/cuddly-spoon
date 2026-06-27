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

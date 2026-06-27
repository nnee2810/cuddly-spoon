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

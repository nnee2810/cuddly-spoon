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

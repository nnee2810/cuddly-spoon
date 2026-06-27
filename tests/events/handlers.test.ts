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

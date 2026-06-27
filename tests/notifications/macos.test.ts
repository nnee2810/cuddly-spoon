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

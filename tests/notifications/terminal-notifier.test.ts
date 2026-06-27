import { describe, expect, it, vi } from "vitest";
import {
  buildTerminalNotifierArgs,
  TerminalNotifier,
} from "../../src/notifications/terminal-notifier.js";

describe("terminal-notifier", () => {
  it("builds args with title, message, and sound", () => {
    const args = buildTerminalNotifierArgs({ title: "Codex completed", body: "Done" });

    expect(args).toEqual([
      "-title",
      "Codex completed",
      "-message",
      "Done",
      "-sound",
      "default",
    ]);
  });

  it("includes subtitle when present", () => {
    const args = buildTerminalNotifierArgs({
      title: "Codex needs input",
      subtitle: "cuddly-spoon",
      body: "Approve command",
    });

    expect(args).toEqual([
      "-title",
      "Codex needs input",
      "-message",
      "Approve command",
      "-subtitle",
      "cuddly-spoon",
      "-sound",
      "default",
    ]);
  });

  it("runs terminal-notifier with the generated args", async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const notifier = new TerminalNotifier(run);

    await notifier.notify({ title: "Codex completed", body: "Done" });

    expect(run).toHaveBeenCalledWith("terminal-notifier", [
      "-title",
      "Codex completed",
      "-message",
      "Done",
      "-sound",
      "default",
    ]);
  });

  it("propagates runner failures", async () => {
    const run = vi.fn().mockRejectedValue(new Error("not installed"));
    const notifier = new TerminalNotifier(run);

    await expect(notifier.notify({ title: "t", body: "b" })).rejects.toThrow("not installed");
  });
});

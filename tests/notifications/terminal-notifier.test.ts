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

  it("includes subtitle and group when present", () => {
    const args = buildTerminalNotifierArgs(
      {
        title: "Codex needs input",
        subtitle: "cuddly-spoon",
        body: "Approve command",
      },
      "group-1",
    );

    expect(args).toEqual([
      "-title",
      "Codex needs input",
      "-message",
      "Approve command",
      "-subtitle",
      "cuddly-spoon",
      "-group",
      "group-1",
      "-sound",
      "default",
    ]);
  });

  it("runs terminal-notifier with a unique group per notification", async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const notifier = new TerminalNotifier(run, () => "fixed-group");

    await notifier.notify({ title: "Codex completed", body: "Done" });

    expect(run).toHaveBeenCalledWith("terminal-notifier", [
      "-title",
      "Codex completed",
      "-message",
      "Done",
      "-group",
      "fixed-group",
      "-sound",
      "default",
    ]);
  });

  it("generates a distinct group for each notification by default", async () => {
    const groups: string[] = [];
    const run = vi.fn(async (_cmd: string, args: string[]) => {
      groups.push(args[args.indexOf("-group") + 1]);
    });
    const notifier = new TerminalNotifier(run);

    await notifier.notify({ title: "t", body: "b" });
    await notifier.notify({ title: "t", body: "b" });

    expect(groups[0]).not.toBe(groups[1]);
  });

  it("propagates runner failures", async () => {
    const run = vi.fn().mockRejectedValue(new Error("not installed"));
    const notifier = new TerminalNotifier(run);

    await expect(notifier.notify({ title: "t", body: "b" })).rejects.toThrow("not installed");
  });
});

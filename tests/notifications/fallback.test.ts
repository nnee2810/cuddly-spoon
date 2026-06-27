import { describe, expect, it, vi } from "vitest";
import { FallbackNotifier } from "../../src/notifications/fallback.js";
import type { Notification, Notifier } from "../../src/notifications/types.js";

const notification: Notification = { title: "t", body: "b" };

function stub(impl: () => Promise<void>): Notifier {
  return { notify: vi.fn(impl) };
}

describe("FallbackNotifier", () => {
  it("uses the first notifier when it succeeds and skips the rest", async () => {
    const second = stub(async () => undefined);
    const first = stub(async () => undefined);
    const notifier = new FallbackNotifier([first, second]);

    await notifier.notify(notification);

    expect(first.notify).toHaveBeenCalledWith(notification);
    expect(second.notify).not.toHaveBeenCalled();
  });

  it("falls through to the next notifier when one throws", async () => {
    const first = stub(async () => {
      throw new Error("terminal-notifier missing");
    });
    const second = stub(async () => undefined);
    const notifier = new FallbackNotifier([first, second]);

    await notifier.notify(notification);

    expect(first.notify).toHaveBeenCalled();
    expect(second.notify).toHaveBeenCalledWith(notification);
  });

  it("throws when every notifier fails", async () => {
    const first = stub(async () => {
      throw new Error("fail 1");
    });
    const second = stub(async () => {
      throw new Error("fail 2");
    });
    const notifier = new FallbackNotifier([first, second]);

    await expect(notifier.notify(notification)).rejects.toThrow();
  });

  it("rejects an empty notifier list", () => {
    expect(() => new FallbackNotifier([])).toThrow();
  });
});

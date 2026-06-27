import { MacOsNotifier } from "./macos.js";
import { TerminalNotifier } from "./terminal-notifier.js";
import type { Notification, Notifier } from "./types.js";

export class FallbackNotifier implements Notifier {
  constructor(private readonly notifiers: Notifier[]) {
    if (notifiers.length === 0) {
      throw new Error("FallbackNotifier requires at least one notifier");
    }
  }

  async notify(notification: Notification): Promise<void> {
    const errors: unknown[] = [];

    for (const notifier of this.notifiers) {
      try {
        await notifier.notify(notification);
        return;
      } catch (error) {
        errors.push(error);
      }
    }

    throw new AggregateError(errors, "All notifiers failed to deliver the notification");
  }
}

/**
 * Default notifier for macOS: prefer terminal-notifier (more reliable banners),
 * fall back to osascript when terminal-notifier is not installed or fails.
 */
export function createDefaultNotifier(): Notifier {
  return new FallbackNotifier([new TerminalNotifier(), new MacOsNotifier()]);
}

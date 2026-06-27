import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Notification, Notifier } from "./types.js";

type OsascriptRunner = (args: string[]) => Promise<void>;

const execFileAsync = promisify(execFile);

export class MacOsNotifier implements Notifier {
  constructor(private readonly runOsascript: OsascriptRunner = defaultOsascriptRunner) {}

  async notify(notification: Notification): Promise<void> {
    const script = buildDisplayNotificationScript(notification);

    await this.runOsascript(["-e", script]);
  }
}

export function buildDisplayNotificationScript(notification: Notification): string {
  const parts = [
    `display notification "${escapeAppleScriptString(notification.body)}"`,
    `with title "${escapeAppleScriptString(notification.title)}"`,
  ];

  if (notification.subtitle) {
    parts.push(`subtitle "${escapeAppleScriptString(notification.subtitle)}"`);
  }

  return parts.join(" ");
}

function escapeAppleScriptString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function defaultOsascriptRunner(args: string[]): Promise<void> {
  await execFileAsync("osascript", args);
}

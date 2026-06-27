import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Notification, Notifier } from "./types.js";

type CommandRunner = (command: string, args: string[]) => Promise<void>;
type GroupIdFactory = () => string;

const execFileAsync = promisify(execFile);

let groupCounter = 0;

/**
 * terminal-notifier 2.0 groups all notifications under one default id, so
 * macOS keeps only the latest and repeats never re-alert. A unique group per
 * notification makes each one distinct, so every call shows.
 */
function defaultGroupId(): string {
  groupCounter += 1;
  return `mcp-notification-${Date.now()}-${groupCounter}`;
}

export class TerminalNotifier implements Notifier {
  constructor(
    private readonly run: CommandRunner = defaultRunner,
    private readonly groupId: GroupIdFactory = defaultGroupId,
  ) {}

  async notify(notification: Notification): Promise<void> {
    await this.run("terminal-notifier", buildTerminalNotifierArgs(notification, this.groupId()));
  }
}

export function buildTerminalNotifierArgs(notification: Notification, group?: string): string[] {
  const args = ["-title", notification.title, "-message", notification.body];

  if (notification.subtitle) {
    args.push("-subtitle", notification.subtitle);
  }
  if (group) {
    args.push("-group", group);
  }
  args.push("-sound", "default");
  return args;
}

async function defaultRunner(command: string, args: string[]): Promise<void> {
  await execFileAsync(command, args);
}

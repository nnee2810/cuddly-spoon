import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Notification, Notifier } from "./types.js";

type CommandRunner = (command: string, args: string[]) => Promise<void>;

const execFileAsync = promisify(execFile);

export class TerminalNotifier implements Notifier {
  constructor(private readonly run: CommandRunner = defaultRunner) {}

  async notify(notification: Notification): Promise<void> {
    await this.run("terminal-notifier", buildTerminalNotifierArgs(notification));
  }
}

export function buildTerminalNotifierArgs(notification: Notification): string[] {
  const args = ["-title", notification.title, "-message", notification.body];

  if (notification.subtitle) {
    args.push("-subtitle", notification.subtitle);
  }

  args.push("-sound", "default");
  return args;
}

async function defaultRunner(command: string, args: string[]): Promise<void> {
  await execFileAsync(command, args);
}

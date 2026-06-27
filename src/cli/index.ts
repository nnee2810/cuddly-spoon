#!/usr/bin/env node
import { homedir } from "node:os";
import { join } from "node:path";
import {
  adaptClaudePayload,
  adaptCodexPayload,
  type NormalizedEvent,
} from "./adapters.js";
import {
  notifyChatComplete,
  notifyUserActionRequired,
} from "../events/handlers.js";
import { createDefaultNotifier } from "../notifications/fallback.js";
import type { Notifier } from "../notifications/types.js";
import {
  installClaude,
  installCodex,
  resolveCliEntry,
  uninstallClaude,
  uninstallCodex,
} from "./install.js";

export async function handleHookPayload(
  raw: string,
  adapt: (payload: unknown, cwd: string) => NormalizedEvent,
  deps: { notifier: Notifier; cwd: string },
): Promise<{ delivered: boolean }> {
  const event = adapt(JSON.parse(raw), deps.cwd);
  if (!event) {
    return { delivered: false };
  }
  if (event.kind === "chat_complete") {
    await notifyChatComplete(event.input, { notifier: deps.notifier });
  } else {
    await notifyUserActionRequired(event.input, { notifier: deps.notifier });
  }
  return { delivered: true };
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function runConfig(command: "install" | "uninstall", flags: string[]): void {
  const both = !flags.includes("--claude") && !flags.includes("--codex");
  const cliEntry = resolveCliEntry();
  const claudePath = join(homedir(), ".claude", "settings.json");
  const codexPath = join(homedir(), ".codex", "config.toml");

  if (both || flags.includes("--claude")) {
    const result = command === "install" ? installClaude(claudePath, cliEntry) : uninstallClaude(claudePath);
    console.log(result.message);
  }
  if (both || flags.includes("--codex")) {
    const result = command === "install" ? installCodex(codexPath, cliEntry) : uninstallCodex(codexPath);
    console.log(result.message);
  }
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  const deps = { notifier: createDefaultNotifier(), cwd: process.cwd() };

  switch (command) {
    case "claude-hook":
      await handleHookPayload(await readStdin(), adaptClaudePayload, deps);
      return;
    case "codex-hook":
      await handleHookPayload(process.argv[3] ?? "", adaptCodexPayload, deps);
      return;
    case "install":
    case "uninstall":
      runConfig(command, rest);
      return;
    default:
      console.error("Usage: notify-cli <claude-hook|codex-hook|install|uninstall> [--claude|--codex]");
      process.exitCode = 1;
  }
}

const invokedDirectly = process.argv[1]?.endsWith("cli/index.js");
if (invokedDirectly) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

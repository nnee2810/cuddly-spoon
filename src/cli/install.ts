import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const HOOK_MARKER = "dist/cli/index.js";

export interface InstallResult {
  changed: boolean;
  message: string;
  backupPath?: string;
}

export function resolveCliEntry(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "index.js");
}

export function claudeCommand(cliEntry: string): string {
  return `node ${cliEntry} claude-hook`;
}

function backupIfExists(path: string): string | undefined {
  if (!existsSync(path)) {
    return undefined;
  }
  const backupPath = `${path}.bak`;
  copyFileSync(path, backupPath);
  return backupPath;
}

function writeFile(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

interface ClaudeHookEntry {
  matcher?: string;
  hooks?: Array<{ type?: string; command?: string }>;
}

function entryHasMarker(entry: ClaudeHookEntry): boolean {
  return Boolean(
    entry.hooks?.some((hook) => typeof hook.command === "string" && hook.command.includes(HOOK_MARKER)),
  );
}

function upsertClaudeHook(entries: ClaudeHookEntry[], command: string): void {
  for (const entry of entries) {
    const hook = entry.hooks?.find(
      (item) => typeof item.command === "string" && item.command.includes(HOOK_MARKER),
    );
    if (hook) {
      hook.command = command;
      return;
    }
  }
  entries.push({ hooks: [{ type: "command", command }] });
}

export function installClaude(settingsPath: string, cliEntry: string): InstallResult {
  const raw = existsSync(settingsPath) ? readFileSync(settingsPath, "utf8") : "";
  const settings = raw.trim() ? (JSON.parse(raw) as Record<string, any>) : {};
  settings.hooks ??= {};
  const command = claudeCommand(cliEntry);

  for (const event of ["Stop", "Notification"] as const) {
    settings.hooks[event] ??= [];
    upsertClaudeHook(settings.hooks[event] as ClaudeHookEntry[], command);
  }

  const backupPath = backupIfExists(settingsPath);
  writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
  return { changed: true, message: `Patched ${settingsPath} (Stop, Notification hooks).`, backupPath };
}

export function uninstallClaude(settingsPath: string): InstallResult {
  if (!existsSync(settingsPath)) {
    return { changed: false, message: `No file at ${settingsPath}.` };
  }
  const settings = JSON.parse(readFileSync(settingsPath, "utf8") || "{}") as Record<string, any>;
  let changed = false;

  for (const event of ["Stop", "Notification"] as const) {
    const arr = settings.hooks?.[event] as ClaudeHookEntry[] | undefined;
    if (!Array.isArray(arr)) {
      continue;
    }
    const filtered = arr.filter((entry) => !entryHasMarker(entry));
    if (filtered.length !== arr.length) {
      changed = true;
      if (filtered.length) {
        settings.hooks[event] = filtered;
      } else {
        delete settings.hooks[event];
      }
    }
  }

  if (!changed) {
    return { changed: false, message: `No notify-cli hooks found in ${settingsPath}.` };
  }
  if (settings.hooks && Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }
  backupIfExists(settingsPath);
  writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
  return { changed: true, message: `Removed notify-cli hooks from ${settingsPath}.` };
}

const NOTIFY_RE = /^[ \t]*notify[ \t]*=.*$/m;

function codexNotifyLine(cliEntry: string): string {
  return `notify = ["node", ${JSON.stringify(cliEntry)}, "codex-hook"]`;
}

export function installCodex(configPath: string, cliEntry: string): InstallResult {
  const raw = existsSync(configPath) ? readFileSync(configPath, "utf8") : "";
  const notifyLine = codexNotifyLine(cliEntry);
  const match = raw.match(NOTIFY_RE);

  let next: string;
  if (!match) {
    next = raw.length === 0 || raw.endsWith("\n") ? `${raw}${notifyLine}\n` : `${raw}\n${notifyLine}\n`;
  } else if (match[0].includes(HOOK_MARKER)) {
    next = raw.replace(NOTIFY_RE, notifyLine);
  } else {
    return {
      changed: false,
      message: `Codex already has a 'notify' in ${configPath}; left unchanged.\nTo use notify-cli, set:\n  ${notifyLine}`,
    };
  }

  const backupPath = backupIfExists(configPath);
  writeFile(configPath, next);
  return { changed: true, message: `Set notify in ${configPath}.`, backupPath };
}

export function uninstallCodex(configPath: string): InstallResult {
  if (!existsSync(configPath)) {
    return { changed: false, message: `No file at ${configPath}.` };
  }
  const raw = readFileSync(configPath, "utf8");
  const match = raw.match(NOTIFY_RE);
  if (!match) {
    return { changed: false, message: `No notify line in ${configPath}.` };
  }
  if (!match[0].includes(HOOK_MARKER)) {
    return { changed: false, message: `'notify' in ${configPath} is not notify-cli's; left unchanged.` };
  }
  backupIfExists(configPath);
  const next = raw.replace(new RegExp(`${NOTIFY_RE.source}\\n?`, "m"), "");
  writeFile(configPath, next);
  return { changed: true, message: `Removed notify from ${configPath}.` };
}

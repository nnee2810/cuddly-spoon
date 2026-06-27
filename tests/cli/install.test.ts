import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  claudeCommand,
  installClaude,
  installCodex,
  uninstallClaude,
  uninstallCodex,
} from "../../src/cli/install.js";

const CLI = "/abs/repo/dist/cli/index.js";
const dirs: string[] = [];

function tmp(): string {
  const dir = mkdtempSync(join(tmpdir(), "notify-cli-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("claudeCommand", () => {
  it("builds the node invocation", () => {
    expect(claudeCommand(CLI)).toBe(`node ${CLI} claude-hook`);
  });
});

describe("installClaude", () => {
  it("creates settings.json with Stop and Notification hooks", () => {
    const path = join(tmp(), "settings.json");
    const result = installClaude(path, CLI);

    expect(result.changed).toBe(true);
    const settings = JSON.parse(readFileSync(path, "utf8"));
    expect(settings.hooks.Stop[0].hooks[0].command).toBe(`node ${CLI} claude-hook`);
    expect(settings.hooks.Notification[0].hooks[0].command).toBe(`node ${CLI} claude-hook`);
  });

  it("preserves an existing unrelated hook and backs up", () => {
    const path = join(tmp(), "settings.json");
    writeFileSync(
      path,
      JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: "command", command: "echo hi" }] }] } }),
    );

    installClaude(path, CLI);

    const settings = JSON.parse(readFileSync(path, "utf8"));
    const commands = settings.hooks.Stop.flatMap((e: any) => e.hooks.map((h: any) => h.command));
    expect(commands).toContain("echo hi");
    expect(commands).toContain(`node ${CLI} claude-hook`);
    expect(existsSync(`${path}.bak`)).toBe(true);
  });

  it("is idempotent and updates the path on re-run", () => {
    const path = join(tmp(), "settings.json");
    installClaude(path, CLI);
    installClaude(path, "/abs/repo/dist/cli/index.js");
    const result = installClaude(path, "/new/repo/dist/cli/index.js");

    const settings = JSON.parse(readFileSync(path, "utf8"));
    expect(settings.hooks.Stop).toHaveLength(1);
    expect(settings.hooks.Stop[0].hooks[0].command).toBe("node /new/repo/dist/cli/index.js claude-hook");
    expect(result.changed).toBe(true);
  });
});

describe("uninstallClaude", () => {
  it("removes only the notify-cli hooks", () => {
    const path = join(tmp(), "settings.json");
    writeFileSync(
      path,
      JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: "command", command: "echo hi" }] }] } }),
    );
    installClaude(path, CLI);

    const result = uninstallClaude(path);

    expect(result.changed).toBe(true);
    const settings = JSON.parse(readFileSync(path, "utf8"));
    const commands = settings.hooks.Stop.flatMap((e: any) => e.hooks.map((h: any) => h.command));
    expect(commands).toEqual(["echo hi"]);
    expect(settings.hooks.Notification).toBeUndefined();
  });

  it("reports no change when nothing matches", () => {
    const path = join(tmp(), "settings.json");
    writeFileSync(path, JSON.stringify({ hooks: {} }));
    expect(uninstallClaude(path).changed).toBe(false);
  });
});

describe("installCodex", () => {
  it("sets notify in a fresh file", () => {
    const path = join(tmp(), "config.toml");
    const result = installCodex(path, CLI);

    expect(result.changed).toBe(true);
    expect(readFileSync(path, "utf8")).toContain(`notify = ["node", "${CLI}", "codex-hook"]`);
  });

  it("updates an existing notify-cli marker and preserves other content", () => {
    const path = join(tmp(), "config.toml");
    writeFileSync(path, `model = "o3"\nnotify = ["node", "/old/repo/dist/cli/index.js", "codex-hook"]\n`);

    const result = installCodex(path, CLI);

    const text = readFileSync(path, "utf8");
    expect(result.changed).toBe(true);
    expect(text).toContain('model = "o3"');
    expect(text).toContain(`notify = ["node", "${CLI}", "codex-hook"]`);
    expect(text).not.toContain("/old/repo");
  });

  it("does not overwrite a user-owned notify", () => {
    const path = join(tmp(), "config.toml");
    writeFileSync(path, `notify = ["my-own-notifier"]\n`);

    const result = installCodex(path, CLI);

    expect(result.changed).toBe(false);
    expect(readFileSync(path, "utf8")).toContain(`notify = ["my-own-notifier"]`);
    expect(result.message).toContain("left unchanged");
  });
});

describe("uninstallCodex", () => {
  it("removes our notify line", () => {
    const path = join(tmp(), "config.toml");
    writeFileSync(path, `model = "o3"\n`);
    installCodex(path, CLI);

    const result = uninstallCodex(path);

    expect(result.changed).toBe(true);
    const text = readFileSync(path, "utf8");
    expect(text).toContain('model = "o3"');
    expect(text).not.toContain("notify");
  });

  it("leaves a user-owned notify alone", () => {
    const path = join(tmp(), "config.toml");
    writeFileSync(path, `notify = ["my-own-notifier"]\n`);
    expect(uninstallCodex(path).changed).toBe(false);
  });
});

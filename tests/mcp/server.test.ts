import { describe, expect, it } from "vitest";
import { createNotificationServer } from "../../src/mcp/server.js";
import type { Notifier } from "../../src/notifications/types.js";

describe("MCP notification server", () => {
  it("creates the server without starting a transport", () => {
    const notifier: Notifier = {
      notify: async () => undefined,
    };

    const server = createNotificationServer({ notifier });

    expect(server).toBeDefined();
  });
});

#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createNotificationServer } from "./mcp/server.js";
import { createDefaultNotifier } from "./notifications/fallback.js";

const server = createNotificationServer({
  notifier: createDefaultNotifier(),
});

const transport = new StdioServerTransport();
await server.connect(transport);

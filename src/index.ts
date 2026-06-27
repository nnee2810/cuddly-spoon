#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createNotificationServer } from "./mcp/server.js";
import { MacOsNotifier } from "./notifications/macos.js";

const server = createNotificationServer({
  notifier: new MacOsNotifier(),
});

const transport = new StdioServerTransport();
await server.connect(transport);

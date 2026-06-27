import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  ChatCompleteInputSchema,
  chatCompleteInputShape,
  UserActionRequiredInputSchema,
  userActionRequiredInputShape,
} from "../events/schema.js";
import {
  notifyChatComplete,
  notifyUserActionRequired,
} from "../events/handlers.js";
import type { Notifier } from "../notifications/types.js";

interface CreateNotificationServerOptions {
  notifier: Notifier;
}

export function createNotificationServer(
  options: CreateNotificationServerOptions,
): McpServer {
  const server = new McpServer({
    name: "mcp-notification-server",
    version: "0.1.0",
  });

  server.registerTool(
    "notify_chat_complete",
    {
      title: "Notify chat complete",
      description:
        "Send a local OS notification when Claude, Codex, or another agent completes a chat turn or task.",
      inputSchema: chatCompleteInputShape,
    },
    async (input) => {
      const parsedInput = ChatCompleteInputSchema.parse(input);
      const result = await notifyChatComplete(parsedInput, {
        notifier: options.notifier,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result),
          },
        ],
      };
    },
  );

  server.registerTool(
    "notify_user_action_required",
    {
      title: "Notify user action required",
      description:
        "Send a local OS notification when Claude, Codex, or another agent needs user input, approval, or manual action.",
      inputSchema: userActionRequiredInputShape,
    },
    async (input) => {
      const parsedInput = UserActionRequiredInputSchema.parse(input);
      const result = await notifyUserActionRequired(parsedInput, {
        notifier: options.notifier,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result),
          },
        ],
      };
    },
  );

  return server;
}

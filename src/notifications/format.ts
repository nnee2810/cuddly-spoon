import type {
  ChatCompleteInput,
  Notification,
  UserActionRequiredInput,
} from "./types.js";

export function toDisplaySource(source: string): string {
  return source
    .trim()
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function formatChatCompleteNotification(
  input: ChatCompleteInput,
): Notification {
  return {
    title: `${toDisplaySource(input.source)} completed`,
    subtitle: input.workspace,
    body: appendActionUrl(input.summary ?? "Task completed.", input.actionUrl),
  };
}

export function formatUserActionRequiredNotification(
  input: UserActionRequiredInput,
): Notification {
  return {
    title: `${toDisplaySource(input.source)} needs input`,
    subtitle: input.workspace,
    body: appendActionUrl(input.request, input.actionUrl),
  };
}

function appendActionUrl(body: string, actionUrl: string | undefined): string {
  if (!actionUrl) {
    return body;
  }

  return `${body}\nOpen: ${actionUrl}`;
}

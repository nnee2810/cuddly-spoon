import {
  formatChatCompleteNotification,
  formatUserActionRequiredNotification,
} from "../notifications/format.js";
import type {
  ChatCompleteInput,
  DeliveryResult,
  Notifier,
  UserActionRequiredInput,
} from "../notifications/types.js";

interface HandlerDependencies {
  notifier: Notifier;
}

export async function notifyChatComplete(
  input: ChatCompleteInput,
  dependencies: HandlerDependencies,
): Promise<DeliveryResult> {
  const notification = formatChatCompleteNotification(input);

  await dependencies.notifier.notify(notification);

  return {
    delivered: true,
    eventType: "chat_complete",
    notificationTitle: notification.title,
  };
}

export async function notifyUserActionRequired(
  input: UserActionRequiredInput,
  dependencies: HandlerDependencies,
): Promise<DeliveryResult> {
  const notification = formatUserActionRequiredNotification(input);

  await dependencies.notifier.notify(notification);

  return {
    delivered: true,
    eventType: "user_action_required",
    notificationTitle: notification.title,
  };
}

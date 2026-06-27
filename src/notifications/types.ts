export type Priority = "low" | "normal" | "high";

export type EventType = "chat_complete" | "user_action_required";

export interface BaseEventInput {
  source: string;
  conversationId?: string;
  workspace?: string;
  priority: Priority;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface ChatCompleteInput extends BaseEventInput {
  summary?: string;
}

export interface UserActionRequiredInput extends BaseEventInput {
  request: string;
}

export interface Notification {
  title: string;
  body: string;
  subtitle?: string;
}

export interface DeliveryResult {
  delivered: true;
  eventType: EventType;
  notificationTitle: string;
}

export interface Notifier {
  notify(notification: Notification): Promise<void>;
}

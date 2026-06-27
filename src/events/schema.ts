import { z } from "zod";
import type {
  ChatCompleteInput,
  Priority,
  UserActionRequiredInput,
} from "../notifications/types.js";

const nonEmptyString = z.string().trim().min(1);
const optionalNonEmptyString = nonEmptyString.optional();

export const PrioritySchema = z.enum(["low", "normal", "high"]);

export const baseEventInputShape = {
  source: nonEmptyString,
  conversationId: optionalNonEmptyString,
  workspace: optionalNonEmptyString,
  priority: PrioritySchema.optional(),
  actionUrl: optionalNonEmptyString,
  metadata: z.record(z.unknown()).optional(),
};

export const chatCompleteInputShape = {
  ...baseEventInputShape,
  summary: optionalNonEmptyString,
};

export const userActionRequiredInputShape = {
  ...baseEventInputShape,
  request: nonEmptyString,
};

export const ChatCompleteInputSchema: z.ZodType<ChatCompleteInput, z.ZodTypeDef, unknown> = z
  .object(chatCompleteInputShape)
  .strict()
  .transform((input) => ({
    ...input,
    priority: (input.priority ?? "normal") as Priority,
  }));

export const UserActionRequiredInputSchema: z.ZodType<UserActionRequiredInput, z.ZodTypeDef, unknown> = z
  .object(userActionRequiredInputShape)
  .strict()
  .transform((input) => ({
    ...input,
    priority: (input.priority ?? "high") as Priority,
  }));

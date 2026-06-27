import { describe, expect, it } from "vitest";
import {
  ChatCompleteInputSchema,
  UserActionRequiredInputSchema,
} from "../../src/events/schema.js";

describe("event input schemas", () => {
  it("normalizes chat complete priority to normal", () => {
    const input = ChatCompleteInputSchema.parse({
      source: "codex",
      workspace: "cuddly-spoon",
      summary: "Finished the task",
    });

    expect(input).toEqual({
      source: "codex",
      workspace: "cuddly-spoon",
      summary: "Finished the task",
      priority: "normal",
    });
  });

  it("normalizes user action priority to high", () => {
    const input = UserActionRequiredInputSchema.parse({
      source: "claude",
      request: "Approve the command",
    });

    expect(input).toEqual({
      source: "claude",
      request: "Approve the command",
      priority: "high",
    });
  });

  it("rejects empty required strings", () => {
    expect(() =>
      ChatCompleteInputSchema.parse({
        source: "   ",
      }),
    ).toThrow();

    expect(() =>
      UserActionRequiredInputSchema.parse({
        source: "codex",
        request: "",
      }),
    ).toThrow();
  });

  it("rejects unknown priority values", () => {
    expect(() =>
      ChatCompleteInputSchema.parse({
        source: "codex",
        priority: "urgent",
      }),
    ).toThrow();
  });
});

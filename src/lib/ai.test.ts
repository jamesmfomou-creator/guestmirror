import { describe, expect, it } from "vitest";
import Anthropic, { APIError, APIConnectionError, APIConnectionTimeoutError } from "@anthropic-ai/sdk";
import { categorizeAnthropicError, validateAiResponse } from "./ai";

// APIError.generate is the same factory the real SDK uses internally to
// build the right error subclass from an HTTP response -- using it here
// (rather than hand-rolling fakes) means these tests exercise real
// `instanceof` checks against the actual SDK classes categorizeAnthropicError
// switches on.
function sdkErrorFor(status: number) {
  return APIError.generate(status, { error: { message: "test" } }, "test", new Headers());
}

describe("categorizeAnthropicError", () => {
  it("maps a 429 to ai_rate_limited", () => {
    expect(categorizeAnthropicError(sdkErrorFor(429))).toBe("ai_rate_limited");
  });

  it("maps a 400 to ai_invalid_request", () => {
    expect(categorizeAnthropicError(sdkErrorFor(400))).toBe("ai_invalid_request");
  });

  it("maps a 401/403 to ai_auth_error", () => {
    expect(categorizeAnthropicError(sdkErrorFor(401))).toBe("ai_auth_error");
    expect(categorizeAnthropicError(sdkErrorFor(403))).toBe("ai_auth_error");
  });

  it("maps a 500+ to ai_overloaded", () => {
    expect(categorizeAnthropicError(sdkErrorFor(500))).toBe("ai_overloaded");
    expect(categorizeAnthropicError(sdkErrorFor(529))).toBe("ai_overloaded");
  });

  it("maps a client-side timeout to ai_timeout", () => {
    expect(categorizeAnthropicError(new APIConnectionTimeoutError())).toBe("ai_timeout");
  });

  it("maps a network-level connection failure to ai_connection_error", () => {
    expect(categorizeAnthropicError(new APIConnectionError({ message: "fetch failed" }))).toBe(
      "ai_connection_error"
    );
  });

  it("falls back to ai_error for anything unrecognized", () => {
    expect(categorizeAnthropicError(new Error("something else entirely"))).toBe("ai_error");
    expect(categorizeAnthropicError("not even an Error instance")).toBe("ai_error");
  });
});

// Minimal valid tool_use response, extended per test for each failure mode.
function baseMessage(overrides: Partial<Anthropic.Message> = {}): Anthropic.Message {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5",
    stop_reason: "tool_use",
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 10 } as Anthropic.Usage,
    content: [
      {
        type: "tool_use",
        id: "tool_1",
        name: "submit_analysis",
        input: { overall_score: 72, summary: "Résumé de test." },
      } as Anthropic.ToolUseBlock,
    ],
    ...overrides,
  } as Anthropic.Message;
}

describe("validateAiResponse", () => {
  it("accepts a well-formed response with a tool_use block", () => {
    const result = validateAiResponse(baseMessage());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.input.overall_score).toBe(72);
    }
  });

  it("flags stop_reason=max_tokens as ai_truncated_response, before any content check", () => {
    const result = validateAiResponse(baseMessage({ stop_reason: "max_tokens", content: [] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("ai_truncated_response");
  });

  it("flags stop_reason=refusal as ai_refused", () => {
    const result = validateAiResponse(baseMessage({ stop_reason: "refusal" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("ai_refused");
  });

  it("flags an empty content array as ai_empty_response", () => {
    const result = validateAiResponse(baseMessage({ content: [] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("ai_empty_response");
  });

  it("flags a missing tool_use block as ai_tool_missing", () => {
    const result = validateAiResponse(
      baseMessage({ content: [{ type: "text", text: "no tool call" } as Anthropic.TextBlock] })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("ai_tool_missing");
  });

  it("flags a tool_use response missing overall_score/summary as ai_schema_mismatch", () => {
    const result = validateAiResponse(
      baseMessage({
        content: [
          { type: "tool_use", id: "tool_1", name: "submit_analysis", input: { summary: "ok" } } as Anthropic.ToolUseBlock,
        ],
      })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("ai_schema_mismatch");
  });
});

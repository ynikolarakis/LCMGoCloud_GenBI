import { describe, it, expect, beforeEach } from "vitest";
import { useChatStore } from "../../src/stores/chatStore";
import type { QueryResponse } from "../../src/types/api";

const mockResponse: QueryResponse = {
  id: "resp-1",
  connection_id: "conn-1",
  conversation_id: "conv-1",
  question: "How many users?",
  sql: "SELECT COUNT(*) FROM users",
  explanation: "There are 42 users.",
  columns: ["count"],
  rows: [[42]],
  row_count: 1,
  execution_time_ms: 50,
  follow_up_questions: ["What are their names?"],
  created_at: "2025-01-01",
};

describe("chatStore", () => {
  beforeEach(() => {
    useChatStore.getState().clearChat();
    useChatStore.setState({ connectionId: null });
  });

  it("starts with empty state", () => {
    const state = useChatStore.getState();
    expect(state.messages).toEqual([]);
    expect(state.conversationId).toBeNull();
    expect(state.isLoading).toBe(false);
    expect(state.connectionId).toBeNull();
  });

  it("setConnectionId updates connectionId", () => {
    useChatStore.getState().setConnectionId("conn-1");
    expect(useChatStore.getState().connectionId).toBe("conn-1");
  });

  it("addUserMessage appends a user message", () => {
    useChatStore.getState().addUserMessage("Hello");
    const msgs = useChatStore.getState().messages;
    expect(msgs).toHaveLength(1);
    expect(msgs[0].role).toBe("user");
    expect(msgs[0].content).toBe("Hello");
    expect(msgs[0].id).toBeTruthy();
    expect(msgs[0].timestamp).toBeGreaterThan(0);
  });

  it("addAssistantMessage appends an assistant message and sets conversationId", () => {
    useChatStore.getState().addAssistantMessage(mockResponse);
    const state = useChatStore.getState();
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].role).toBe("assistant");
    expect(state.messages[0].content).toBe("There are 42 users.");
    expect(state.messages[0].response).toBe(mockResponse);
    expect(state.conversationId).toBe("conv-1");
  });

  it("addErrorMessage appends an error message", () => {
    useChatStore.getState().addErrorMessage("Something failed");
    const msgs = useChatStore.getState().messages;
    expect(msgs).toHaveLength(1);
    expect(msgs[0].role).toBe("assistant");
    expect(msgs[0].error).toBe("Something failed");
    expect(msgs[0].content).toBe("");
  });

  it("setLoading toggles isLoading", () => {
    useChatStore.getState().setLoading(true);
    expect(useChatStore.getState().isLoading).toBe(true);
    useChatStore.getState().setLoading(false);
    expect(useChatStore.getState().isLoading).toBe(false);
  });

  it("clearChat resets messages and conversationId", () => {
    useChatStore.getState().addUserMessage("Hello");
    useChatStore.getState().addAssistantMessage(mockResponse);
    useChatStore.getState().clearChat();
    const state = useChatStore.getState();
    expect(state.messages).toEqual([]);
    expect(state.conversationId).toBeNull();
  });

  it("getHistory returns conversation turns", () => {
    useChatStore.getState().addUserMessage("How many users?");
    useChatStore.getState().addAssistantMessage(mockResponse);
    const history = useChatStore.getState().getHistory();
    expect(history).toHaveLength(2);
    expect(history[0]).toEqual({ role: "user", question: "How many users?" });
    expect(history[1]).toEqual({
      role: "assistant",
      question: "How many users?",
      sql: "SELECT COUNT(*) FROM users",
      answer: "There are 42 users.",
    });
  });

  it("getHistory skips error messages", () => {
    useChatStore.getState().addUserMessage("bad question");
    useChatStore.getState().addErrorMessage("failed");
    const history = useChatStore.getState().getHistory();
    expect(history).toHaveLength(1);
    expect(history[0].role).toBe("user");
  });

  it("multiple messages accumulate in order", () => {
    useChatStore.getState().addUserMessage("First");
    useChatStore.getState().addUserMessage("Second");
    useChatStore.getState().addAssistantMessage(mockResponse);
    expect(useChatStore.getState().messages).toHaveLength(3);
    expect(useChatStore.getState().messages[0].content).toBe("First");
    expect(useChatStore.getState().messages[1].content).toBe("Second");
    expect(useChatStore.getState().messages[2].role).toBe("assistant");
  });
});
